"""Read retained evidence, including no-match signals, without re-evaluating it."""

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from .entities import Finding, Incident, Signal
from .platform import NotFoundError, _incident_item
from .platform_schemas import SignalDetail, SignalListItem, SignalPage


def signal_page(
    db: Session,
    tenant: str,
    *,
    account_id: str | None = None,
    source_id: str | None = None,
    signal_type: str | None = None,
    has_findings: bool | None = None,
    search: str | None = None,
    limit: int = 25,
    offset: int = 0,
) -> SignalPage:
    statement = select(Signal).where(Signal.tenant_id == tenant)
    for column, value in (
        (Signal.account_id, account_id),
        (Signal.source_id, source_id),
        (Signal.signal_type, signal_type),
    ):
        if value:
            statement = statement.where(column == value)
    matching = (
        select(Finding.id)
        .where(Finding.signal_id == Signal.id, Finding.tenant_id == tenant)
        .exists()
    )
    if has_findings is not None:
        statement = statement.where(matching if has_findings else ~matching)
    if search:
        literal = search.casefold().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{literal}%"
        statement = statement.where(
            or_(
                func.lower(Signal.features["sender"].as_string()).like(pattern, escape="\\"),
                func.lower(Signal.features["subject"].as_string()).like(pattern, escape="\\"),
            )
        )
    total = db.scalar(select(func.count()).select_from(statement.subquery()))
    signals = db.scalars(
        statement.options(selectinload(Signal.findings))
        .order_by(Signal.received_at.desc(), Signal.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return SignalPage(
        total=total,
        limit=limit,
        offset=offset,
        items=[
            SignalListItem(
                id=signal.id,
                account_id=signal.account_id,
                source_id=signal.source_id,
                signal_type=signal.signal_type,
                occurred_at=signal.occurred_at,
                received_at=signal.received_at,
                sender=str(signal.features.get("sender", "")),
                subject=str(signal.features.get("subject", "")),
                finding_count=len(signal.findings),
                incident_ids=sorted({f.incident_id for f in signal.findings if f.incident_id}),
            )
            for signal in signals
        ],
    )


def signal_detail(db: Session, tenant: str, signal_id: str) -> SignalDetail:
    signal = db.scalar(
        select(Signal)
        .options(selectinload(Signal.findings))
        .where(Signal.id == signal_id, Signal.tenant_id == tenant)
    )
    if signal is None:
        raise NotFoundError("Signal not found.")
    incident_ids = {finding.incident_id for finding in signal.findings if finding.incident_id}
    incidents = db.scalars(
        select(Incident)
        .options(selectinload(Incident.findings))
        .where(Incident.tenant_id == tenant, Incident.id.in_(incident_ids))
        .order_by(Incident.created_at, Incident.id)
    ).all()
    return SignalDetail(
        **{
            field: getattr(signal, field)
            for field in (
                "id",
                "account_id",
                "source_id",
                "external_id",
                "signal_type",
                "occurred_at",
                "received_at",
                "correlation_key",
                "features",
            )
        },
        findings=signal.findings,
        incidents=[_incident_item(incident) for incident in incidents],
    )
