"""Explicit public deployment boundary. Local defaults never enable public access."""

import ipaddress
import os
import re
from pathlib import Path
from urllib.parse import urlsplit


class DeploymentError(RuntimeError):
    """Configuration errors contain field names, never secret values."""


def production() -> bool:
    # Invalid values are treated as restricted until validation rejects startup.
    return os.getenv("AI_SOC_ENVIRONMENT", "development") != "development"


def secret(name: str) -> str:
    if path := os.getenv(name + "_FILE"):
        try:
            value = Path(path).read_text(encoding="utf-8").strip()
        except (OSError, UnicodeError):
            raise DeploymentError(f"Cannot read {name}_FILE.") from None
        if not value:
            raise DeploymentError(f"{name}_FILE is empty.")
        return value
    return os.getenv(name, "")


def public_origin(value: str | None = None) -> str:
    value = os.getenv("AI_SOC_PUBLIC_ORIGIN", "") if value is None else value
    try:
        parsed = urlsplit(value)
        host = parsed.hostname or ""
        valid = (
            parsed.scheme == "https"
            and parsed.path in {"", "/"}
            and not parsed.query
            and not parsed.fragment
            and not parsed.username
            and not parsed.password
            and host == host.lower()
            and len(host) <= 253
            and "." in host
            and not host.endswith((".invalid", ".localhost", ".local"))
            and all(
                re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
                for label in host.split(".")
            )
            and (parsed.port is None or 1 <= parsed.port <= 65535)
        )
        try:
            ipaddress.ip_address(host)
            valid = False
        except ValueError:
            pass
        if not valid:
            raise ValueError
    except ValueError:
        raise DeploymentError(
            "AI_SOC_PUBLIC_ORIGIN must be one canonical HTTPS DNS origin."
        ) from None
    return f"https://{host}" + (f":{parsed.port}" if parsed.port and parsed.port != 443 else "")


def valid_callback(value: str, path: str) -> bool:
    if production():
        return value == public_origin() + path
    try:
        parsed = urlsplit(value)
        return (
            parsed.scheme == "http"
            and parsed.hostname in {"localhost", "127.0.0.1"}
            and parsed.path == path
            and not parsed.query
            and not parsed.fragment
            and not parsed.username
            and not parsed.password
            and (parsed.port is None or 1 <= parsed.port <= 65535)
        )
    except ValueError:
        return False


def signup_policy() -> str:
    value = os.getenv("AI_SOC_SIGNUP_POLICY", "invite_only")
    if value not in {"public", "invite_only"}:
        raise DeploymentError("AI_SOC_SIGNUP_POLICY must be public or invite_only.")
    return value


def retention_days() -> int:
    try:
        value = int(os.getenv("AI_SOC_EVIDENCE_RETENTION_DAYS", "30"))
        if not 1 <= value <= 365:
            raise ValueError
        return value
    except ValueError:
        raise DeploymentError("AI_SOC_EVIDENCE_RETENTION_DAYS must be between 1 and 365.") from None


def gmail_enabled() -> bool:
    if not production():
        return True
    value = os.getenv("AI_SOC_GMAIL_ENABLED", "false")
    if value not in {"true", "false"}:
        raise DeploymentError("AI_SOC_GMAIL_ENABLED must be true or false.")
    return value == "true"


def validate() -> None:
    from cryptography.fernet import Fernet

    if os.getenv("AI_SOC_ENVIRONMENT", "development") not in {"development", "production"}:
        raise DeploymentError("AI_SOC_ENVIRONMENT must be development or production.")
    signup_policy()
    if not production():
        return
    origin = public_origin()
    if os.getenv("AI_SOC_AUTH_MODE") != "google":
        raise DeploymentError("Production requires AI_SOC_AUTH_MODE=google.")
    hosts = {item.strip() for item in os.getenv("AI_SOC_ALLOWED_HOSTS", "").split(",")}
    if "*" in hosts or urlsplit(origin).hostname not in hosts:
        raise DeploymentError("AI_SOC_ALLOWED_HOSTS must explicitly include the public hostname.")
    if not os.getenv("AI_SOC_GOOGLE_CLIENT_ID"):
        raise DeploymentError("AI_SOC_GOOGLE_CLIENT_ID is required.")
    if not secret("AI_SOC_GOOGLE_CLIENT_SECRET") or not os.getenv(
        "AI_SOC_GOOGLE_CLIENT_SECRET_FILE"
    ):
        raise DeploymentError("Production requires a Google client secret file.")
    if not os.getenv("AI_SOC_TOKEN_KEY_FILE"):
        raise DeploymentError("Production requires AI_SOC_TOKEN_KEY_FILE.")
    try:
        Fernet(secret("AI_SOC_TOKEN_KEY").encode("ascii"))
    except (ValueError, UnicodeError):
        raise DeploymentError("The token encryption key file is invalid.") from None
    if not os.getenv("AI_SOC_DB_PASSWORD_FILE") or not secret("AI_SOC_DB_PASSWORD"):
        raise DeploymentError("Production requires an application database password file.")
    if os.getenv("AI_SOC_DATABASE_URL"):
        raise DeploymentError(
            "Use file-backed production database settings, not AI_SOC_DATABASE_URL."
        )
    if signup_policy() == "invite_only" and not os.getenv("AI_SOC_INVITED_EMAILS", "").strip():
        raise DeploymentError("Invitation-only production requires an invitation list.")
    for name, path in (
        ("AI_SOC_GOOGLE_LOGIN_REDIRECT_URI", "/api/v1/auth/callback"),
        ("AI_SOC_GOOGLE_REDIRECT_URI", "/api/v1/gmail/callback"),
    ):
        if not valid_callback(os.getenv(name, ""), path):
            raise DeploymentError(f"{name} must match the public origin and callback path.")
    retention_days()
    gmail_enabled()
