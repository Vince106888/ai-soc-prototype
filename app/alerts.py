"""Alerts for new or escalated incidents: in-app always, webhook opt-in.

Alerts carry the incident title, severity, score and rule codes only. They never
contain message subjects, senders, bodies, URLs or attachments. Delivery runs in
the worker after evidence has committed, so a slow channel never delays ingestion.
"""

import ipaddress
import socket
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from .entities import Alert, AlertSettings, AuditRecord, Incident, utcnow
from .platform_schemas import AlertSettingsUpdate

SEVERITY_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}
MAX_ATTEMPTS = 3
DELIVERY_BATCH = 20
DEFAULT_MINIMUM = "high"


class AlertConfigError(ValueError):
    """Invalid alert configuration; the message is safe to show to the user."""


def get_settings(db: Session, tenant: str) -> AlertSettings:
    row = db.get(AlertSettings, tenant)
    if row is None:
        row = AlertSettings(
            tenant_id=tenant,
            minimum_severity=DEFAULT_MINIMUM,
            webhook_enabled=False,
        )
    return row


def _require_public_host(host: str) -> None:
    """Refuse loopback, private and link-local targets (basic SSRF guard)."""

    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
    except OSError:
        raise AlertConfigError("Webhook host could not be resolved.") from None
    if not addresses or not all(ipaddress.ip_address(a).is_global for a in addresses):
        raise AlertConfigError("Webhook host must resolve to a public address.")


def _check_webhook_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise AlertConfigError("Webhook URL must be an https address without credentials.")
    if parsed.port not in {None, 443}:
        raise AlertConfigError("Webhook URL must use the default https port.")
    _require_public_host(parsed.hostname)


def configure(
    db: Session,
    tenant: str,
    payload: AlertSettingsUpdate,
    *,
    actor: str,
) -> AlertSettings:
    if payload.webhook_enabled:
        if not payload.webhook_url:
            raise AlertConfigError("Enter a webhook URL.")
        _check_webhook_url(payload.webhook_url)
    row = db.get(AlertSettings, tenant)
    if row is None:
        row = AlertSettings(tenant_id=tenant)
        db.add(row)
    row.minimum_severity = payload.minimum_severity
    row.webhook_enabled = payload.webhook_enabled
    row.webhook_url = payload.webhook_url if payload.webhook_enabled else None
    row.updated_at = utcnow()
    db.add(
        AuditRecord(
            tenant_id=tenant,
            actor=actor,
            action="alert_settings_changed",
            detail=(
                f"Minimum {row.minimum_severity}; webhook {'on' if row.webhook_enabled else 'off'}."
            ),
        )
    )
    db.commit()
    return row


def record_alert(db: Session, incident: Incident, rule_codes: list[str]) -> Alert | None:
    """Create one alert when an incident first reaches, or escalates past, the threshold."""

    settings = get_settings(db, incident.tenant_id)
    if SEVERITY_RANK.get(incident.severity, 0) < SEVERITY_RANK[settings.minimum_severity]:
        return None
    exists = db.scalar(
        select(Alert.id).where(
            Alert.incident_id == incident.id, Alert.severity == incident.severity
        )
    )
    if exists:
        return None
    alert = Alert(
        tenant_id=incident.tenant_id,
        incident_id=incident.id,
        severity=incident.severity,
        title=incident.title,
        score=incident.score,
        rule_codes=",".join(sorted(set(rule_codes)))[:300],
        webhook_status="pending" if settings.webhook_enabled and settings.webhook_url else "none",
    )
    db.add(alert)
    db.add(
        AuditRecord(
            tenant_id=incident.tenant_id,
            incident_id=incident.id,
            actor="system",
            action="alert_raised",
            detail=f"{incident.severity} incident alert raised.",
        )
    )
    return alert


def list_alerts(db: Session, tenant: str, *, unread_only: bool = False, limit: int = 50):
    statement = select(Alert).where(Alert.tenant_id == tenant)
    if unread_only:
        statement = statement.where(Alert.read_at.is_(None))
    return list(db.scalars(statement.order_by(Alert.created_at.desc()).limit(limit)))


def mark_read(db: Session, tenant: str, alert_id: str | None = None) -> int:
    statement = select(Alert).where(Alert.tenant_id == tenant, Alert.read_at.is_(None))
    if alert_id:
        statement = statement.where(Alert.id == alert_id)
    rows = list(db.scalars(statement))
    for row in rows:
        row.read_at = utcnow()
    db.commit()
    return len(rows)


def _payload(alert: Alert) -> dict:
    return {
        "event": "incident.alert",
        "incident_id": alert.incident_id,
        "severity": alert.severity,
        "title": alert.title,
        "score": alert.score,
        "rule_codes": alert.rule_codes.split(",") if alert.rule_codes else [],
        "created_at": alert.created_at.isoformat(),
    }


def _post_webhook(url: str, alert: Alert) -> None:
    _check_webhook_url(url)
    response = httpx.post(url, json=_payload(alert), timeout=10, follow_redirects=False)
    response.raise_for_status()


def deliver_pending(db: Session) -> dict:
    """Send pending external alerts; give up after bounded attempts. Never logs targets."""

    counts = {"sent": 0, "failed": 0}
    pending = list(
        db.scalars(
            select(Alert)
            .where(Alert.webhook_status == "pending")
            .order_by(Alert.created_at)
            .limit(DELIVERY_BATCH)
        )
    )
    for alert in pending:
        settings = db.get(AlertSettings, alert.tenant_id)
        alert.attempts += 1
        if alert.webhook_status != "pending":
            continue
        target = settings.webhook_url if settings else None
        try:
            if not target:
                raise RuntimeError("Channel disabled")
            _post_webhook(target, alert)
            alert.webhook_status = "sent"
            counts["sent"] += 1
        except Exception:  # Failure detail may include the target, so none is kept.
            if alert.attempts >= MAX_ATTEMPTS or not target:
                alert.webhook_status = "failed"
                counts["failed"] += 1
                db.add(
                    AuditRecord(
                        tenant_id=alert.tenant_id,
                        incident_id=alert.incident_id,
                        actor="system",
                        action="alert_webhook_failed",
                        detail="Delivery gave up after bounded attempts.",
                    )
                )
        db.commit()
    return counts
