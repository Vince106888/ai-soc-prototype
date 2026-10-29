"""Public identity contracts with signed synthetic Google identities; no live provider calls."""

from datetime import timedelta

from sqlalchemy import func, select
from test_auth import environment as environment
from test_auth import sign_in
from test_deployment import production_settings as production_settings

from app import budgets, deployment
from app.entities import (
    Account,
    AppSession,
    AppUser,
    AuditRecord,
    Finding,
    Incident,
    RequestBudget,
    Signal,
    Source,
    utcnow,
)


def enter(environment, monkeypatch):
    db, client = environment
    client.base_url = deployment.public_origin()
    client.headers["Origin"] = deployment.public_origin()
    state = sign_in(db, client, monkeypatch, "third@gmail.com")
    assert state["user"]
    client.headers["X-CSRF-Token"] = state["csrf_token"]
    return db, client, state


def source_for(client):
    account = client.post("/api/v1/accounts", json={"email": "controlled@example.test"})
    assert account.status_code == 201
    source = client.post(
        f"/api/v1/accounts/{account.json()['id']}/sources",
        json={
            "name": "Controlled public contract test",
            "external_id": "test",
            "capabilities": ["mfa"],
        },
    )
    assert source.status_code == 201
    return account.json()["id"], source.json()["id"]


def test_public_explanation_is_queued_and_worker_finishes_without_http_inference(
    environment, production_settings, monkeypatch
):
    from app import explainer, explanation_jobs

    db, client, _ = enter(environment, monkeypatch)
    _, source = source_for(client)
    ingested = client.post(
        f"/api/v1/sources/{source}/signals",
        json={
            "signals": [
                {
                    "external_id": "queue-case",
                    "signal_type": "mfa",
                    "features": {"enabled": False},
                }
            ]
        },
    )
    case = ingested.json()["items"][0]["incident_ids"][0]
    monkeypatch.setenv("AI_SOC_EXPLAINER", "ollama")
    calls = []

    def generate(*args):
        calls.append(True)
        return {
            "what_happened": "MFA was reported off.",
            "why_it_matters": "Review access.",
            "next_step": "Verify MFA settings in the provider console.",
        }

    monkeypatch.setattr(explainer, "generate", generate)
    response = client.post(f"/api/v1/incidents/{case}/explanation")
    assert response.status_code == 202
    assert response.json()["explanation_job"]["status"] == "queued"
    score = response.json()["score"]
    assert not calls
    assert explanation_jobs.process_one() == "explained"
    result = client.get(f"/api/v1/incidents/{case}").json()
    assert result["explanation_job"]["status"] == "succeeded"
    assert result["explanation"]["source"] == "ai" and result["score"] == score
    assert calls == [True]
    assert (
        client.request(
            "DELETE", "/api/v1/auth/account", json={"confirmation": "DELETE"}
        ).status_code
        == 204
    )


def test_deletion_receipt_reapplies_after_database_restore(
    environment, production_settings, monkeypatch
):
    from app.deletion_ledger import reconcile, record

    db, client, state = enter(environment, monkeypatch)
    source_for(client)
    tenant = state["user"]["workspace_id"]
    record(tenant)
    # This database represents an older backup that still contains the user.
    assert db.get(AppUser, state["user"]["id"]) is not None
    reconcile(db)
    assert db.get(AppUser, state["user"]["id"]) is None
    assert db.scalar(select(func.count()).select_from(Account)) == 0
    assert client.get("/api/v1/accounts").status_code == 401
    reconcile(db)  # Replaying a receipt twice is harmless.


def test_public_signup_uses_secure_cookies_and_server_workspace(
    environment, production_settings, monkeypatch
):
    db, client, state = enter(environment, monkeypatch)
    assert not state["invitation_only"]
    cookies = client.cookies.jar
    assert all(cookie.secure for cookie in cookies)
    assert all(cookie.has_nonstandard_attr("HttpOnly") for cookie in cookies)
    first_tenant = state["user"]["workspace_id"]
    _, source = source_for(client)
    result = client.post(
        f"/api/v1/sources/{source}/signals",
        json={
            "signals": [
                {
                    "external_id": "one",
                    "signal_type": "mfa",
                    "features": {"enabled": False},
                }
            ]
        },
    )
    assert result.status_code == 201
    incident = result.json()["items"][0]["incident_ids"][0]
    client.cookies.clear()
    second = sign_in(db, client, monkeypatch, "second@gmail.com")
    assert second["user"]["workspace_id"] != first_tenant
    hidden = client.get(f"/api/v1/incidents/{incident}", headers={"X-Tenant-ID": first_tenant})
    assert hidden.status_code == 404


