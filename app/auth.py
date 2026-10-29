"""Invited Google sign-in, separate from optional read-only mailbox consent."""

import base64
import hashlib
import hmac
import os
import re
import secrets
import time
from dataclasses import dataclass
from datetime import UTC, timedelta
from urllib.parse import urlencode, urlparse

import httpx
import jwt
from fastapi import HTTPException, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import deployment
from .entities import AppSession, AppUser, LoginAttempt, new_id, utcnow
from .gmail import (
    AUTHORIZE_URL,
    GMAIL_SCOPE,
    TOKEN_URL,
    GmailError,
    _decrypt,
    _encrypt,
    _request,
    _settings,
)

SESSION_COOKIE = "sentinelsme_session"
CSRF_COOKIE = "sentinelsme_csrf"
LOGIN_COOKIE = "sentinelsme_login"
LOGIN_PATH = "/api/v1/auth/callback"
GOOGLE_KEYS = "https://www.googleapis.com/oauth2/v3/certs"
LOGIN_SCOPE = "openid email"
IDENTITY_CLOCK_SKEW_SECONDS = 30
_keys_cache: tuple[float, dict] = (0, {})


class SignInError(Exception):
    """Provider details and credentials never enter public errors."""

    def __init__(self, message: str, reason: str = "unavailable"):
        super().__init__(message)
        self.reason = (
            reason
            if reason
            in {
                "expired",
                "identity",
                "permissions",
                "provider",
                "not_allowed",
                "configuration",
                "clock",
            }
            else "unavailable"
        )


def required() -> bool:
    # An invalid mode fails closed instead of silently enabling header access.
    return deployment.production() or os.getenv("AI_SOC_AUTH_MODE", "local") != "local"


def allowed(email: str) -> bool:
    try:
        return deployment.signup_policy() == "public" or email in invitations()
    except deployment.DeploymentError:
        return False


def invitations() -> set[str]:
    return {
        value.strip().casefold()
        for value in os.getenv("AI_SOC_INVITED_EMAILS", "").split(",")
        if value.strip()
    }


def settings() -> tuple[str, str, str, object]:
    if os.getenv("AI_SOC_AUTH_MODE", "local") != "google":
        raise SignInError("Google sign-in has not been enabled by the operator.")
    try:
        client_id, secret, gmail_redirect, cipher = _settings()
    except (GmailError, deployment.DeploymentError):
        raise SignInError("The operator must finish Google sign-in setup.") from None
    callback = os.getenv(
        "AI_SOC_GOOGLE_LOGIN_REDIRECT_URI",
        gmail_redirect.replace("/gmail/callback", "/auth/callback"),
    )
    parsed, mailbox = urlparse(callback), urlparse(gmail_redirect)
    try:
        valid = deployment.valid_callback(callback, LOGIN_PATH)
    except deployment.DeploymentError:
        valid = False
    if (
        not valid
        or parsed.netloc != mailbox.netloc
        or parsed.path != LOGIN_PATH
        or parsed.query
        or parsed.fragment
        or parsed.username
        or parsed.password
    ):
        raise SignInError("The sign-in callback must use the configured application origin.")
    try:
        policy = deployment.signup_policy()
    except deployment.DeploymentError:
        raise SignInError("The sign-up policy is not configured correctly.") from None
    if policy == "invite_only" and not invitations():
        raise SignInError("The operator must configure the pilot invitation list.")
    return client_id, secret, callback, cipher


def configuration() -> dict:
    invitation_only = True
    try:
        settings()
        invitation_only = deployment.signup_policy() != "public"
        configured = True
    except SignInError:
        configured = False
    return {
        "mode": "google" if required() else "local",
        "configured": configured,
        "invitation_only": invitation_only,
        "environment": "production" if deployment.production() else "development",
        "operator_contact": os.getenv("AI_SOC_OPERATOR_CONTACT", ""),
        "evidence_retention_days": deployment.retention_days() if deployment.production() else 7,
        "session_hours": 8,
        "mailbox_consent_separate": True,
    }


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def purge_expired(db: Session) -> None:
    db.execute(delete(LoginAttempt).where(LoginAttempt.expires_at <= utcnow()))
    db.execute(delete(AppSession).where(AppSession.expires_at <= utcnow()))
    db.commit()


