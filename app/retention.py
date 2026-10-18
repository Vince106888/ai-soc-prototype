"""Delete complete local trial datasets without leaving orphaned evidence or tokens."""

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from .entities import (
    Account,
    AuditRecord,
    Finding,
    Incident,
    IncidentExplanation,
    OAuthAttempt,
    OAuthCredential,
    Recommendation,
    ScanJob,
    ScanSchedule,
    SenderHistory,
    Signal,
    Source,
    utcnow,
)
from .platform import get_account


def delete_account_data(
    db: Session, tenant: str, account_id: str, *, expired: bool = False
) -> None:
    account = get_account(db, tenant, account_id)
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
    db.commit()


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
