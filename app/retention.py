"""Delete complete local trial datasets without leaving orphaned evidence or tokens."""

from datetime import timedelta

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from . import deployment
from .entities import (
    Account,
    Alert,
    AlertSettings,
    AppSession,
    AppUser,
    AuditRecord,
    Finding,
    Incident,
    IncidentExplanation,
    OAuthAttempt,
    OAuthCredential,
    Recommendation,
    RequestBudget,
    ScanJob,
    ScanSchedule,
    SenderHistory,
    Signal,
    Source,
    TrustedSender,
    utcnow,
)
from .platform import lock_account


def delete_account_data(
    db: Session, tenant: str, account_id: str, *, expired: bool = False, commit: bool = True
) -> None:
    account = lock_account(db, tenant, account_id)
    sources = select(Source.id).where(Source.account_id == account_id, Source.tenant_id == tenant)
    incidents = select(Incident.id).where(
        Incident.account_id == account_id, Incident.tenant_id == tenant
    )
    signals = select(Signal.id).where(Signal.account_id == account_id, Signal.tenant_id == tenant)
    references = list(db.scalars(sources)) + list(
        db.scalars(select(ScanJob.id).where(ScanJob.source_id.in_(sources)))
    )
    for index in range(0, len(references), 100):
        db.execute(
            delete(AuditRecord).where(
                AuditRecord.tenant_id == tenant,
                AuditRecord.action.in_(
                    (
                        "scan_queued",
                        "scan_failed",
                        "scan_completed",
                        "schedule_enabled",
                        "schedule_paused",
                    )
                ),
                or_(
                    *(
                        AuditRecord.detail.contains(value)
                        for value in references[index : index + 100]
                    )
                ),
            )
        )
    db.execute(delete(Finding).where(Finding.signal_id.in_(signals)))
    db.execute(delete(IncidentExplanation).where(IncidentExplanation.incident_id.in_(incidents)))
    db.execute(delete(Recommendation).where(Recommendation.incident_id.in_(incidents)))
    db.execute(delete(Alert).where(Alert.incident_id.in_(incidents)))
    db.execute(delete(AuditRecord).where(AuditRecord.incident_id.in_(incidents)))
    db.execute(delete(Signal).where(Signal.account_id == account_id, Signal.tenant_id == tenant))
    db.execute(
        delete(SenderHistory).where(
            SenderHistory.account_id == account_id, SenderHistory.tenant_id == tenant
        )
    )
    db.execute(
        delete(Incident).where(Incident.account_id == account_id, Incident.tenant_id == tenant)
    )
    db.execute(delete(ScanSchedule).where(ScanSchedule.source_id.in_(sources)))
    db.execute(delete(ScanJob).where(ScanJob.source_id.in_(sources)))
    db.execute(delete(OAuthCredential).where(OAuthCredential.source_id.in_(sources)))
    db.execute(
        delete(OAuthAttempt).where(
            OAuthAttempt.tenant_id == tenant, OAuthAttempt.email == account.email
        )
    )
    db.execute(delete(Source).where(Source.account_id == account_id, Source.tenant_id == tenant))
    db.execute(delete(Account).where(Account.id == account_id, Account.tenant_id == tenant))
    # Receipt contains no account ID, email, message identifier, or private content.
    db.add(
        AuditRecord(
            tenant_id=tenant,
            actor="system" if expired else "user",
            action="trial_expired" if expired else "account_data_deleted",
            detail="Local account evidence and consent removed.",
        )
    )
    if commit:
        db.commit()
    else:
        db.flush()


def purge_workspace(db: Session, tenant: str) -> None:
    """Resume a deletion barrier; erase only the server-owned workspace and identity."""
    user = db.scalar(select(AppUser).where(AppUser.tenant_id == tenant).with_for_update())
    if user is None or user.status != "deleting":
        raise ValueError("Workspace deletion must first revoke account access.")
    account_ids = list(db.scalars(select(Account.id).where(Account.tenant_id == tenant)))
    for account_id in account_ids:
        delete_account_data(db, tenant, account_id, commit=False)
    db.execute(delete(TrustedSender).where(TrustedSender.tenant_id == tenant))
    db.execute(delete(AlertSettings).where(AlertSettings.tenant_id == tenant))
    db.execute(delete(OAuthAttempt).where(OAuthAttempt.tenant_id == tenant))
    db.execute(delete(RequestBudget).where(RequestBudget.tenant_id == tenant))
    db.execute(delete(AuditRecord).where(AuditRecord.tenant_id == tenant))
    db.execute(delete(AppSession).where(AppSession.user_id == user.id))
    db.execute(delete(AppUser).where(AppUser.id == user.id))
    db.add(
        AuditRecord(
            tenant_id="system",
            actor="system",
            action="workspace_deleted",
            detail="Workspace deletion completed; no identity retained in this receipt.",
        )
    )
    db.commit()


