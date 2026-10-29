"""Executed schedules, leases, retry limits, tenant boundaries and deletion."""

from datetime import timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import database, worker
from app.api import router
from app.entities import AuditRecord, ScanJob, ScanSchedule, utcnow
from app.platform import (
    ConflictError,
    create_account,
    create_scan_job,
    create_source,
    update_source_status,
)
from app.platform_schemas import AccountCreate, ScheduleUpdate, SourceCreate
from app.retention import delete_account_data
from app.scheduling import claim_due, complete_lease, configure_schedule


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.delenv("AI_SOC_API_KEY", raising=False)
    monkeypatch.delenv("AI_SOC_AUTH_MODE", raising=False)
    database.configure_database(f"sqlite:///{(tmp_path / 'schedule.db').as_posix()}")
    database.migrate_schema()
    with database.SessionLocal() as db:
        account = create_account(db, "owner", AccountCreate(email="owner@example.test"))
        source = create_source(
            db,
            "owner",
            account.id,
            SourceCreate(
                name="Controlled schedule",
                external_id="controlled-evaluation",
                capabilities=["email", "forwarding", "signin", "mfa", "oauth_grant"],
            ),
        )
        yield db, account, source


def enable(db, source):
    schedule = configure_schedule(
        db,
        "owner",
        source.id,
        ScheduleUpdate(enabled=True, acknowledged=True),
        controlled_demo=True,
    )
    schedule.next_run_at = utcnow() - timedelta(seconds=1)
    db.commit()
    return schedule


def test_schedule_requires_explicit_mode_and_separate_consent(setup):
    db, _, source = setup
    with pytest.raises(ConflictError):
        configure_schedule(db, "owner", source.id, ScheduleUpdate(enabled=True, acknowledged=True))
    with pytest.raises(ConflictError):
        configure_schedule(
            db,
            "owner",
            source.id,
            ScheduleUpdate(enabled=True, acknowledged=False),
            controlled_demo=True,
        )


def test_worker_executes_and_repeat_is_idempotent(setup):
    db, _, source = setup
    enable(db, source)
    assert worker.run_due() == {"completed": 1, "failed": 0}
    db.expire_all()
    job = db.scalar(select(ScanJob))
    imported = job.imported_count
    assert imported > 0 and job.trigger == "schedule" and job.status == "completed"
    assert job.attempts == 1
    assert worker.run_due() == {"completed": 0, "failed": 0}
    enable(db, source)
    worker.run_due()
    db.expire_all()
    jobs = list(db.scalars(select(ScanJob).order_by(ScanJob.created_at)))
    assert jobs[-1].imported_count == 0 and jobs[-1].duplicate_count == imported
    actions = set(db.scalars(select(AuditRecord.action)))
    assert {"schedule_enabled", "scan_queued", "scan_completed", "guidance_updated"} <= actions


def test_lease_is_exclusive_and_expired_lease_recoverable(setup):
    db, _, source = setup
    schedule = enable(db, source)
    now = utcnow()
    first = claim_due(db, now)
    with database.SessionLocal() as other:
        assert claim_due(other, now) is None
    assert claim_due(db, now + timedelta(minutes=11)) is not None
    complete_lease(db, source.id, first[2], succeeded=True)
    db.refresh(schedule)
    assert schedule.lease_id is not None  # stale worker cannot release the newer lease


def test_three_safe_failures_pause_and_reenable_resets(setup, monkeypatch):
    db, _, source = setup
    schedule = enable(db, source)

    def fail(*args, **kwargs):
        raise RuntimeError("secret-token private body must not be retained")

    monkeypatch.setattr(worker, "ingest_signals", fail)
    for expected in range(1, 4):
        assert worker.run_due() == {"completed": 0, "failed": 1}
        db.refresh(schedule)
        assert schedule.failure_count == expected
        assert schedule.lease_until is None
        assert schedule.next_run_at > utcnow().replace(tzinfo=None)
        schedule.next_run_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert not schedule.enabled
    jobs = list(db.scalars(select(ScanJob)))
    assert all(job.status == "failed" and job.attempts == 1 for job in jobs)
    assert all("secret" not in job.error for job in jobs)
    assert worker.run_due()["failed"] == 0
    enable(db, source)
    assert schedule.enabled and schedule.failure_count == 0


def test_disconnect_pauses_and_deletion_removes_schedule(setup):
    db, account, source = setup
    schedule = enable(db, source)
    update_source_status(db, "owner", source.id, "disconnected")
    assert not schedule.enabled and worker.run_due()["completed"] == 0
    delete_account_data(db, "owner", account.id)
    assert db.scalar(select(ScanSchedule)) is None
    assert source.id not in " ".join(db.scalars(select(AuditRecord.detail)))


