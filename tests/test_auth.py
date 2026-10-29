"""Verified Google identity, private workspaces, browser sessions and access failures."""

import json
import secrets
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import httpx
import jwt
import pytest
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app import auth, database, gmail
from app.api import router
from app.auth_api import router as auth_router
from app.entities import Account, AppSession, AppUser, LoginAttempt, OAuthAttempt, utcnow
from app.gmail_api import router as gmail_router

HTTP_CLIENT = httpx.Client


@pytest.fixture
def environment(tmp_path, monkeypatch):
    database.configure_database(f"sqlite:///{(tmp_path / 'auth.db').as_posix()}")
    database.create_schema()
    monkeypatch.setenv("AI_SOC_AUTH_MODE", "google")
    monkeypatch.setenv("AI_SOC_INVITED_EMAILS", "first@gmail.com,second@gmail.com")
    monkeypatch.setenv("AI_SOC_GOOGLE_CLIENT_ID", "test-client")
    monkeypatch.setenv("AI_SOC_GOOGLE_CLIENT_SECRET", "never-expose-secret")
    monkeypatch.setenv("AI_SOC_TOKEN_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("AI_SOC_GOOGLE_REDIRECT_URI", "http://127.0.0.1:5173/api/v1/gmail/callback")
    monkeypatch.delenv("AI_SOC_GOOGLE_LOGIN_REDIRECT_URI", raising=False)
    monkeypatch.delenv("AI_SOC_API_KEY", raising=False)
    monkeypatch.setattr(auth, "_keys_cache", (0, {}))
    app = FastAPI()
    app.include_router(router)
    app.include_router(auth_router)
    app.include_router(gmail_router)
    with TestClient(app, base_url="http://127.0.0.1:5173", follow_redirects=False) as client:
        with database.SessionLocal() as db:
            yield db, client


def google_provider(monkeypatch, claims, *, scope="openid email", fail=False, wrong_key=False):
    monkeypatch.setattr(auth, "_keys_cache", (0, {}))
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key()))
    public.update(kid="test-key", alg="RS256", use="sig")
    signed = jwt.encode(claims, private, algorithm="RS256", headers={"kid": "test-key"})
    calls = []

    def handle(request):
        calls.append(request)
        if fail:
            return httpx.Response(500, text="private-provider-information")
        if request.url.path == "/token":
            return httpx.Response(
                200,
                json={
                    "id_token": signed,
                    "scope": scope,
                    "access_token": "private-access-token",
                },
            )
        assert str(request.url) == auth.GOOGLE_KEYS
        return httpx.Response(200, json={"keys": [] if wrong_key else [public]})

    transport = httpx.MockTransport(handle)
    monkeypatch.setattr(auth.httpx, "Client", lambda **kw: HTTP_CLIENT(transport=transport, **kw))
    return calls


def claims_for(expected_nonce, email="first@gmail.com", **changes):
    now = utcnow().timestamp()
    return {
        "iss": "https://accounts.google.com",
        "aud": "test-client",
        "sub": email[0] + "123",
        "email": email,
        "email_verified": True,
        "nonce": expected_nonce,
        "iat": now,
        "exp": now + 600,
        **changes,
    }


def start(db, client):
    response = client.post("/api/v1/auth/login")
    assert response.status_code == 200
    query = parse_qs(urlparse(response.json()["authorization_url"]).query)
    attempt = db.get(LoginAttempt, auth.digest(query["state"][0]))
    parameters = gmail._decrypt(auth.settings()[3], attempt.encrypted_parameters)
    return query, parameters


def sign_in(db, client, monkeypatch, email="first@gmail.com"):
    query, parameters = start(db, client)
    google_provider(monkeypatch, claims_for(parameters["nonce"], email))
    response = client.get(
        "/api/v1/auth/callback", params={"state": query["state"][0], "code": "code"}
    )
    assert response.headers["location"] == "/?signin=signed-in"
    return client.get("/api/v1/auth/session").json()