def expire_workspace_evidence(db: Session, tenant: str) -> int:
    """Expire complete cases and no-match telemetry, preserving mailbox connections.

    Case retention starts at creation; all linked evidence expires together so
    a retained case never shows a score whose supporting findings were removed.
    """
    cutoff = utcnow() - timedelta(days=deployment.retention_days())
    user = db.scalar(select(AppUser).where(AppUser.tenant_id == tenant).with_for_update())
    if user is None or user.status != "active":
        return 0
    cases = select(Incident.id).where(Incident.tenant_id == tenant, Incident.created_at < cutoff)
    linked = select(Finding.signal_id).where(
        Finding.tenant_id == tenant, Finding.incident_id.in_(cases)
    )
    expired_signals = select(Signal.id).where(
        Signal.tenant_id == tenant,
        or_(
            (Signal.received_at < cutoff)
            & ~select(Finding.id)
            .where(Finding.signal_id == Signal.id, Finding.incident_id.is_not(None))
            .exists(),
            Signal.id.in_(linked),
        ),
    )
    signal_ids = list(db.scalars(expired_signals))
    case_ids = list(db.scalars(cases))
    for index in range(0, len(case_ids), 100):
        ids = case_ids[index : index + 100]
        db.execute(delete(Finding).where(Finding.incident_id.in_(ids), Finding.tenant_id == tenant))
        db.execute(delete(IncidentExplanation).where(IncidentExplanation.incident_id.in_(ids)))
        db.execute(delete(Recommendation).where(Recommendation.incident_id.in_(ids)))
        db.execute(delete(Alert).where(Alert.incident_id.in_(ids)))
        db.execute(
            delete(AuditRecord).where(
                AuditRecord.incident_id.in_(ids), AuditRecord.tenant_id == tenant
            )
        )
        db.execute(delete(Incident).where(Incident.id.in_(ids), Incident.tenant_id == tenant))
    for index in range(0, len(signal_ids), 100):
        ids = signal_ids[index : index + 100]
        db.execute(delete(Finding).where(Finding.signal_id.in_(ids), Finding.tenant_id == tenant))
        db.execute(delete(Signal).where(Signal.id.in_(ids), Signal.tenant_id == tenant))
    db.execute(delete(ScanJob).where(ScanJob.tenant_id == tenant, ScanJob.created_at < cutoff))
    db.execute(
        delete(AuditRecord).where(AuditRecord.tenant_id == tenant, AuditRecord.created_at < cutoff)
    )
    db.execute(
        delete(SenderHistory).where(
            SenderHistory.tenant_id == tenant, SenderHistory.first_seen_at < cutoff
        )
    )
    db.commit()
    return len(signal_ids)


def production_maintenance(db: Session) -> None:
    if not deployment.production():
        return
    pending = list(db.scalars(select(AppUser.tenant_id).where(AppUser.status == "deleting")))
    for tenant in pending:
        purge_workspace(db, tenant)
    for tenant in list(db.scalars(select(AppUser.tenant_id).where(AppUser.status == "active"))):
        expire_workspace_evidence(db, tenant)


def expire_trials(db: Session) -> int:
    attempts_removed = db.execute(
        delete(OAuthAttempt).where(OAuthAttempt.expires_at <= utcnow())
    ).rowcount
    if attempts_removed:
        db.commit()
    expired = db.execute(
        select(Account.tenant_id, Account.id).where(
            Account.delete_after.is_not(None), Account.delete_after <= utcnow()
        )
    ).all()
    for tenant, account_id in expired:
        delete_account_data(db, tenant, account_id, expired=True)
    return len(expired)