def test_worker_recovers_abandoned_job(setup):
    db, _, source = setup
    schedule = enable(db, source)
    old = create_scan_job(db, "owner", source.id, "schedule")
    schedule.last_job_id = old.id
    db.commit()
    assert worker.run_due()["completed"] == 1
    db.refresh(old)
    assert old.status == "failed"


def test_api_tenant_boundary_limits_and_controlled_cli_only(setup):
    _, _, source = setup
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        path = f"/api/v1/sources/{source.id}/schedule"
        assert client.get(path, headers={"X-Tenant-ID": "other"}).status_code == 404
        assert client.get(path, headers={"X-Tenant-ID": "owner"}).json() is None
        payload = {"enabled": True, "acknowledged": True}
        assert client.put(path, headers={"X-Tenant-ID": "owner"}, json=payload).status_code == 409
        payload["interval_minutes"] = 1
        assert client.put(path, headers={"X-Tenant-ID": "owner"}, json=payload).status_code == 422


def test_gmail_schedule_api_and_worker_use_existing_job(setup, monkeypatch):
    db, _, source = setup
    source.source_type = "gmail"
    db.commit()
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        path = f"/api/v1/sources/{source.id}/schedule"
        headers = {"X-Tenant-ID": "owner"}
        result = client.put(
            path,
            headers=headers,
            json={
                "enabled": True,
                "acknowledged": True,
                "maximum_messages": 4,
                "recent_days": 2,
                "interval_minutes": 15,
            },
        )
        assert result.status_code == 200
        assert client.get(path, headers=headers).json()["enabled"]
    schedule = db.get(ScanSchedule, source.id)
    schedule.next_run_at = utcnow() - timedelta(seconds=1)
    db.commit()

    def scan(session, tenant, source_id, maximum, days, *, job_id):
        assert (tenant, source_id, maximum, days) == ("owner", source.id, 4, 2)
        job = session.get(ScanJob, job_id)
        assert job.trigger == "schedule"
        job.status = "completed"
        session.commit()

    monkeypatch.setattr(worker, "scan_mailbox", scan)
    assert worker.run_due()["completed"] == 1


def test_cli_demo_mode_validation(setup, monkeypatch):
    monkeypatch.setattr("sys.argv", ["worker", "--once", "--enable-demo", "--tenant", "missing"])
    with pytest.raises(SystemExit):
        worker.main()
    monkeypatch.setattr("sys.argv", ["worker", "--once", "--enable-demo", "--tenant", "owner"])
    worker.main()


def test_withdrawn_invitation_stops_gmail_schedule(setup, monkeypatch):
    db, _, source = setup
    source.source_type = "gmail"
    db.commit()
    schedule = configure_schedule(
        db, "owner", source.id, ScheduleUpdate(enabled=True, acknowledged=True)
    )
    schedule.next_run_at = utcnow() - timedelta(seconds=1)
    db.commit()
    monkeypatch.setenv("AI_SOC_AUTH_MODE", "google")
    monkeypatch.setenv("AI_SOC_INVITED_EMAILS", "somebody@example.test")
    assert worker.run_due()["failed"] == 1
    db.refresh(schedule)
    assert not schedule.enabled


def test_incident_date_filters_count_and_offset_boundaries(setup):
    db, _, source = setup
    enable(db, source)
    worker.run_due()
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        path = "/api/v1/incidents/page"
        headers = {"X-Tenant-ID": "owner"}
        assert (
            client.get(path, headers=headers, params={"seen_from": "2000-01-01T00:00:00Z"}).json()[
                "total"
            ]
            > 0
        )
        assert (
            client.get(path, headers=headers, params={"seen_to": "2000-01-01T00:00:00Z"}).json()[
                "total"
            ]
            == 0
        )
        assert client.get(path, headers={"X-Tenant-ID": "other"}).json()["total"] == 0
        assert (
            client.get(
                path,
                headers=headers,
                params={"seen_from": "2026-01-02T00:00:00Z", "seen_to": "2026-01-01T00:00:00Z"},
            ).status_code
            == 422
        )
        # Compare actual instants, not clock strings with different offsets.
        assert (
            client.get(
                path,
                headers=headers,
                params={
                    "seen_from": "2026-01-02T00:00:00+03:00",
                    "seen_to": "2026-01-01T23:00:00Z",
                },
            ).status_code
            == 200
        )