def test_login_is_identity_only_and_sessions_are_hashed(environment, monkeypatch):
    db, client = environment
    query, parameters = start(db, client)
    assert set(query["scope"][0].split()) == {"openid", "email"}
    assert query["code_challenge_method"] == ["S256"]
    assert "access_type" not in query
    calls = google_provider(monkeypatch, claims_for(parameters["nonce"]))
    response = client.get("/api/v1/auth/callback", params={"state": query["state"][0], "code": "x"})
    assert response.headers["location"] == "/?signin=signed-in"
    assert "HttpOnly" in response.headers.get_list("set-cookie")[1]
    assert all(
        request.url.host in {"oauth2.googleapis.com", "www.googleapis.com"} for request in calls
    )
    user = db.scalar(select(AppUser))
    session = db.scalar(select(AppSession))
    assert user.tenant_id.startswith("user-")
    assert session.token_digest != client.cookies[auth.SESSION_COOKIE]
    assert db.scalar(select(func.count()).select_from(LoginAttempt)) == 0
    assert "private-access-token" not in str(session.__dict__)
    state = client.get("/api/v1/auth/session").json()
    assert state["user"]["workspace_id"] == user.tenant_id
    assert state["csrf_token"]


@pytest.mark.parametrize(
    "changed",
    [
        {"aud": "wrong-client"},
        {"iss": "https://evil.test"},
        {"exp": 1},
        {"email_verified": False},
        {"nonce": "wrong"},
        {"azp": "wrong"},
        {"sub": ""},
        {"email": "bad\n@gmail.com"},
        {"nonce": None},
    ],
)
def test_unverified_identity_never_creates_a_session(environment, monkeypatch, changed):
    db, client = environment
    query, parameters = start(db, client)
    google_provider(monkeypatch, claims_for(parameters["nonce"], **changed))
    response = client.get("/api/v1/auth/callback", params={"state": query["state"][0], "code": "x"})
    assert response.headers["location"] == "/?signin=failed&reason=identity"
    assert db.scalar(select(func.count()).select_from(AppUser)) == 0
    assert "private" not in response.text


@pytest.mark.parametrize(
    "scope,fail,wrong_key",
    [
        ("https://www.googleapis.com/auth/gmail.modify", False, False),
        ("openid email", True, False),
        ("openid email", False, True),
    ],
)
def test_provider_failures_and_unexpected_permissions_are_safe(
    environment,
    monkeypatch,
    scope,
    fail,
    wrong_key,
):
    db, client = environment
    query, parameters = start(db, client)
    google_provider(
        monkeypatch, claims_for(parameters["nonce"]), scope=scope, fail=fail, wrong_key=wrong_key
    )
    response = client.get("/api/v1/auth/callback", params={"state": query["state"][0], "code": "x"})
    reason = "provider" if fail else "identity" if wrong_key else "permissions"
    assert response.headers["location"] == "/?signin=failed&reason=" + reason
    assert db.scalar(select(func.count()).select_from(AppSession)) == 0


def test_invitation_enforced_before_workspace_creation(environment, monkeypatch):
    db, client = environment
    query, parameters = start(db, client)
    google_provider(monkeypatch, claims_for(parameters["nonce"], "uninvited@gmail.com"))
    response = client.get("/api/v1/auth/callback", params={"state": query["state"][0], "code": "x"})
    assert response.headers["location"] == "/?signin=failed&reason=not_allowed"
    assert db.scalar(select(func.count()).select_from(AppUser)) == 0


def test_prior_readonly_grant_is_discarded_during_identity_only_login(environment, monkeypatch):
    db, client = environment
    query, parameters = start(db, client)
    google_provider(
        monkeypatch, claims_for(parameters["nonce"]), scope="openid email " + gmail.GMAIL_SCOPE
    )
    response = client.get(
        "/api/v1/auth/callback", params={"state": query["state"][0], "code": "code"}
    )
    assert response.headers["location"] == "/?signin=signed-in"
    assert client.get("/api/v1/auth/session").json()["user"]
    from app.entities import OAuthCredential

    assert db.scalar(select(func.count()).select_from(OAuthCredential)) == 0


