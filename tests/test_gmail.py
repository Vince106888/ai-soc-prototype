"""Consent, provider isolation, privacy, failure, and deletion acceptance tests."""

import base64
import json
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app import database, gmail
from app.api import router
from app.entities import (
    Account,
    AuditRecord,
    Finding,
    Incident,
    OAuthAttempt,
    OAuthCredential,
    ScanJob,
    Signal,
    Source,
    utcnow,
)
from app.gmail_api import router as gmail_router
from app.platform import create_account, create_source, ingest_signals
from app.platform_schemas import AccountCreate, SignalBatch, SignalInput, SourceCreate
from app.retention import delete_account_data, expire_trials


@pytest.fixture
def db(tmp_path, monkeypatch):
    database.configure_database(f"sqlite:///{(tmp_path / 'gmail.db').as_posix()}")
    database.create_schema()
    monkeypatch.setenv("AI_SOC_GOOGLE_CLIENT_ID", "test-client")
    monkeypatch.setenv("AI_SOC_GOOGLE_CLIENT_SECRET", "test-secret")
    monkeypatch.setenv("AI_SOC_TOKEN_KEY", Fernet.generate_key().decode())
    monkeypatch.delenv("AI_SOC_API_KEY", raising=False)
    with database.SessionLocal() as session:
        yield session


def provider_message(identifier="abc123", *, html=False):
    content = (
        '<p>Verify your account immediately</p><a href="https://secure.example.test/private?token=x">Continue</a>'
        if html
        else "Verify your account immediately at https://secure.example.test/private?token=x"
    )
    return {
        "id": identifier,
        "internalDate": str(int(utcnow().timestamp() * 1000)),
        "labelIds": ["INBOX", "UNREAD", "private-custom-label"],
        "payload": {
            "mimeType": "text/html" if html else "text/plain",
            "headers": [
                {"name": "From", "value": "Support <notice@example.test>"},
                {"name": "Subject", "value": "Sample review"},
                {"name": "Authentication-Results", "value": "mx.google.com; spf=fail; dkim=pass"},
            ],
            "body": {"data": base64.urlsafe_b64encode(content.encode()).decode()},
            "parts": [
                {
                    "filename": "private.txt",
                    "mimeType": "text/plain",
                    "body": {"data": base64.urlsafe_b64encode(b"attachment private text").decode()},
                }
            ],
        },
    }


