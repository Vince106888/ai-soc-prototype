"""Tenant-scoped dashboard totals from retained evidence, independent of list filters."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .entities import Account, Incident, ScanJob, Signal, Source, utcnow


def dashboard_overview(db: Session, tenant: str) -> dict:
    incidents = db.execute(
        select(Incident.status, Incident.severity, func.count())
        .where(Incident.tenant_id == tenant)
        .group_by(Incident.status, Incident.severity)
    ).all()
    totals = {"active": 0, "critical": 0, "under_review": 0, "resolved": 0, "false_positive": 0}
    for status, severity, count in incidents:
        if status in {"new", "under_review"}:
            totals["active"] += count
            if severity == "critical":
                totals["critical"] += count
        if status in totals:
            totals[status] += count
    per_source = db.execute(
        select(Signal.source_id, func.count(), func.max(Signal.received_at))
        .where(Signal.tenant_id == tenant)
        .group_by(Signal.source_id)
    ).all()
    source_activity = {
        source_id: {"signal_count": count, "last_received_at": last}
        for source_id, count, last in per_source
    }
    start = datetime.combine(utcnow().date() - timedelta(days=6), datetime.min.time(), UTC)
    days = {
        (start + timedelta(days=i)).date().isoformat(): {"signals": 0, "incidents": 0}
        for i in range(7)
    }
    for model, timestamp, key in (
        (Signal, Signal.received_at, "signals"),
        (Incident, Incident.created_at, "incidents"),
    ):
        for day, count in db.execute(
            select(func.date(timestamp), func.count())
            .where(model.tenant_id == tenant, timestamp >= start)
            .group_by(func.date(timestamp))
        ):
            if str(day) in days:
                days[str(day)][key] = count
    latest_job = db.scalar(
        select(ScanJob)
        .where(ScanJob.tenant_id == tenant)
        .order_by(ScanJob.created_at.desc())
        .limit(1)
    )
    return {
        "incidents": totals,
        "accounts": db.scalar(
            select(func.count()).select_from(Account).where(Account.tenant_id == tenant)
        ),
        "active_sources": db.scalar(
            select(func.count())
            .select_from(Source)
            .where(Source.tenant_id == tenant, Source.status == "active")
        ),
        "retained_signals": sum(item[1] for item in per_source),
        "source_activity": source_activity,
        "activity": [{"day": day, **counts} for day, counts in days.items()],
        "latest_job": {
            "status": latest_job.status,
            "completed_at": latest_job.completed_at,
            "imported_count": latest_job.imported_count,
        }
        if latest_job
        else None,
    }
