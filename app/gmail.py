"""Read-only Gmail adapter. Provider content is transient, never logged or archived."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import secrets
import time
from datetime import UTC, datetime, timedelta
from email.utils import parseaddr
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode, urlparse

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .entities import (
    Account,
    AuditRecord,
    OAuthAttempt,
    OAuthCredential,
    ScanSchedule,
    Source,
    utcnow,
)
from .platform import (
    ConflictError,
    create_account,
    create_scan_job,
    create_source,
    get_scan_job,
    get_source,
    ingest_signals,
    mark_scan_job_failed,
)
from .platform_schemas import AccountCreate, SignalBatch, SignalInput, SourceCreate

GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GMAIL_URL = "https://gmail.googleapis.com/gmail/v1/users/me"
COOKIE_NAME = "sentinelsme_oauth"
COOKIE_PATH = "/api/v1/gmail/callback"
MAX_RESPONSE_BYTES = 2_000_000
SCAN_BUDGET_SECONDS = 120


class GmailError(Exception):
    """Only fixed, safe error messages may cross the provider boundary."""


def _settings() -> tuple[str, str, str, Fernet]:
    client_id = os.getenv("AI_SOC_GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("AI_SOC_GOOGLE_CLIENT_SECRET", "")
    redirect = os.getenv(
        "AI_SOC_GOOGLE_REDIRECT_URI", "http://127.0.0.1:5173/api/v1/gmail/callback"
    )
    key = os.getenv("AI_SOC_TOKEN_KEY", "")
    if not key and (key_path := os.getenv("AI_SOC_TOKEN_KEY_FILE")):
        try:
            key = Path(key_path).read_text(encoding="ascii").strip()
        except (OSError, UnicodeError):
            raise GmailError("The token encryption key file could not be read.") from None
    parsed = urlparse(redirect)
    if (
        parsed.hostname not in {"127.0.0.1", "localhost"}
        or parsed.scheme != "http"
        or parsed.path != COOKIE_PATH
        or parsed.query
        or parsed.fragment
        or parsed.username
    ):
        raise GmailError("This Gmail integration requires a localhost callback URL.")
    if not client_id or not client_secret or not key:
        raise GmailError("Configure the Google OAuth client and token encryption key first.")
    try:
        cipher = Fernet(key.encode("ascii"))
    except (ValueError, UnicodeError):
        raise GmailError("The token encryption key is invalid.") from None
    return client_id, client_secret, redirect, cipher


def configuration_status() -> dict:
    try:
        _settings()
        configured, message = True, "Ready for Google consent."
    except GmailError as exc:
        configured, message = False, str(exc)
    return {
        "implemented": True,
        "configured": configured,
        "message": message,
        "scope": GMAIL_SCOPE,
        "maximum_messages": 50,
        "signal_types": ["email"],
        "automatic_scanning": False,
    }


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _decrypt(cipher: Fernet, value: str) -> dict:
    try:
        return json.loads(cipher.decrypt(value.encode()).decode())
    except (InvalidToken, ValueError, UnicodeError):
        raise GmailError(
            "Stored consent cannot be read. Reconnect Gmail with the correct key."
        ) from None


def _encrypt(cipher: Fernet, value: dict) -> str:
    return cipher.encrypt(json.dumps(value).encode()).decode()


def begin_consent(db: Session, tenant: str, email: str) -> tuple[str, str]:
    client_id, _secret, redirect, cipher = _settings()
    state, cookie, verifier = (secrets.token_urlsafe(48) for _ in range(3))
    db.execute(delete(OAuthAttempt).where(OAuthAttempt.expires_at < utcnow()))
    db.add(
        OAuthAttempt(
            state_digest=_digest(state),
            tenant_id=tenant,
            email=email,
            cookie_digest=_digest(cookie),
            encrypted_verifier=_encrypt(cipher, {"verifier": verifier}),
            expires_at=utcnow() + timedelta(minutes=10),
        )
    )
    db.commit()
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=")
    return AUTHORIZE_URL + "?" + urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect,
            "response_type": "code",
            "scope": GMAIL_SCOPE,
            "state": state,
            "code_challenge": challenge.decode(),
            "code_challenge_method": "S256",
            "access_type": "offline",
            "prompt": "consent select_account",
            "login_hint": email,
        }
    ), cookie


def _request(client: httpx.Client, method: str, url: str, **kwargs) -> dict:
    # Fixed Google endpoints only. Never follow redirects, log bodies, or echo provider errors.
    try:
        with client.stream(method, url, **kwargs) as response:
            if response.status_code == 401:
                raise GmailError("Google consent has expired or been revoked. Reconnect Gmail.")
            if response.status_code == 429 or response.status_code >= 500:
                raise GmailError("Google is temporarily unavailable. Retry the scan later.")
            if not response.is_success:
                raise GmailError(
                    "Google rejected the request. Check consent and OAuth configuration."
                )
            content = bytearray()
            for chunk in response.iter_bytes(chunk_size=65_536):
                if len(content) + len(chunk) > MAX_RESPONSE_BYTES:
                    raise GmailError("A Google response exceeded the local sample size limit.")
                content.extend(chunk)
            data = json.loads(content)
        if not isinstance(data, dict):
            raise ValueError
        return data
    except (httpx.HTTPError, ValueError):
        raise GmailError("The Google request could not be completed. Retry later.") from None


def _token_data(data: dict, previous: dict | None = None) -> dict:
    if previous is None and "scope" not in data:
        raise GmailError("Google did not confirm the granted read-only permissions.")
    scopes = set(str(data.get("scope", GMAIL_SCOPE)).split())
    # A shared Web client can also have an identity-only sign-in grant.
    # Require read-only Gmail and reject every other mailbox/provider permission.
    identity_scopes = {"openid", "email", "https://www.googleapis.com/auth/userinfo.email"}
    if GMAIL_SCOPE not in scopes or scopes - {GMAIL_SCOPE} - identity_scopes:
        raise GmailError("Google returned unexpected permissions. Consent must be read-only Gmail.")
    access = data.get("access_token")
    refresh = data.get("refresh_token") or (previous or {}).get("refresh_token")
    if not isinstance(access, str) or not access or not isinstance(refresh, str) or not refresh:
        raise GmailError("Google did not return offline consent. Reconnect Gmail.")
    try:
        lifetime = max(60, min(int(data.get("expires_in", 3600)), 86_400))
    except (TypeError, ValueError):
        raise GmailError("Google returned invalid token expiry information.") from None
    return {
        "access_token": access,
        "refresh_token": refresh,
        "expires_at": (utcnow() + timedelta(seconds=lifetime)).timestamp(),
        "scope": GMAIL_SCOPE,
    }


def finish_consent(
    db: Session,
    state: str,
    cookie: str,
    code: str | None,
    denied: bool = False,
    expected_tenant: str | None = None,
) -> str:
    client_id, secret, redirect, cipher = _settings()
    attempt = db.get(OAuthAttempt, _digest(state))
    if (
        attempt is None
        or attempt.expires_at.replace(tzinfo=UTC) < utcnow()
        or not secrets.compare_digest(attempt.cookie_digest, _digest(cookie))
        or (expected_tenant is not None and attempt.tenant_id != expected_tenant)
    ):
        raise GmailError("Consent expired or the browser did not match. Start again.")
    tenant, expected_email = attempt.tenant_id, attempt.email
    verifier = _decrypt(cipher, attempt.encrypted_verifier)["verifier"]
    # Atomic consumption prevents two concurrent callbacks from exchanging the same code.
    consumed = db.execute(
        delete(OAuthAttempt).where(OAuthAttempt.state_digest == attempt.state_digest)
    ).rowcount
    db.commit()
    if not consumed:
        raise GmailError("Consent was already used. Start again.")
    if denied or not code:
        return "cancelled"
    with httpx.Client(timeout=20, follow_redirects=False) as client:
        data = _request(
            client,
            "POST",
            TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": secret,
                "code": code,
                "redirect_uri": redirect,
                "grant_type": "authorization_code",
                "code_verifier": verifier,
            },
        )
        tokens = _token_data(data)
        profile = _request(
            client,
            "GET",
            GMAIL_URL + "/profile",
            headers={"Authorization": "Bearer " + tokens["access_token"]},
        )
        if str(profile.get("emailAddress", "")).casefold() != expected_email:
            # Do not retain an accidentally selected account's grant.
            try:
                client.post(REVOKE_URL, data={"token": tokens["refresh_token"]})
            except httpx.HTTPError:
                pass
            raise GmailError("The selected Google account does not match the requested address.")
    account = db.scalar(
        select(Account).where(Account.tenant_id == tenant, Account.email == expected_email)
    )
    if account is None:
        account = create_account(
            db,
            tenant,
            AccountCreate(email=expected_email, provider="google", profile="personal_gmail"),
        )
    external_id = "gmail:" + _digest(expected_email)
    if account.delete_after is None:
        account.delete_after = utcnow() + timedelta(days=7)
    account.provider, account.profile = "google", "personal_gmail"
    source = db.scalar(
        select(Source).where(Source.tenant_id == tenant, Source.external_id == external_id)
    )
    if source is None:
        source = create_source(
            db,
            tenant,
            account.id,
            SourceCreate(
                source_type="gmail",
                name="Gmail · read-only",
                external_id=external_id,
                capabilities=["email"],
            ),
        )
    source.status = "active"
    credential = db.get(OAuthCredential, source.id)
    if credential is None:
        credential = OAuthCredential(source_id=source.id, tenant_id=tenant, encrypted_tokens="")
        db.add(credential)
    credential.encrypted_tokens = _encrypt(cipher, tokens)
    credential.updated_at = utcnow()
    db.add(
        AuditRecord(
            tenant_id=tenant,
            actor="user",
            action="gmail_connected",
            detail="Read-only Gmail consent granted; email signals only.",
        )
    )
    db.commit()
    return "connected"


def _access_token(db: Session, tenant: str, source_id: str, client: httpx.Client) -> str:
    client_id, secret, _redirect, cipher = _settings()
    credential = db.scalar(
        select(OAuthCredential).where(
            OAuthCredential.source_id == source_id, OAuthCredential.tenant_id == tenant
        )
    )
    if credential is None:
        raise GmailError("This Gmail source needs Google consent. Connect Gmail first.")
    tokens = _decrypt(cipher, credential.encrypted_tokens)
    if tokens["expires_at"] <= utcnow().timestamp() + 60:
        data = _request(
            client,
            "POST",
            TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": secret,
                "refresh_token": tokens["refresh_token"],
                "grant_type": "refresh_token",
            },
        )
        tokens = _token_data(data, tokens)
        credential.encrypted_tokens = _encrypt(cipher, tokens)
        credential.updated_at = utcnow()
        db.commit()
    return tokens["access_token"]


class _EmailHTML(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.text: list[str] = []
        self.links: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style"}:
            self.hidden += 1
        if tag == "a" and len(self.links) < 50:
            for key, value in attrs:
                if key == "href" and value and value.startswith(("https://", "http://")):
                    self.links.append(value[:2048])

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data: str) -> None:
        if not self.hidden:
            self.text.append(data)


def message_signal(message: dict) -> SignalInput:
    """Extract bounded text/headers without rendering HTML or fetching attachments/URLs."""
    payload = message.get("payload", {})
    headers: dict[str, list[str]] = {}
    for header in payload.get("headers", [])[:200]:
        name = str(header.get("name", "")).casefold()
        headers.setdefault(name, []).append(str(header.get("value", ""))[:4096])
    sender_header = headers.get("from", [""])[0]
    display_name, sender = parseaddr(sender_header)
    if not sender:
        raise GmailError("A Gmail message did not contain a usable sender address.")
    text, links = [], []
    pending = [(payload, 0)]
    visited = 0
    while pending and visited < 60:
        part, depth = pending.pop()
        visited += 1
        if part.get("filename"):
            continue
        mime = part.get("mimeType", "")
        encoded = part.get("body", {}).get("data", "")
        if mime in {"text/plain", "text/html"} and isinstance(encoded, str) and encoded:
            try:
                raw = base64.urlsafe_b64decode(
                    encoded[:140000] + "=" * (-len(encoded[:140000]) % 4)
                )
                content = raw.decode("utf-8", errors="replace")[:100000]
            except (ValueError, TypeError):
                raise GmailError("A Gmail message contained invalid encoded text.") from None
            if mime == "text/html":
                parser = _EmailHTML()
                parser.feed(content)
                text.extend(parser.text)
                links.extend(parser.links)
            else:
                text.append(content)
        if depth < 8:
            pending.extend((child, depth + 1) for child in part.get("parts", [])[:60])
    authentication: dict[str, str] = {}
    # Only the first provider-added result from Google's auth service is used.
    # This is observed header evidence, not independent signature verification.
    auth = headers.get("authentication-results", [""])[0]
    if re.match(r"^\s*mx\.google\.com\s*;", auth, re.IGNORECASE):
        authentication = {
            name.casefold(): result.casefold()
            for name, result in re.findall(
                r"\b(spf|dkim|dmarc)=(pass|fail|softfail|neutral|none)\b", auth, re.IGNORECASE
            )
        }
    try:
        occurred = datetime.fromtimestamp(int(message["internalDate"]) / 1000, UTC)
    except (KeyError, ValueError, TypeError, OverflowError, OSError):
        raise GmailError("A Gmail message contained an invalid receipt timestamp.") from None
    message_id = message.get("id", "")
    if not isinstance(message_id, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,255}", message_id):
        raise GmailError("Google returned an invalid message identifier.")
    return SignalInput(
        external_id="gmail:" + message_id,
        signal_type="email",
        occurred_at=occurred,
        features={
            "sender": sender[:320],
            "display_name": display_name[:200],
            "reply_to": parseaddr(headers.get("reply-to", [""])[0])[1][:320],
            "subject": headers.get("subject", [""])[0][:998],
            "body": " ".join(text)[:100000],
            "urls": list(dict.fromkeys(links))[:50],
            "authentication": authentication,
            # Custom Gmail labels can contain private words; retain only system labels.
            "labels": [
                label
                for label in message.get("labelIds", [])
                if label in {"INBOX", "SPAM", "TRASH", "UNREAD", "SENT"}
            ],
        },
    )


def scan_mailbox(
    db: Session, tenant: str, source_id: str, limit: int, days: int, *, job_id: str | None = None
) -> dict:
    source = get_source(db, tenant, source_id)
    if source.source_type != "gmail" or source.status != "active":
        raise ConflictError("Select an active Gmail source with read-only consent.")
    job = (
        get_scan_job(db, tenant, job_id)
        if job_id
        else create_scan_job(db, tenant, source_id, "user")
    )
    if job.source_id != source_id or job.status != "queued":
        raise ConflictError("Select a queued job belonging to this source.")
    deadline = time.monotonic() + SCAN_BUDGET_SECONDS
    try:
        with httpx.Client(timeout=20, follow_redirects=False) as client:
            access = _access_token(db, tenant, source_id, client)
            authorization = {"Authorization": "Bearer " + access}
            listing = _request(
                client,
                "GET",
                GMAIL_URL + "/messages",
                headers=authorization,
                params={
                    "q": f"in:inbox newer_than:{days}d",
                    "maxResults": limit,
                    "includeSpamTrash": "false",
                },
            )
            signals = []
            for item in listing.get("messages", [])[:limit]:
                if time.monotonic() >= deadline:
                    raise GmailError("The Gmail sample took too long. Retry with fewer messages.")
                identifier = item.get("id", "")
                if not isinstance(identifier, str) or not re.fullmatch(
                    r"[a-zA-Z0-9_-]{1,255}", identifier
                ):
                    raise GmailError("Google returned an invalid message identifier.")
                message = _request(
                    client,
                    "GET",
                    GMAIL_URL + "/messages/" + identifier,
                    headers=authorization,
                    params={"format": "full"},
                )
                signals.append(message_signal(message))
        if time.monotonic() >= deadline:
            raise GmailError("The Gmail sample took too long. Retry with fewer messages.")
        if signals:
            result = ingest_signals(
                db, tenant, source_id, SignalBatch(scan_job_id=job.id, signals=signals)
            )
            counts = {
                key: getattr(result, key)
                for key in ("imported_count", "duplicate_count", "finding_count")
            }
            incident_ids = sorted({i for item in result.items for i in item.incident_ids})
        else:
            job.status, job.attempts = "completed", 1
            job.started_at = job.completed_at = utcnow()
            db.add(
                AuditRecord(
                    tenant_id=tenant,
                    actor="system",
                    action="scan_completed",
                    detail=f"Scan {job.id}; imported 0; duplicates 0; findings 0.",
                )
            )
            db.commit()
            counts = {"imported_count": 0, "duplicate_count": 0, "finding_count": 0}
            incident_ids = []
        return {
            "job_id": job.id,
            "status": "completed",
            "incident_ids": incident_ids,
            "examined_count": len(signals),
            "sample_limited": True,
            **counts,
        }
    except Exception as exc:
        mark_scan_job_failed(db, tenant, job.id, source_id, exc)
        if isinstance(exc, GmailError):
            raise
        raise GmailError("The Gmail scan failed. No partial message batch was imported.") from None


def disconnect_gmail(db: Session, tenant: str, source_id: str) -> dict:
    source = get_source(db, tenant, source_id)
    if source.source_type != "gmail":
        raise ConflictError("This source is not Gmail.")
    credential = db.scalar(
        select(OAuthCredential).where(
            OAuthCredential.source_id == source_id, OAuthCredential.tenant_id == tenant
        )
    )
    revoked = credential is None
    if credential:
        try:
            tokens = _decrypt(_settings()[3], credential.encrypted_tokens)
            with httpx.Client(timeout=10, follow_redirects=False) as client:
                response = client.post(REVOKE_URL, data={"token": tokens["refresh_token"]})
                revoked = response.is_success
        except (GmailError, httpx.HTTPError):
            revoked = False
        db.delete(credential)
    source.status = "disconnected"
    schedule = db.get(ScanSchedule, source_id)
    if schedule and schedule.tenant_id == tenant:
        schedule.enabled = False
    db.add(
        AuditRecord(
            tenant_id=tenant,
            actor="user",
            action="gmail_disconnected",
            detail="Local consent removed; provider revocation "
            + ("confirmed." if revoked else "unconfirmed."),
        )
    )
    db.commit()
    return {
        "disconnected": True,
        "provider_revoked": revoked,
        "message": "Local tokens removed."
        if revoked
        else "Local tokens removed. Remove SentinelSME access in Google to confirm revocation.",
    }
