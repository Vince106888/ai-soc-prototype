"""Opt-in schedules with atomic leases, bounded retries and controlled fallback."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from .entities import AuditRecord, ScanSchedule, utcnow
from .platform import ConflictError, get_source
from .platform_schemas import ScheduleUpdate

LEASE_MINUTES = 10
MAX_FAILURES = 3


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def configure_schedule(
    db: Session,
    tenant: str,
    source_id: str,
    payload: ScheduleUpdate,
    *,
    controlled_demo: bool = False,
    actor: str = "user",
) -> ScanSchedule:
    source = get_source(db, tenant, source_id)
    if source.source_type != "gmail" and not (
        controlled_demo and source.source_type == "controlled"
    ):
        raise ConflictError("Schedules require Gmail consent or the explicit controlled-demo CLI.")
    if payload.enabled and (source.status != "active" or not payload.acknowledged):
        raise ConflictError(
            "An active source and separate scheduled-sample acknowledgement are required."
        )
    schedule = db.get(ScanSchedule, source_id)
    if schedule is None:
        schedule = ScanSchedule(source_id=source_id, tenant_id=tenant)
        db.add(schedule)
    schedule.enabled = payload.enabled
    schedule.interval_minutes = payload.interval_minutes
    schedule.maximum_messages = payload.maximum_messages
    schedule.recent_days = payload.recent_days
    schedule.failure_count = 0
    schedule.updated_at = utcnow()
    schedule.next_run_at = utcnow() + timedelta(minutes=payload.interval_minutes)
    db.add(
        AuditRecord(
            tenant_id=tenant,
            actor=actor,
            action="schedule_enabled" if payload.enabled else "schedule_paused",
            detail=f"Source {source_id}; bounded scheduled samples changed.",
        )
    )
    db.commit()
    return schedule


def claim_due(db: Session, now: datetime) -> tuple[str, str, str] | None:
    """Compare-and-set prevents two workers claiming the same due source."""
    eligible = (
        ScanSchedule.enabled.is_(True),
        ScanSchedule.next_run_at <= now,
        or_(ScanSchedule.lease_until.is_(None), ScanSchedule.lease_until <= now),
    )
    source_id = db.scalar(
        select(ScanSchedule.source_id).where(*eligible).order_by(ScanSchedule.next_run_at).limit(1)
    )
    if not source_id:
        return None
    lease = str(uuid4())
    updated = db.execute(
        update(ScanSchedule)
        .where(ScanSchedule.source_id == source_id, *eligible)
        .values(lease_id=lease, lease_until=now + timedelta(minutes=LEASE_MINUTES))
    )
    db.commit()
    if not updated.rowcount:
        return None
    schedule = db.get(ScanSchedule, source_id)
    return schedule.tenant_id, source_id, lease


def complete_lease(db: Session, source_id: str, lease: str, *, succeeded: bool) -> None:
    schedule = db.scalar(
        select(ScanSchedule).where(
            ScanSchedule.source_id == source_id, ScanSchedule.lease_id == lease
        )
    )
    if not schedule:
        return
    schedule.failure_count = 0 if succeeded else schedule.failure_count + 1
    if schedule.failure_count >= MAX_FAILURES:
        schedule.enabled = False
    delay = schedule.interval_minutes if succeeded else min(1440, 15 * 2**schedule.failure_count)
    schedule.next_run_at = utcnow() + timedelta(minutes=delay)
    schedule.lease_id = schedule.lease_until = None
    schedule.updated_at = utcnow()
    db.commit()