def test_public_mutations_require_matching_origin(environment, production_settings, monkeypatch):
    _, client, _ = enter(environment, monkeypatch)
    del client.headers["Origin"]
    assert client.post("/api/v1/accounts", json={"email": "one@example.test"}).status_code == 403
    response = client.post(
        "/api/v1/accounts",
        json={"email": "one@example.test"},
        headers={"Origin": "https://attacker.example.test"},
    )
    assert response.status_code == 403


def test_request_budgets_are_shared_and_contain_no_raw_identity(
    environment, production_settings, monkeypatch
):
    db, client, _ = enter(environment, monkeypatch)
    monkeypatch.setitem(budgets.REQUEST_LIMITS, "read", 1)
    assert client.get("/api/v1/accounts").status_code == 200
    denied = client.get("/api/v1/accounts")
    assert denied.status_code == 429
    assert 1 <= int(denied.headers["retry-after"]) <= 60
    row = db.scalar(select(RequestBudget))
    assert row.count == 2 and "third@gmail.com" not in str(row.__dict__)


def test_disabled_identity_cannot_use_headers_to_recover_access(
    environment, production_settings, monkeypatch
):
    db, client, state = enter(environment, monkeypatch)
    user = db.get(AppUser, state["user"]["id"])
    user.status = "disabled"
    db.commit()
    assert (
        client.get(
            "/api/v1/accounts", headers={"X-Tenant-ID": "default", "X-API-Key": "anything"}
        ).status_code
        == 401
    )
    assert client.get("/api/v1/auth/session").json()["user"] is None


def test_workspace_deletion_is_confirmed_scoped_and_revokes_sessions(
    environment, production_settings, monkeypatch
):
    db, client, state = enter(environment, monkeypatch)
    source_for(client)
    other = AppUser(google_subject="other", email="other@example.test", tenant_id="other-workspace")
    db.add(other)
    db.commit()
    assert (
        client.request("DELETE", "/api/v1/auth/account", json={"confirmation": "wrong"}).status_code
        == 422
    )
    response = client.request("DELETE", "/api/v1/auth/account", json={"confirmation": "DELETE"})
    assert response.status_code == 204
    tenant = state["user"]["workspace_id"]
    assert (
        db.scalar(select(func.count()).select_from(Account).where(Account.tenant_id == tenant)) == 0
    )
    assert (
        db.scalar(select(func.count()).select_from(Source).where(Source.tenant_id == tenant)) == 0
    )
    assert db.get(AppUser, state["user"]["id"]) is None
    assert db.get(AppUser, other.id) is not None
    assert db.scalar(select(func.count()).select_from(AppSession)) == 0
    assert (
        db.scalar(
            select(func.count()).select_from(AuditRecord).where(AuditRecord.tenant_id == tenant)
        )
        == 0
    )
    assert client.get("/api/v1/accounts").status_code == 401


def test_retention_expires_whole_cases_but_preserves_connections_and_live_case_evidence(
    environment, production_settings, monkeypatch
):
    db, client, state = enter(environment, monkeypatch)
    account, source = source_for(client)
    responses = []
    for external_id, enabled in [("old", False), ("healthy", True), ("live", False)]:
        result = client.post(
            f"/api/v1/sources/{source}/signals",
            json={
                "signals": [
                    {
                        "external_id": external_id,
                        "signal_type": "mfa",
                        "correlation_key": external_id,
                        "features": {"enabled": enabled},
                    }
                ]
            },
        )
        assert result.status_code == 201
        responses.append(result.json()["items"][0])
    cutoff = utcnow() - timedelta(days=31)
    old_case = db.get(Incident, responses[0]["incident_ids"][0])
    old_case.created_at = cutoff
    for response in responses:
        db.get(Signal, response["signal_id"]).received_at = cutoff
    db.commit()
    assert client.get(f"/api/v1/incidents/{old_case.id}").status_code == 404
    live_id = responses[2]["incident_ids"][0]
    assert client.get(f"/api/v1/incidents/{live_id}").status_code == 200
    assert db.get(Account, account) is not None and db.get(Source, source).status == "active"
    db.expire_all()
    assert (
        db.scalar(
            select(func.count())
            .select_from(Signal)
            .where(Signal.tenant_id == state["user"]["workspace_id"])
        )
        == 1
    )
    assert db.scalar(select(func.count()).select_from(Finding)) == 1