def mock_google(monkeypatch, *, fail=False, email="owner@gmail.com", empty=False):
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.path == "/token":
            return httpx.Response(
                200,
                json={
                    "access_token": "private-access",
                    "refresh_token": "private-refresh",
                    "expires_in": 3600,
                    "scope": gmail.GMAIL_SCOPE,
                },
            )
        if request.url.path.endswith("/profile"):
            return httpx.Response(200, json={"emailAddress": email})
        if request.url.path == "/revoke":
            return httpx.Response(200, json={})
        if request.url.path.endswith("/messages"):
            return httpx.Response(
                200,
                json={"messages": [] if empty else [{"id": "abc123"}], "nextPageToken": "ignored"},
            )
        if fail:
            return httpx.Response(503, json={"error": "private-provider-error"})
        return httpx.Response(200, json=provider_message())

    original_client = httpx.Client
    monkeypatch.setattr(
        gmail.httpx,
        "Client",
        lambda **kwargs: original_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    return requests


def connect(db):
    url, cookie = gmail.begin_consent(db, "acme", "owner@gmail.com")
    state = parse_qs(urlparse(url).query)["state"][0]
    assert gmail.finish_consent(db, state, cookie, "single-use-code") == "connected"
    return db.scalar(select(Source).where(Source.source_type == "gmail"))


def test_consent_is_browser_bound_single_use_encrypted_and_readonly(db, monkeypatch):
    requests = mock_google(monkeypatch)
    url, cookie = gmail.begin_consent(db, "acme", "owner@gmail.com")
    query = parse_qs(urlparse(url).query)
    assert query["scope"] == [gmail.GMAIL_SCOPE]
    assert query["code_challenge_method"] == ["S256"]
    state = query["state"][0]
    with pytest.raises(gmail.GmailError, match="browser"):
        gmail.finish_consent(db, state, "wrong-browser", "code")
    assert not requests
    assert gmail.finish_consent(db, state, cookie, "code") == "connected"
    with pytest.raises(gmail.GmailError):
        gmail.finish_consent(db, state, cookie, "code")
    credential = db.scalar(select(OAuthCredential))
    assert "private-access" not in credential.encrypted_tokens
    assert "private-refresh" not in credential.encrypted_tokens
    assert db.scalar(select(Account)).delete_after is not None


def test_account_mismatch_revokes_and_saves_no_account(db, monkeypatch):
    requests = mock_google(monkeypatch, email="someone-else@gmail.com")
    url, cookie = gmail.begin_consent(db, "acme", "owner@gmail.com")
    with pytest.raises(gmail.GmailError, match="does not match"):
        gmail.finish_consent(db, parse_qs(urlparse(url).query)["state"][0], cookie, "code")
    assert requests[-1].url.path == "/revoke"
    assert db.scalar(select(func.count()).select_from(Account)) == 0


def test_expired_cancelled_and_missing_configuration(db, monkeypatch):
    url, cookie = gmail.begin_consent(db, "acme", "owner@gmail.com")
    state = parse_qs(urlparse(url).query)["state"][0]
    attempt = db.get(OAuthAttempt, gmail._digest(state))
    attempt.expires_at = utcnow() - timedelta(minutes=1)
    db.commit()
    with pytest.raises(gmail.GmailError):
        gmail.finish_consent(db, state, cookie, "code")
    url, cookie = gmail.begin_consent(db, "acme", "owner@gmail.com")
    assert (
        gmail.finish_consent(db, parse_qs(urlparse(url).query)["state"][0], cookie, None, True)
        == "cancelled"
    )
    monkeypatch.delenv("AI_SOC_GOOGLE_CLIENT_SECRET")
    assert not gmail.configuration_status()["configured"]
    monkeypatch.setenv("AI_SOC_GOOGLE_CLIENT_SECRET", "x")
    monkeypatch.setenv("AI_SOC_GOOGLE_REDIRECT_URI", "https://evil.example/callback")
    assert not gmail.configuration_status()["configured"]


def test_gmail_scan_minimises_evidence_and_is_idempotent(db, monkeypatch):
    requests = mock_google(monkeypatch)
    source = connect(db)
    first = gmail.scan_mailbox(db, "acme", source.id, 20, 7)
    assert first["examined_count"] == first["imported_count"] == 1
    assert first["finding_count"] > 0
    assert gmail.scan_mailbox(db, "acme", source.id, 20, 7)["duplicate_count"] == 1
    features = db.scalar(select(Signal)).features
    assert "body" not in features
    assert features["url_hosts"] == ["secure.example.test"]
    assert features["labels"] == ["INBOX", "UNREAD"]
    assert "private?token" not in json.dumps(features)
    assert {request.url.host for request in requests} <= {
        "gmail.googleapis.com",
        "oauth2.googleapis.com",
    }
    assert all("attachments" not in request.url.path for request in requests)
    assert db.scalar(select(ScanJob).order_by(ScanJob.created_at.desc())).status == "completed"


def test_partial_provider_failure_imports_nothing_and_records_safe_failure(db, monkeypatch):
    mock_google(monkeypatch, fail=True)
    source = connect(db)
    with pytest.raises(gmail.GmailError, match="temporarily"):
        gmail.scan_mailbox(db, "acme", source.id, 20, 7)
    assert db.scalar(select(func.count()).select_from(Signal)) == 0
    job = db.scalar(select(ScanJob))
    assert job.status == "failed"
    assert "private-provider-error" not in job.error


def test_refresh_empty_scan_and_disconnect(db, monkeypatch):
    requests = mock_google(monkeypatch, empty=True)
    source = connect(db)
    credential = db.get(OAuthCredential, source.id)
    cipher = gmail._settings()[3]
    tokens = gmail._decrypt(cipher, credential.encrypted_tokens)
    tokens["expires_at"] = 1
    credential.encrypted_tokens = gmail._encrypt(cipher, tokens)
    db.commit()
    assert gmail.scan_mailbox(db, "acme", source.id, 1, 1)["examined_count"] == 0
    assert len([r for r in requests if r.url.path == "/token"]) == 2
    result = gmail.disconnect_gmail(db, "acme", source.id)
    assert result["provider_revoked"]
    assert db.get(OAuthCredential, source.id) is None
    assert source.status == "disconnected"


def test_html_attachment_boundaries_and_untrusted_authentication():
    signal = gmail.message_signal(provider_message(html=True))
    assert signal.features["urls"] == ["https://secure.example.test/private?token=x"]
    assert "attachment private text" not in signal.features["body"]
    assert signal.features["authentication"] == {"spf": "fail", "dkim": "pass"}
    message = provider_message()
    message["payload"]["headers"][-1]["value"] = "attacker.example; spf=fail"
    assert gmail.message_signal(message).features["authentication"] == {}


def test_trial_deletion_removes_chain_and_expiry_is_scoped(db):
    account = create_account(db, "acme", AccountCreate(email="owner@gmail.com"))
    source = create_source(
        db,
        "acme",
        account.id,
        SourceCreate(name="selected", external_id="sample", capabilities=["email"]),
    )
    ingest_signals(
        db,
        "acme",
        source.id,
        SignalBatch(
            signals=[
                SignalInput(
                    external_id="sample",
                    signal_type="email",
                    features={"sender": "a@example.test", "body": "verify your account"},
                )
            ]
        ),
    )
    other = create_account(db, "other", AccountCreate(email="other@example.test"))
    account.delete_after = utcnow() - timedelta(days=1)
    db.commit()
    assert expire_trials(db) == 1
    for model in (Signal, Finding, Incident, Source):
        assert db.scalar(select(func.count()).select_from(model)) == 0
    assert db.get(Account, other.id) is not None
    receipt = db.scalar(select(AuditRecord).where(AuditRecord.action == "trial_expired"))
    assert "gmail" not in receipt.detail
    with pytest.raises(Exception, match="not found"):
        delete_account_data(db, "acme", other.id)


def test_http_routes_require_consent_validate_limits_and_hide_tenants(db, monkeypatch):
    mock_google(monkeypatch)
    source = connect(db)
    test_app = FastAPI()
    test_app.include_router(router)
    test_app.include_router(gmail_router)
    import asyncio

    async def run():
        async with AsyncClient(
            transport=ASGITransport(app=test_app), base_url="http://testserver"
        ) as client:
            denied = await client.post(
                "/api/v1/gmail/scan", json={"source_id": source.id, "acknowledged": False}
            )
            assert denied.status_code == 400
            invalid = await client.post(
                "/api/v1/gmail/scan",
                json={"source_id": source.id, "acknowledged": True, "maximum_messages": 51},
            )
            assert invalid.status_code == 422
            hidden = await client.post(
                "/api/v1/gmail/scan",
                headers={"X-Tenant-ID": "other"},
                json={"source_id": source.id, "acknowledged": True},
            )
            assert hidden.status_code == 404
            deleted = await client.delete(
                f"/api/v1/accounts/{source.account_id}", headers={"X-Tenant-ID": "other"}
            )
            assert deleted.status_code == 404
            overview = (
                await client.get("/api/v1/overview", headers={"X-Tenant-ID": "other"})
            ).json()
            assert overview["accounts"] == 0
            consent = await client.post(
                "/api/v1/gmail/consent",
                headers={"X-Tenant-ID": "acme"},
                json={"email": "owner@gmail.com", "acknowledged": True},
            )
            assert consent.status_code == 200
            assert "HttpOnly" in consent.headers["set-cookie"]
            assert "private-access" not in consent.text

    asyncio.run(run())


def test_overview_counts_open_priority_separately_from_false_positives(db):
    from app.overview import dashboard_overview
    from app.platform import transition_incident
    from app.platform_schemas import IncidentTransition

    account = create_account(db, "acme", AccountCreate(email="owner@example.test"))
    source = create_source(
        db,
        "acme",
        account.id,
        SourceCreate(name="test", external_id="overview", capabilities=["email"]),
    )
    result = ingest_signals(
        db,
        "acme",
        source.id,
        SignalBatch(
            signals=[
                SignalInput(
                    external_id="overview-1",
                    signal_type="email",
                    features={
                        "sender": "notice@example.test",
                        "reply_to": "other@another.test",
                        "body": "verify your account https://secure.example.test",
                        "spf": "fail",
                    },
                )
            ]
        ),
    )
    incident_id = result.items[0].incident_ids[0]
    initial = dashboard_overview(db, "acme")
    assert initial["incidents"]["critical"] == 1
    assert initial["activity"][-1]["signals"] == 1
    assert initial["activity"][-1]["incidents"] == 1
    transition_incident(db, "acme", incident_id, IncidentTransition(status="under_review"))
    assert dashboard_overview(db, "acme")["incidents"]["under_review"] == 1
    transition_incident(db, "acme", incident_id, IncidentTransition(status="resolved"))
    totals = dashboard_overview(db, "acme")["incidents"]
    assert totals["active"] == totals["critical"] == 0
    assert totals["resolved"] == 1


def test_provider_request_errors_are_fixed_and_tokens_are_not_echoed():
    for status in (401, 400, 429):
        client = httpx.Client(
            transport=httpx.MockTransport(
                lambda request, status=status: httpx.Response(status, json={"private": "sensitive"})
            )
        )
        with pytest.raises(gmail.GmailError) as error:
            gmail._request(client, "GET", gmail.GMAIL_URL + "/profile")
        assert "sensitive" not in str(error.value)
        client.close()
    for response in ([1], "invalid"):
        client = httpx.Client(
            transport=httpx.MockTransport(
                lambda request, response=response: httpx.Response(200, json=response)
            )
        )
        with pytest.raises(gmail.GmailError):
            gmail._request(client, "GET", gmail.GMAIL_URL + "/profile")
        client.close()


def test_identity_scopes_can_accompany_readonly_without_expanding_mail_access():
    tokens = gmail._token_data(
        {
            "scope": gmail.GMAIL_SCOPE + " openid https://www.googleapis.com/auth/userinfo.email",
            "access_token": "synthetic-access",
            "refresh_token": "synthetic-refresh",
        }
    )
    assert tokens["scope"] == gmail.GMAIL_SCOPE
    for scope in (
        "openid email",
        gmail.GMAIL_SCOPE + " https://www.googleapis.com/auth/gmail.modify",
    ):
        with pytest.raises(gmail.GmailError, match="unexpected"):
            gmail._token_data({"scope": scope})


def test_token_scope_expiry_and_key_failures(db, monkeypatch, tmp_path):
    for data in (
        {"scope": "write"},
        {"access_token": "x"},
        {"access_token": "x", "refresh_token": "y", "expires_in": "bad"},
    ):
        with pytest.raises(gmail.GmailError):
            gmail._token_data(data)
    with pytest.raises(gmail.GmailError):
        gmail._decrypt(gmail._settings()[3], "not-encrypted")
    monkeypatch.setenv("AI_SOC_TOKEN_KEY", "invalid")
    assert not gmail.configuration_status()["configured"]
    monkeypatch.delenv("AI_SOC_TOKEN_KEY")
    monkeypatch.setenv("AI_SOC_TOKEN_KEY_FILE", str(tmp_path / "missing.key"))
    assert not gmail.configuration_status()["configured"]
    path = tmp_path / "token.key"
    path.write_bytes(Fernet.generate_key())
    monkeypatch.setenv("AI_SOC_TOKEN_KEY_FILE", str(path))
    assert gmail.configuration_status()["configured"]


def test_callback_routes_and_real_scan_response_are_safe(db, monkeypatch):
    import asyncio

    mock_google(monkeypatch)
    test_app = FastAPI()
    test_app.include_router(router)
    test_app.include_router(gmail_router)

    async def run():
        async with AsyncClient(
            transport=ASGITransport(app=test_app), base_url="http://testserver"
        ) as client:
            headers = {"X-Tenant-ID": "acme"}
            assert (await client.get("/api/v1/gmail/configuration", headers=headers)).json()[
                "configured"
            ]
            for payload in (
                {"email": "owner@gmail.com", "acknowledged": False},
                {"email": "owner@example.test", "acknowledged": True},
            ):
                assert (
                    await client.post("/api/v1/gmail/consent", headers=headers, json=payload)
                ).status_code == 400
            started = await client.post(
                "/api/v1/gmail/consent",
                headers=headers,
                json={"email": "owner@gmail.com", "acknowledged": True},
            )
            state = parse_qs(urlparse(started.json()["authorization_url"]).query)["state"][0]
            callback = await client.get(
                "/api/v1/gmail/callback", params={"state": state, "code": "private-code"}
            )
            assert callback.headers["location"] == "/?gmail=connected"
            replay = await client.get(
                "/api/v1/gmail/callback", params={"state": state, "code": "private-code"}
            )
            assert replay.headers["location"] == "/?gmail=failed"
            source = db.scalar(select(Source).where(Source.source_type == "gmail"))
            forged = await client.post(
                f"/api/v1/sources/{source.id}/signals",
                headers=headers,
                json={
                    "signals": [
                        {
                            "external_id": "manual",
                            "signal_type": "email",
                            "features": {"sender": "sender@example.test"},
                        }
                    ]
                },
            )
            assert forged.status_code == 409
            scanned = await client.post(
                "/api/v1/gmail/scan",
                headers=headers,
                json={"source_id": source.id, "acknowledged": True},
            )
            assert scanned.status_code == 200
            assert scanned.json()["sample_limited"]
            disconnected = await client.post(
                f"/api/v1/gmail/sources/{source.id}/disconnect", headers=headers
            )
            assert disconnected.json()["provider_revoked"]
            deleted = await client.delete(f"/api/v1/accounts/{source.account_id}", headers=headers)
            assert deleted.status_code == 204

    asyncio.run(run())


def test_response_size_and_sample_deadline_fail_without_importing(db, monkeypatch):
    with httpx.Client(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, content=b"x" * (gmail.MAX_RESPONSE_BYTES + 1))
        )
    ) as client:
        with pytest.raises(gmail.GmailError, match="size limit"):
            gmail._request(client, "GET", gmail.GMAIL_URL + "/profile")
    mock_google(monkeypatch)
    source = connect(db)
    times = iter([0, gmail.SCAN_BUDGET_SECONDS + 1])
    monkeypatch.setattr(gmail.time, "monotonic", lambda: next(times))
    with pytest.raises(gmail.GmailError, match="took too long"):
        gmail.scan_mailbox(db, "acme", source.id, 20, 7)
    assert db.scalar(select(func.count()).select_from(Signal)) == 0
    assert db.scalar(select(ScanJob)).status == "failed"


def test_expired_unfinished_consent_is_purged_without_an_account(db):
    gmail.begin_consent(db, "acme", "owner@gmail.com")
    attempt = db.scalar(select(OAuthAttempt))
    attempt.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert expire_trials(db) == 0
    assert db.scalar(select(OAuthAttempt)) is None