@pytest.mark.parametrize("offset,accepted", [(5, True), (300, False)])
def test_small_identity_clock_skew_is_tolerated_but_large_skew_is_rejected(
    environment, monkeypatch, offset, accepted
):
    db, client = environment
    query, parameters = start(db, client)
    google_provider(
        monkeypatch,
        claims_for(
            parameters["nonce"],
            iat=utcnow().timestamp() + offset,
        ),
    )
    result = client.get(
        "/api/v1/auth/callback",
        params={
            "state": query["state"][0],
            "code": "synthetic-code",
        },
    )
    assert result.headers["location"] == (
        "/?signin=signed-in" if accepted else "/?signin=failed&reason=clock"
    )
    assert db.scalar(select(func.count()).select_from(AppSession)) == int(accepted)


def test_wrong_browser_callback_has_safe_reason_without_private_logging(environment, caplog):
    db, client = environment
    query, _ = start(db, client)
    client.cookies.clear()
    response = client.get(
        "/api/v1/auth/callback",
        params={
            "state": query["state"][0],
            "code": "private-authorization-code",
        },
    )
    assert response.headers["location"] == "/?signin=failed&reason=expired"
    assert "Google sign-in failed (expired)" in caplog.text
    assert "private-authorization-code" not in caplog.text
    assert query["state"][0] not in caplog.text
    assert db.scalar(select(func.count()).select_from(AppSession)) == 0


def test_failure_reason_is_whitelisted_before_logging(environment, monkeypatch, caplog):
    _, client = environment

    def fail(*args):
        raise auth.SignInError("private-provider-message", "private-provider-response")

    monkeypatch.setattr(auth, "finish_login", fail)
    result = client.get("/api/v1/auth/callback")
    assert result.headers["location"] == "/?signin=failed&reason=unavailable"
    assert "private-provider" not in caplog.text + result.headers["location"]


def test_state_binding_cancel_expiry_and_replay(environment, monkeypatch):
    db, client = environment
    query, parameters = start(db, client)
    cookie = client.cookies[auth.LOGIN_COOKIE]
    with pytest.raises(auth.SignInError):
        auth.finish_login(db, query["state"][0], "other-browser", "x", False)
    assert auth.finish_login(db, query["state"][0], cookie, None, True) is None
    with pytest.raises(auth.SignInError):
        auth.finish_login(db, query["state"][0], cookie, "x", False)
    query, parameters = start(db, client)
    attempt = db.get(LoginAttempt, auth.digest(query["state"][0]))
    attempt.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    with pytest.raises(auth.SignInError):
        auth.finish_login(db, query["state"][0], cookie, "x", False)
    auth.purge_expired(db)
    assert db.scalar(select(func.count()).select_from(LoginAttempt)) == 0


def test_csrf_tenant_isolation_and_logout(environment, monkeypatch):
    db, client = environment
    first = sign_in(db, client, monkeypatch)
    headers = {"X-CSRF-Token": first["csrf_token"], "X-Tenant-ID": "somebody-elses-workspace"}
    assert (
        client.post("/api/v1/accounts", json={"email": "controlled@example.test"}).status_code
        == 403
    )
    bad_origin = {**headers, "Origin": "https://evil.test"}
    assert (
        client.post(
            "/api/v1/accounts", headers=bad_origin, json={"email": "controlled@example.test"}
        ).status_code
        == 403
    )
    created = client.post(
        "/api/v1/accounts", headers=headers, json={"email": "controlled@example.test"}
    )
    assert created.status_code == 201
    db.expire_all()
    assert db.get(Account, created.json()["id"]).tenant_id == first["user"]["workspace_id"]
    identifier = created.json()["id"]
    second = sign_in(db, client, monkeypatch, "second@gmail.com")
    assert second["user"]["workspace_id"] != first["user"]["workspace_id"]
    assert (
        client.get(
            "/api/v1/accounts/" + identifier,
            headers={"X-Tenant-ID": first["user"]["workspace_id"], "X-API-Key": "anything"},
        ).status_code
        == 404
    )
    assert client.get("/api/v1/accounts").json() == []
    assert client.post("/api/v1/auth/logout").status_code == 403
    assert (
        client.post(
            "/api/v1/auth/logout", headers={"X-CSRF-Token": second["csrf_token"]}
        ).status_code
        == 204
    )
    assert client.get("/api/v1/accounts").status_code == 401
    assert client.get("/api/v1/auth/session").json()["user"] is None