def begin_login(db: Session) -> tuple[str, str]:
    client_id, _secret, callback, cipher = settings()
    state, cookie, verifier, nonce = (secrets.token_urlsafe(48) for _ in range(4))
    purge_expired(db)
    # Fixed local bound on unfinished attempts; production needs per-client throttling.
    if len(db.scalars(select(LoginAttempt.state_digest).limit(101)).all()) >= 100:
        raise SignInError("Too many sign-in attempts. Try again later.")
    db.add(
        LoginAttempt(
            state_digest=digest(state),
            cookie_digest=digest(cookie),
            encrypted_parameters=_encrypt(cipher, {"verifier": verifier, "nonce": nonce}),
            expires_at=utcnow() + timedelta(minutes=10),
        )
    )
    db.commit()
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=")
    return AUTHORIZE_URL + "?" + urlencode(
        {
            "client_id": client_id,
            "redirect_uri": callback,
            "response_type": "code",
            "scope": LOGIN_SCOPE,
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge.decode(),
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
    ), cookie


def verify_identity(token: str, client_id: str, nonce: str, client: httpx.Client) -> dict:
    """Verify Google's signature and required OIDC claims against fixed Google keys."""
    global _keys_cache
    try:
        if not isinstance(token, str) or not token or len(token) > 16000:
            raise ValueError
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
            raise ValueError
        if _keys_cache[0] <= time.monotonic():
            _keys_cache = (time.monotonic() + 300, _request(client, "GET", GOOGLE_KEYS))
        keys = _keys_cache[1].get("keys", [])
        key = next((item for item in keys if item.get("kid") == header["kid"]), None)
        if key is None:
            # One bounded refresh for a rotated Google signing key.
            _keys_cache = (time.monotonic() + 300, _request(client, "GET", GOOGLE_KEYS))
            key = next(
                (
                    item
                    for item in _keys_cache[1].get("keys", [])
                    if item.get("kid") == header["kid"]
                ),
                None,
            )
        if not key:
            raise ValueError
        claims = jwt.decode(
            token,
            jwt.PyJWK.from_dict(key, algorithm="RS256").key,
            algorithms=["RS256"],
            audience=client_id,
            issuer=["https://accounts.google.com", "accounts.google.com"],
            leeway=IDENTITY_CLOCK_SKEW_SECONDS,
            options={"require": ["iss", "aud", "exp", "iat", "sub", "email", "nonce"]},
        )
        if (
            not isinstance(claims["nonce"], str)
            or not hmac.compare_digest(claims["nonce"], nonce)
            or claims.get("email_verified") is not True
            or not isinstance(claims["sub"], str)
            or not re.fullmatch(r"[A-Za-z0-9_-]{1,255}", claims["sub"])
            or claims.get("azp", client_id) != client_id
            or not isinstance(claims["email"], str)
            or not re.fullmatch(r"[^\s@]{1,64}@[^\s@]{1,253}", claims["email"])
        ):
            raise ValueError
        return {"sub": claims["sub"], "email": claims["email"].casefold()}
    except jwt.ImmatureSignatureError:
        raise SignInError(
            "The identity timestamp is too far ahead of the server clock.", "clock"
        ) from None
    except (jwt.PyJWTError, ValueError, TypeError, KeyError, AttributeError, GmailError):
        raise SignInError(
            "Google identity could not be verified. Start sign-in again.", "identity"
        ) from None


def finish_login(
    db: Session,
    state: str,
    cookie: str,
    code: str | None,
    denied: bool,
    old_session: str = "",
) -> tuple[str, str] | None:
    client_id, secret, callback, cipher = settings()
    attempt = db.get(LoginAttempt, digest(state))
    if (
        not attempt
        or not cookie
        or not hmac.compare_digest(attempt.cookie_digest, digest(cookie))
        or attempt.expires_at.replace(tzinfo=UTC) <= utcnow()
    ):
        raise SignInError("Sign-in expired or did not start in this browser.", "expired")
    try:
        parameters = _decrypt(cipher, attempt.encrypted_parameters)
    except GmailError:
        raise SignInError("Sign-in expired. Start again.", "expired") from None
    consumed = db.execute(
        delete(LoginAttempt).where(LoginAttempt.state_digest == attempt.state_digest)
    ).rowcount
    db.commit()
    if not consumed:
        raise SignInError("Sign-in was already used. Start again.", "expired")
    if denied or not code:
        return None
    try:
        with httpx.Client(timeout=20, follow_redirects=False) as client:
            data = _request(
                client,
                "POST",
                TOKEN_URL,
                data={
                    "client_id": client_id,
                    "client_secret": secret,
                    "code": code,
                    "redirect_uri": callback,
                    "grant_type": "authorization_code",
                    "code_verifier": parameters["verifier"],
                },
            )
            if set(str(data.get("scope", "")).split()) - {
                "openid",
                "email",
                "https://www.googleapis.com/auth/userinfo.email",
                GMAIL_SCOPE,  # An earlier explicit mailbox grant on this shared client.
            }:
                raise SignInError("Google returned unexpected sign-in permissions.", "permissions")
            identity = verify_identity(data.get("id_token"), client_id, parameters["nonce"], client)
    except GmailError:
        raise SignInError(
            "Google sign-in is temporarily unavailable. Try again.", "provider"
        ) from None
    if not allowed(identity["email"]):
        raise SignInError("This account does not have access to this deployment.", "not_allowed")
    dialect = db.get_bind().dialect.name
    if dialect in {"postgresql", "sqlite"}:
        if dialect == "postgresql":
            from sqlalchemy.dialects.postgresql import insert
        else:
            from sqlalchemy.dialects.sqlite import insert
        statement = insert(AppUser).values(
            id=new_id(),
            google_subject=identity["sub"],
            email=identity["email"],
            tenant_id="user-" + new_id(),
            status="active",
        )
        user = db.scalar(
            statement.on_conflict_do_update(
                index_elements=[AppUser.google_subject],
                set_={"email": identity["email"]},
            )
            .returning(AppUser)
            .execution_options(populate_existing=True)
        )
    else:
        user = db.scalar(select(AppUser).where(AppUser.google_subject == identity["sub"]))
    if user is None:
        user = AppUser(
            google_subject=identity["sub"], email=identity["email"], tenant_id="user-" + new_id()
        )
        db.add(user)
        db.flush()
    else:
        user.email = identity["email"]
    if user.status != "active":
        db.rollback()
        raise SignInError(
            "Account access is unavailable. Contact the service operator.", "not_allowed"
        )
    if old_session:
        db.execute(delete(AppSession).where(AppSession.token_digest == digest(old_session)))
    session, csrf = secrets.token_urlsafe(48), secrets.token_urlsafe(48)
    excess = (
        select(AppSession.token_digest)
        .where(AppSession.user_id == user.id)
        .order_by(AppSession.expires_at.desc(), AppSession.token_digest)
        .offset(19)
    )
    db.execute(delete(AppSession).where(AppSession.token_digest.in_(excess)))
    db.add(
        AppSession(
            token_digest=digest(session),
            user_id=user.id,
            csrf_digest=digest(csrf),
            expires_at=utcnow() + timedelta(hours=8),
        )
    )
    db.commit()
    # OIDC access/ID tokens are discarded; only the app's opaque session is returned.
    return session, csrf


@dataclass(frozen=True)
class Principal:
    user_id: str
    tenant_id: str
    email: str


def principal(
    db: Session,
    request: Request,
    *,
    check_csrf: bool = True,
    lock_user: bool = False,
) -> Principal:
    if os.getenv("AI_SOC_AUTH_MODE", "local") != "google":
        raise HTTPException(503, "Sign-in setup is unavailable.")
    token = request.cookies.get(SESSION_COOKIE, "")
    record = db.get(AppSession, digest(token)) if token and len(token) <= 256 else None
    if not record or record.expires_at.replace(tzinfo=UTC) <= utcnow():
        raise HTTPException(401, "Sign in to SentinelSME to continue.")
    statement = select(AppUser).where(AppUser.id == record.user_id)
    if lock_user or request.method not in {"GET", "HEAD", "OPTIONS"}:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    user = db.scalar(statement)
    if not user or user.status != "active" or not allowed(user.email):
        raise HTTPException(401, "Your pilot access is no longer active.")
    if check_csrf and request.method not in {"GET", "HEAD", "OPTIONS"}:
        csrf = request.headers.get("x-csrf-token", "")
        origin = request.headers.get("origin")
        try:
            callback = settings()[2]
        except SignInError:
            raise HTTPException(503, "Sign-in setup is unavailable.") from None
        configured = urlparse(callback)
        if (
            not csrf
            or len(csrf) > 256
            or not hmac.compare_digest(digest(csrf), record.csrf_digest)
            or (origin and origin != f"{configured.scheme}://{configured.netloc}")
            or (deployment.production() and origin != deployment.public_origin())
        ):
            raise HTTPException(403, "Refresh the page before submitting this action.")
    return Principal(user.id, user.tenant_id, user.email)


def workspace_allowed(db: Session, tenant_id: str, email: str) -> bool:
    if not allowed(email):
        return False
    if not deployment.production():
        return True
    return (
        db.scalar(
            select(AppUser.id).where(
                AppUser.tenant_id == tenant_id,
                AppUser.email == email,
                AppUser.status == "active",
            )
        )
        is not None
    )
