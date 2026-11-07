"""The assistant answers only from stored findings, declines action, and is tenant-scoped."""

from datetime import timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import database, worker
from app.api import router
from app.assistant import ask
from app.entities import AuditRecord, Incident, utcnow
from app.platform import create_account, create_source
from app.platform_schemas import AccountCreate, ScheduleUpdate, SourceCreate
from app.scheduling import configure_schedule

H = {"X-Tenant-ID": "owner"}


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.delenv("AI_SOC_API_KEY", raising=False)
    monkeypatch.delenv("AI_SOC_AUTH_MODE", raising=False)
    database.configure_database(f"sqlite:///{(tmp_path / 'assistant.db').as_posix()}")
    database.migrate_schema()
    with database.SessionLocal() as db:
        account = create_account(db, "owner", AccountCreate(email="owner@example.test"))
        source = create_source(
            db,
            "owner",
            account.id,
            SourceCreate(
                name="Controlled",
                external_id="controlled-evaluation",
                capabilities=["email", "forwarding", "signin", "mfa", "oauth_grant"],
            ),
        )
        schedule = configure_schedule(
            db,
            "owner",
            source.id,
            ScheduleUpdate(enabled=True, acknowledged=True),
            controlled_demo=True,
        )
        schedule.next_run_at = utcnow() - timedelta(seconds=1)
        db.commit()
        worker.run_due()
        incident = db.scalars(select(Incident).order_by(Incident.score.desc())).first()
        yield db, incident


def test_incident_answers_use_stored_findings(setup):
    db, incident = setup
    codes = {f.rule_code for f in incident.findings}
    why = ask(db, "owner", "Why was this flagged?", incident.id)
    assert why.topic == "why" and why.grounded_in == "incident"
    assert set(why.references) == codes
    score = ask(db, "owner", "What does the score mean?", incident.id)
    assert str(round(incident.score * 100)) in score.answer
    assert "not the probability" in score.answer
    nxt = ask(db, "owner", "What should I do next?", incident.id)
    assert "advisory" in nxt.answer.lower()
    legit = ask(db, "owner", "Could this be legitimate?", incident.id)
    assert "cannot certify" in legit.answer


def test_rule_question_and_unknown_rule(setup):
    db, incident = setup
    reply = ask(db, "owner", "What is EMAIL-002?", incident.id)
    assert reply.topic == "rule" and reply.references == ["EMAIL-002"]
    assert "weight" in reply.answer
    unknown = ask(db, "owner", "Explain ZZZ-999", None)
    assert "don't have a rule" in unknown.answer


def test_requests_for_action_are_declined(setup):
    db, incident = setup
    for text in ("Delete this email for me", "block the sender and reset my password"):
        reply = ask(db, "owner", text, incident.id)
        assert reply.topic == "remediation"
        assert "can't do that" in reply.answer


def test_general_topics_and_fallback_without_incident(setup):
    db, _ = setup
    assert ask(db, "owner", "What do you store?", None).topic == "privacy"
    assert ask(db, "owner", "How do automatic scans work?", None).topic == "scanning"
    assert ask(db, "owner", "how do alerts work", None).topic == "alerts"
    assert ask(db, "owner", "tell me a joke", None).topic == "fallback"


def test_audit_keeps_topic_not_question(setup):
    db, incident = setup
    ask(db, "owner", "secret-question-text about this", incident.id)
    details = " ".join(db.scalars(select(AuditRecord.detail)))
    assert "secret-question-text" not in details
    assert "assistant_asked" in set(db.scalars(select(AuditRecord.action)))


def test_api_is_tenant_scoped_and_validates(setup):
    _, incident = setup
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        ok = client.post(
            "/api/v1/assistant",
            headers=H,
            json={"question": "Why was this flagged?", "incident_id": incident.id},
        )
        assert ok.status_code == 200 and ok.json()["source"] == "grounded"
        other = client.post(
            "/api/v1/assistant",
            headers={"X-Tenant-ID": "other"},
            json={"question": "Why?", "incident_id": incident.id},
        )
        assert other.status_code == 404
        assert (
            client.post("/api/v1/assistant", headers=H, json={"question": "x"}).status_code == 422
        )
        long = client.post("/api/v1/assistant", headers=H, json={"question": "a" * 501})
        assert long.status_code == 422