def test_session_expiry_invitation_removal_and_repeated_signin(environment, monkeypatch):
    db, client = environment
    first = sign_in(db, client, monkeypatch)
    again = sign_in(db, client, monkeypatch)
    assert first["user"] == again["user"]
    assert db.scalar(select(func.count()).select_from(AppUser)) == 1
    record = db.scalar(select(AppSession))
    record.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert client.get("/api/v1/accounts").status_code == 401
    auth.purge_expired(db)
    sign_in(db, client, monkeypatch)
    monkeypatch.setenv("AI_SOC_INVITED_EMAILS", "second@gmail.com")
    assert client.get("/api/v1/accounts").status_code == 401
    assert client.get("/api/v1/auth/session").json()["user"] is None


def test_mailbox_permission_requires_same_user_and_current_session(environment, monkeypatch):
    db, client = environment
    state = sign_in(db, client, monkeypatch)
    headers = {"X-CSRF-Token": state["csrf_token"]}
    assert (
        client.post(
            "/api/v1/gmail/consent",
            headers=headers,
            json={"email": "second@gmail.com", "acknowledged": True},
        ).status_code
        == 400
    )
    result = client.post(
        "/api/v1/gmail/consent",
        headers=headers,
        json={"email": "first@gmail.com", "acknowledged": True},
    )
    assert result.status_code == 200
    query = parse_qs(urlparse(result.json()["authorization_url"]).query)
    assert query["scope"] == [gmail.GMAIL_SCOPE]
    attempt = db.scalar(select(OAuthAttempt))
    assert attempt.tenant_id == state["user"]["workspace_id"]
    sign_in(db, client, monkeypatch, "second@gmail.com")
    response = client.get(
        "/api/v1/gmail/callback", params={"state": query["state"][0], "code": "x"}
    )
    assert response.headers["location"] == "/?gmail=failed"


def test_local_mode_and_missing_setup_fail_closed(environment, monkeypatch):
    db, client = environment
    monkeypatch.setenv("AI_SOC_AUTH_MODE", "local")
    assert auth.configuration()["mode"] == "local"
    assert client.post("/api/v1/auth/login").status_code == 503
    assert client.get("/api/v1/accounts", headers={"X-Tenant-ID": "demo"}).status_code == 200
    monkeypatch.setenv("AI_SOC_AUTH_MODE", "typo")
    assert client.get("/api/v1/accounts").status_code == 503
    monkeypatch.setenv("AI_SOC_AUTH_MODE", "google")
    monkeypatch.setenv("AI_SOC_INVITED_EMAILS", "")
    assert client.post("/api/v1/auth/login").status_code == 503
    monkeypatch.setenv("AI_SOC_INVITED_EMAILS", "first@gmail.com")
    monkeypatch.setenv("AI_SOC_GOOGLE_LOGIN_REDIRECT_URI", "https://evil.test/callback")
    assert client.post("/api/v1/auth/login").status_code == 503
    monkeypatch.delenv("AI_SOC_GOOGLE_LOGIN_REDIRECT_URI")
    monkeypatch.delenv("AI_SOC_GOOGLE_CLIENT_SECRET")
    assert client.post("/api/v1/auth/login").status_code == 503


def test_pending_attempts_are_bounded(environment):
    db, client = environment
    for _ in range(100):
        db.add(
            LoginAttempt(
                state_digest=secrets.token_hex(32),
                cookie_digest="x",
                encrypted_parameters="x",
                expires_at=utcnow() + timedelta(minutes=1),
            )
        )
    db.commit()
    assert client.post("/api/v1/auth/login").status_code == 503
