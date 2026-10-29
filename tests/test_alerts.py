"""Alert thresholds, delivery limits, privacy of payloads and tenant isolation."""

from datetime import timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import alerts, database, worker
from app.api import router
from app.entities import Alert, AlertSettings, AuditRecord, utcnow
from app.platform import create_account, create_source
from app.platform_schemas import AccountCreate, AlertSettingsUpdate, ScheduleUpdate, SourceCreate
from app.retention import delete_account_data
from app.scheduling import configure_schedule

HEADERS = {"X-Tenant-ID": "owner"}


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.delenv("AI_SOC_API_KEY", raising=False)
    monkeypatch.delenv("AI_SOC_AUTH_MODE", raising=False)
    for name in ("AI_SOC_SMTP_HOST", "AI_SOC_SMTP_FROM", "AI_SOC_SMTP_PASSWORD_FILE"):
        monkeypatch.delenv(name, raising=False)
    database.configure_database(f"sqlite:///{(tmp_path / 'alerts.db').as_posix()}")
    database.migrate_schema()
    with database.SessionLocal() as db:
        account = create_account(db, "owner", AccountCreate(email="owner@example.test"))
        source = create_source(
            db,
            "owner",
            account.id,
            SourceCreate(
                name="Controlled alerts",
                external_id="controlled-evaluation",
                capabilities=["email", "forwarding", "signin", "mfa", "oauth_grant"],
            ),
        )
        yield db, account, source


def scan(db, source):
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
    db.expire_all()


