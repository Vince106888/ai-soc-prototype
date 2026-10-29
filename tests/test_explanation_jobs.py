"""Bounded queue, leases and failures preserve deterministic incident evidence."""

from datetime import timedelta

import pytest
from fastapi import HTTPException
from test_explainer import ENABLED, _incidents
from test_explainer import seeded as seeded

from app import explainer, explanation_jobs
from app.entities import ExplanationJob, utcnow


def test_enqueue_is_idempotent_and_tenant_bounded(seeded):
    db, _, _ = seeded
    cases = _incidents(db)
    first = explanation_jobs.enqueue(db, "owner", cases[0])
    assert explanation_jobs.enqueue(db, "owner", cases[0]).id == first.id
    explanation_jobs.enqueue(db, "owner", cases[1])
    with pytest.raises(HTTPException) as error:
        explanation_jobs.enqueue(db, "owner", cases[2])
    assert error.value.status_code == 429
    assert first.status == "queued"


def test_worker_claims_finishes_and_keeps_scores(seeded, monkeypatch):
    db, _, _ = seeded
    case = _incidents(db)[0]
    score = case.score
    job = explanation_jobs.enqueue(db, "owner", case)
    db.commit()
    job_id = job.id
    seen = []

    def explain(session, incident, config):
        seen.append(incident.id)
        return "explained"

    monkeypatch.setattr(explainer, "explain_incident", explain)
    assert explanation_jobs.process_one(ENABLED) == "explained"
    db.expire_all()
    saved = db.get(ExplanationJob, job_id)
    assert saved.status == "succeeded" and saved.attempts == 1
    assert saved.lease_id is None and case.score == score
    assert seen == [case.id]
    assert explanation_jobs.process_one(ENABLED) == "idle"


def test_expired_leases_stop_and_failed_jobs_can_retry(seeded):
    db, _, _ = seeded
    case = _incidents(db)[0]
    job = explanation_jobs.enqueue(db, "owner", case)
    job.status = "running"
    job.attempts = 3
    job.lease_until = utcnow() - timedelta(seconds=1)
    db.commit()
    explanation_jobs.expire(db, "other")
    db.refresh(job)
    assert job.status == "running"
    explanation_jobs.expire(db, "owner")
    db.refresh(job)
    assert job.status == "failed" and job.reason == "worker_unavailable"
    retried = explanation_jobs.enqueue(db, "owner", case)
    assert retried.id == job.id and retried.attempts == 0
    assert retried.status == "queued" and retried.lease_until is None


def test_provider_exception_is_not_persisted(seeded, monkeypatch):
    db, _, _ = seeded
    job = explanation_jobs.enqueue(db, "owner", _incidents(db)[0])
    db.commit()
    job_id = job.id

    def fail(*args):
        raise RuntimeError("sensitive provider response")

    monkeypatch.setattr(explainer, "explain_incident", fail)
    assert explanation_jobs.process_one(ENABLED) == "unavailable"
    db.expire_all()
    saved = db.get(ExplanationJob, job_id)
    assert saved.status == "failed" and saved.reason == "unavailable"
