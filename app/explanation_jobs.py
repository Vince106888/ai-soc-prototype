"""Leased, bounded on-demand explanation queue. Never runs collection or scoring."""

from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, or_, select, text, update

from . import database, explainer
from .entities import ExplanationJob, IncidentExplanation, new_id, utcnow
from .platform import _load_incident


def expire(db, tenant_id=None):
    now = utcnow()
    statement = update(ExplanationJob).where(
        or_(
            (ExplanationJob.status == "queued")
            & (ExplanationJob.created_at < now - timedelta(minutes=30)),
            (ExplanationJob.status == "running")
            & (ExplanationJob.lease_until <= now)
            & (ExplanationJob.attempts >= 3),
        )
    )
    if tenant_id:
        statement = statement.where(ExplanationJob.tenant_id == tenant_id)
    db.execute(
        statement.values(
            status="failed", reason="worker_unavailable", updated_at=now
        ).execution_options(synchronize_session="fetch")
    )
    db.flush()


def enqueue(db, tenant_id, incident):
    latest = max(incident.explanations, key=lambda item: item.created_at)
    if latest.source != "template":
        return None
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(704520147)"))
    expire(db)
    job = db.scalar(
        select(ExplanationJob).where(
            ExplanationJob.incident_id == incident.id,
            ExplanationJob.template_id == latest.id,
            ExplanationJob.tenant_id == tenant_id,
        )
    )
    if job and job.status in {"queued", "running"}:
        return job
    active = (
        select(func.count())
        .select_from(ExplanationJob)
        .where(
            ExplanationJob.status.in_(("queued", "running")),
        )
    )
    if (
        db.scalar(active) >= 8
        or db.scalar(active.where(ExplanationJob.tenant_id == tenant_id)) >= 2
    ):
        raise HTTPException(
            429,
            "Explanation service is busy. The rule-based assessment is ready.",
            headers={"Retry-After": "30"},
        )
    if job is None:
        job = ExplanationJob(tenant_id=tenant_id, incident_id=incident.id, template_id=latest.id)
        db.add(job)
    job.status, job.reason, job.attempts = "queued", None, 0
    job.lease_id = job.lease_until = None
    job.created_at = job.updated_at = utcnow()
    db.flush()
    return job


def process_one(config=None):
    config = config or explainer.settings()
    if not config.enabled:
        return "disabled"
    with database.SessionLocal() as db:
        expire(db)
        now = utcnow()
        job = db.scalar(
            select(ExplanationJob)
            .where(
                or_(
                    ExplanationJob.status == "queued",
                    (ExplanationJob.status == "running")
                    & (ExplanationJob.lease_until <= now)
                    & (ExplanationJob.attempts < 3),
                )
            )
            .order_by(ExplanationJob.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if job is None:
            db.commit()
            return "idle"
        job.status, job.reason, job.lease_id = "running", None, new_id()
        job.lease_until = now + timedelta(seconds=config.timeout + 60)
        job.attempts += 1
        job.updated_at = now
        job_id, lease, incident_id, tenant = job.id, job.lease_id, job.incident_id, job.tenant_id
        template_id = job.template_id
        db.commit()
    try:
        with database.SessionLocal() as db:
            incident = _load_incident(db, tenant, incident_id)
            latest_template = max(incident.explanations, key=lambda item: item.created_at)
            outcome = (
                explainer.explain_incident(db, incident, config)
                if latest_template.id == template_id
                else "evidence_changed"
            )
            if outcome == "not_template":
                latest = db.scalar(
                    select(IncidentExplanation.source)
                    .where(
                        IncidentExplanation.incident_id == incident_id,
                    )
                    .order_by(IncidentExplanation.created_at.desc())
                    .limit(1)
                )
                outcome = "explained" if latest == "ai" else "unavailable"
    except Exception:
        outcome = "unavailable"  # Never persist/log arbitrary provider or database errors.
    with database.SessionLocal() as db:
        db.execute(
            update(ExplanationJob)
            .where(
                ExplanationJob.id == job_id,
                ExplanationJob.lease_id == lease,
            )
            .values(
                status="succeeded" if outcome == "explained" else "failed",
                reason=None if outcome == "explained" else outcome,
                lease_id=None,
                lease_until=None,
                updated_at=utcnow(),
            )
        )
        db.commit()
    return outcome