def enable_smtp(monkeypatch):
    monkeypatch.setenv("AI_SOC_SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("AI_SOC_SMTP_FROM", "alerts@example.test")


def public_dns(monkeypatch, address="93.184.216.34"):
    monkeypatch.setattr(
        alerts.socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", (address, 443))]
    )


def test_default_raises_in_app_alerts_without_message_content(setup):
    db, _, source = setup
    scan(db, source)
    rows = list(db.scalars(select(Alert)))
    assert rows and all(row.severity in {"high", "critical"} for row in rows)
    assert all(row.email_status == "none" and row.webhook_status == "none" for row in rows)
    text = " ".join(f"{row.title} {row.rule_codes}" for row in rows).lower()
    assert "@" not in text and "http" not in text
    assert "alert_raised" in set(db.scalars(select(AuditRecord.action)))


def test_rescan_does_not_duplicate_alerts(setup):
    db, _, source = setup
    scan(db, source)
    first = db.query(Alert).count()
    scan(db, source)
    assert db.query(Alert).count() == first


def test_threshold_critical_only_suppresses_lower_severity(setup):
    db, _, source = setup
    alerts.configure(
        db,
        "owner",
        AlertSettingsUpdate(minimum_severity="critical"),
        signed_in_email=None,
        actor="t",
    )
    scan(db, source)
    assert all(row.severity == "critical" for row in db.scalars(select(Alert)))


def test_email_requires_server_smtp_and_valid_address(setup, monkeypatch):
    db, _, _ = setup
    update = AlertSettingsUpdate(email_enabled=True, email_to="me@example.test")
    with pytest.raises(alerts.AlertConfigError):
        alerts.configure(db, "owner", update, signed_in_email=None, actor="t")
    enable_smtp(monkeypatch)
    with pytest.raises(alerts.AlertConfigError):
        alerts.configure(
            db,
            "owner",
            AlertSettingsUpdate(email_enabled=True, email_to="not-an-address"),
            signed_in_email=None,
            actor="t",
        )
    row = alerts.configure(db, "owner", update, signed_in_email=None, actor="t")
    assert row.email_to == "me@example.test"


def test_signed_in_workspace_can_only_alert_its_own_address(setup, monkeypatch):
    db, _, _ = setup
    enable_smtp(monkeypatch)
    row = alerts.configure(
        db,
        "owner",
        AlertSettingsUpdate(email_enabled=True, email_to="someone-else@example.test"),
        signed_in_email="me@example.test",
        actor="t",
    )
    assert row.email_to == "me@example.test"


def test_email_delivery_sends_minimal_message_then_stops(setup, monkeypatch):
    db, _, source = setup
    enable_smtp(monkeypatch)
    alerts.configure(
        db,
        "owner",
        AlertSettingsUpdate(email_enabled=True, email_to="me@example.test"),
        signed_in_email=None,
        actor="t",
    )
    sent = []
    monkeypatch.setattr(alerts, "_send_email", lambda to, alert: sent.append((to, alert.title)))
    scan(db, source)
    assert sent and all(to == "me@example.test" for to, _ in sent)
    assert all(row.email_status == "sent" for row in db.scalars(select(Alert)))
    before = len(sent)
    worker.run_due()
    assert len(sent) == before


def test_failed_delivery_retries_then_gives_up_without_leaking_target(setup, monkeypatch):
    db, _, source = setup
    enable_smtp(monkeypatch)
    alerts.configure(
        db,
        "owner",
        AlertSettingsUpdate(email_enabled=True, email_to="secret-target@example.test"),
        signed_in_email=None,
        actor="t",
    )

    def boom(to, alert):
        raise RuntimeError(f"cannot reach {to}")

    monkeypatch.setattr(alerts, "_send_email", boom)
    scan(db, source)
    assert all(row.email_status == "pending" for row in db.scalars(select(Alert)))
    worker.run_due()
    worker.run_due()
    db.expire_all()
    rows = list(db.scalars(select(Alert)))
    assert rows and all(row.email_status == "failed" and row.attempts == 3 for row in rows)
    audit = " ".join(db.scalars(select(AuditRecord.detail)))
    assert "secret-target" not in audit


@pytest.mark.parametrize(
    "url",
    [
        "http://hooks.example.test/x",
        "https://user:pw@hooks.example.test/x",
        "https://hooks.example.test:8443/x",
        "not a url",
    ],
)
def test_webhook_rejects_unsafe_urls(setup, monkeypatch, url):
    db, _, _ = setup
    public_dns(monkeypatch)
    with pytest.raises(alerts.AlertConfigError):
        alerts.configure(
            db,
            "owner",
            AlertSettingsUpdate(webhook_enabled=True, webhook_url=url),
            signed_in_email=None,
            actor="t",
        )


@pytest.mark.parametrize("address", ["127.0.0.1", "10.0.0.5", "169.254.169.254", "::1"])
def test_webhook_rejects_private_targets(setup, monkeypatch, address):
    db, _, _ = setup
    public_dns(monkeypatch, address)
    with pytest.raises(alerts.AlertConfigError):
        alerts.configure(
            db,
            "owner",
            AlertSettingsUpdate(webhook_enabled=True, webhook_url="https://hooks.example.test/x"),
            signed_in_email=None,
            actor="t",
        )


def test_webhook_payload_is_minimal(setup, monkeypatch):
    db, _, source = setup
    public_dns(monkeypatch)
    alerts.configure(
        db,
        "owner",
        AlertSettingsUpdate(webhook_enabled=True, webhook_url="https://hooks.example.test/x"),
        signed_in_email=None,
        actor="t",
    )
    posted = []

    class Response:
        def raise_for_status(self):
            return None

    def fake_post(url, json, timeout, follow_redirects):
        assert follow_redirects is False
        posted.append((url, json))
        return Response()

    monkeypatch.setattr(alerts.httpx, "post", fake_post)
    scan(db, source)
    assert posted
    for url, body in posted:
        assert url == "https://hooks.example.test/x"
        assert set(body) == {
            "event",
            "incident_id",
            "severity",
            "title",
            "score",
            "rule_codes",
            "created_at",
        }


def test_api_settings_alerts_and_tenant_isolation(setup, monkeypatch):
    db, _, source = setup
    scan(db, source)
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        settings = client.get("/api/v1/alert-settings", headers=HEADERS).json()
        assert settings["minimum_severity"] == "high" and not settings["email_available"]
        bad = client.put(
            "/api/v1/alert-settings",
            headers=HEADERS,
            json={"email_enabled": True, "email_to": "me@example.test"},
        )
        assert bad.status_code == 422
        listed = client.get("/api/v1/alerts", headers=HEADERS).json()
        assert listed and not listed[0]["read"]
        assert client.get("/api/v1/alerts", headers={"X-Tenant-ID": "other"}).json() == []
        read_path = f"/api/v1/alerts/{listed[0]['id']}/read"
        other = client.post(read_path, headers={"X-Tenant-ID": "other"})
        assert other.status_code == 404
        assert client.post(read_path, headers=HEADERS).status_code == 204
        unread = client.get("/api/v1/alerts?unread=true", headers=HEADERS).json()
        assert all(item["id"] != listed[0]["id"] for item in unread)
        assert client.post("/api/v1/alerts/read", headers=HEADERS).status_code == 204
        assert client.get("/api/v1/alerts?unread=true", headers=HEADERS).json() == []


def test_deleting_account_removes_alerts(setup):
    db, account, source = setup
    scan(db, source)
    alerts.configure(db, "owner", AlertSettingsUpdate(), signed_in_email=None, actor="t")
    assert db.query(Alert).count() > 0
    delete_account_data(db, "owner", account.id)
    assert db.query(Alert).count() == 0
    assert db.get(AlertSettings, "owner") is not None  # settings are workspace-level
