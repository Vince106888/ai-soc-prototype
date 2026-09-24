"""Configuration-driven normalisation and deterministic detection rules."""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from email.utils import parseaddr
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from .entities import DetectionRule

SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "ow.ly", "is.gd"]
URGENT_TERMS = [
    "urgent",
    "immediately",
    "verify your account",
    "password expires",
    "account suspended",
    "click here",
    "confirm your identity",
]
CREDENTIAL_LABELS = ["account", "login", "secure", "verify"]
BROAD_OAUTH_SCOPES = [
    "mail.google.com",
    "gmail.modify",
    "gmail.readonly",
    "drive",
    "admin.directory.user",
]
TRUSTED_CREDENTIAL_HOSTS = [
    "accounts.google.com",
    "login.microsoftonline.com",
    "login.live.com",
    "appleid.apple.com",
]
BRAND_DOMAINS = {
    "google": ["google.com"],
    "microsoft": ["microsoft.com", "microsoftonline.com", "outlook.com"],
    "strathmore": ["strathmore.edu"],
}

# The matching behaviour, evidence fields, weights, and confidence values are
# all data. Adding another instance of a supported matcher does not require a
# schema, API, or dashboard change.
DEFAULT_RULES = [
    {
        "code": "EMAIL-001",
        "signal_type": "email",
        "title": "Reply-to domain mismatch",
        "weight": 0.45,
        "confidence": 0.95,
        "configuration": {
            "matcher": "different_nonempty",
            "fields": ["sender_domain", "reply_to_domain"],
            "evidence": ["sender_domain", "reply_to_domain"],
        },
    },
    {
        "code": "EMAIL-002",
        "signal_type": "email",
        "title": "Urgent or credential-seeking language",
        "weight": 0.30,
        "confidence": 0.85,
        "configuration": {
            "matcher": "nonempty",
            "field": "matched_terms",
            "evidence": ["matched_terms"],
        },
    },
    {
        "code": "URL-001",
        "signal_type": "email",
        "title": "Shortened URL",
        "weight": 0.30,
        "confidence": 0.98,
        "configuration": {
            "matcher": "host_suffix_in",
            "field": "url_hosts",
            "values": SHORTENERS,
            "evidence": ["url_hosts"],
        },
    },
    {
        "code": "URL-002",
        "signal_type": "email",
        "title": "Credential-themed link domain",
        "weight": 0.45,
        "confidence": 0.80,
        "configuration": {
            "matcher": "host_label_untrusted",
            "field": "url_hosts",
            "values": CREDENTIAL_LABELS,
            "trusted_hosts": TRUSTED_CREDENTIAL_HOSTS,
            "evidence": ["url_hosts"],
        },
    },
    {
        "code": "EMAIL-003",
        "signal_type": "email",
        "title": "Lookalike sender domain",
        "weight": 0.65,
        "confidence": 0.85,
        "configuration": {
            "matcher": "equals",
            "field": "lookalike_domain",
            "value": True,
            "evidence": ["sender_domain", "claimed_domains"],
        },
    },
    {
        "code": "EMAIL-004",
        "signal_type": "email",
        "title": "Display-name and sender-domain mismatch",
        "weight": 0.55,
        "confidence": 0.85,
        "configuration": {
            "matcher": "equals",
            "field": "brand_mismatch",
            "value": True,
            "evidence": ["display_name", "sender_domain", "claimed_brand"],
        },
    },
    {
        "code": "EMAIL-005",
        "signal_type": "email",
        "title": "Email authentication failed",
        "weight": 0.55,
        "confidence": 0.95,
        "configuration": {
            "matcher": "nonempty",
            "field": "authentication_failures",
            "evidence": ["authentication_failures"],
        },
    },
    {
        "code": "FORWARD-001",
        "signal_type": "forwarding",
        "title": "Risky external forwarding rule",
        "weight": 0.70,
        "confidence": 0.95,
        "configuration": {
            "matcher": "all_equal",
            "conditions": {"enabled": True, "external": True, "authorized": False},
            "evidence": ["target_domain", "enabled", "external", "authorized"],
        },
    },
    {
        "code": "SIGNIN-001",
        "signal_type": "signin",
        "title": "Unusual sign-in activity",
        "weight": 0.65,
        "confidence": 0.80,
        "configuration": {
            "matcher": "any_equal",
            "conditions": {
                "unusual": True,
                "new_device": True,
                "impossible_travel": True,
                "risk_level": "high",
            },
            "evidence": [
                "source_country",
                "new_device",
                "impossible_travel",
                "risk_level",
            ],
        },
    },
    {
        "code": "MFA-001",
        "signal_type": "mfa",
        "title": "Multi-factor authentication disabled",
        "weight": 0.60,
        "confidence": 0.99,
        "configuration": {
            "matcher": "equals",
            "field": "enabled",
            "value": False,
            "evidence": ["enabled", "method_count"],
        },
    },
    {
        "code": "OAUTH-001",
        "signal_type": "oauth_grant",
        "title": "Broad or untrusted third-party grant",
        "weight": 0.80,
        "confidence": 0.90,
        "configuration": {
            "matcher": "any_equal",
            "conditions": {"broad_scope": True, "verified": False},
            "evidence": ["app_name", "broad_scope", "verified", "scope_categories"],
        },
    },
]


@dataclass(frozen=True)
class RuleMatch:
    code: str
    title: str
    weight: float
    confidence: float
    evidence: dict


def seed_rules(session: Session) -> None:
    """Insert the versioned defaults while preserving deliberate DB overrides."""

    existing = set(session.scalars(select(DetectionRule.code)).all())
    for item in DEFAULT_RULES:
        if item["code"] not in existing:
            session.add(DetectionRule(**item))
    session.flush()


def _address_domain(value: object) -> tuple[str, str]:
    if not isinstance(value, str):
        return "", ""
    _name, address = parseaddr(value)
    address = address.casefold().strip()
    domain = address.rsplit("@", 1)[-1].rstrip(".") if "@" in address else ""
    return address, domain


def _host(value: object) -> str:
    if not isinstance(value, str):
        return ""
    candidate = value if "://" in value else f"https://{value}"
    return (urlparse(candidate).hostname or "").casefold().rstrip(".")


def _matched_terms(text: str) -> list[str]:
    folded = text.casefold()
    return sorted(
        term for term in URGENT_TERMS if re.search(rf"(?<!\w){re.escape(term)}(?!\w)", folded)
    )


def _edit_distance(left: str, right: str, maximum: int = 2) -> int:
    """Return an exact small distance or ``maximum + 1`` with bounded work."""

    if abs(len(left) - len(right)) > maximum:
        return maximum + 1
    previous = list(range(len(right) + 1))
    for left_index, left_character in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_character in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1] + (left_character != right_character),
                )
            )
        previous = current
        if min(current) > maximum:
            return maximum + 1
    return previous[-1]


def _is_same_or_subdomain(host: str, trusted: str) -> bool:
    return host == trusted or host.endswith(f".{trusted}")


def normalise_signal(signal_type: str, raw: dict) -> tuple[str, dict]:
    """Return canonical signal type and privacy-minimised derived features."""

    signal_type = "signin" if signal_type == "sign_in" else signal_type
    if signal_type == "email":
        sender, sender_domain = _address_domain(raw.get("sender"))
        reply_to, reply_to_domain = _address_domain(raw.get("reply_to"))
        body = str(raw.get("body", ""))
        body_urls = re.findall(r"https?://[^\s<>\"']+", body, flags=re.IGNORECASE)
        urls = raw.get("urls", [])
        if not isinstance(urls, list):
            urls = []
        url_hosts = sorted({host for item in [*urls, *body_urls] if (host := _host(item))})
        subject = str(raw.get("subject", ""))[:998]
        claimed_domains = sorted(
            {
                str(item).casefold().rstrip(".")
                for item in raw.get("claimed_domains", [])
                if isinstance(item, str) and item
            }
        )[:20]
        lookalike_domain = any(
            not _is_same_or_subdomain(sender_domain, claimed)
            and _edit_distance(sender_domain, claimed) <= 2
            for claimed in claimed_domains
        )
        display_name = str(raw.get("display_name", ""))[:200]
        display_words = set(re.findall(r"[a-z0-9]+", display_name.casefold()))
        claimed_brand = next((brand for brand in BRAND_DOMAINS if brand in display_words), "")
        brand_mismatch = bool(
            claimed_brand
            and sender_domain
            and not any(
                _is_same_or_subdomain(sender_domain, trusted)
                for trusted in BRAND_DOMAINS[claimed_brand]
            )
        )
        supplied_authentication = raw.get("authentication", {})
        authentication = (
            dict(supplied_authentication) if isinstance(supplied_authentication, dict) else {}
        )
        authentication.update(
            {
                key: raw[key]
                for key in ("spf", "dkim", "dmarc")
                if key in raw and key not in authentication
            }
        )
        authentication_failures = sorted(
            key
            for key, value in authentication.items()
            if key in {"spf", "dkim", "dmarc"}
            and str(value).casefold() in {"fail", "failed", "softfail"}
        )
        return signal_type, {
            "sender": sender,
            "sender_domain": sender_domain,
            "reply_to": reply_to,
            "reply_to_domain": reply_to_domain,
            "display_name": display_name,
            "subject": subject,
            "labels": [str(item)[:100] for item in raw.get("labels", [])][:50],
            "url_hosts": url_hosts[:50],
            # Store only the matched phrases, never the complete message body.
            "matched_terms": _matched_terms(f"{subject} {body}"),
            "claimed_domains": claimed_domains,
            "lookalike_domain": lookalike_domain,
            "claimed_brand": claimed_brand,
            "brand_mismatch": brand_mismatch,
            "authentication_failures": authentication_failures,
        }
    if signal_type == "forwarding":
        target, target_domain = _address_domain(raw.get("target"))
        account_domain = str(raw.get("account_domain", "")).casefold().rstrip(".")
        external = bool(raw.get("external", target_domain != account_domain))
        return signal_type, {
            "target": target,
            "target_domain": target_domain,
            "enabled": bool(raw.get("enabled", True)),
            "external": external,
            "authorized": bool(raw.get("authorized", False)),
        }
    if signal_type == "signin":
        risk_level = str(raw.get("risk_level", "unknown")).casefold()
        return signal_type, {
            "source_ip": str(raw.get("source_ip", ""))[:64],
            "source_country": str(raw.get("source_country", "unknown"))[:100],
            "new_device": bool(raw.get("new_device", False)),
            "unusual": bool(raw.get("unusual", False)),
            "impossible_travel": bool(raw.get("impossible_travel", False)),
            "risk_level": risk_level if risk_level in {"low", "medium", "high"} else "unknown",
            "success": bool(raw.get("success", True)),
        }
    if signal_type == "mfa":
        try:
            method_count = max(0, int(raw.get("method_count", 0)))
        except (TypeError, ValueError):
            method_count = 0
        return signal_type, {
            "enabled": bool(raw.get("enabled")),
            "method_count": method_count,
        }
    if signal_type == "oauth_grant":
        scopes = [str(scope).casefold()[:200] for scope in raw.get("scopes", [])][:100]
        scope_categories = sorted(
            {name for name in BROAD_OAUTH_SCOPES if any(name in scope for scope in scopes)}
        )
        return signal_type, {
            "app_name": str(raw.get("app_name", "unknown application"))[:200],
            "app_id": str(raw.get("app_id", ""))[:255],
            "verified": bool(raw.get("verified", False)),
            "broad_scope": bool(raw.get("broad_scope", bool(scope_categories))),
            # Persist categories rather than OAuth scope/token material.
            "scope_categories": scope_categories,
        }
    raise ValueError(f"unsupported signal type: {signal_type}")


def default_correlation_key(signal_type: str, features: dict) -> str:
    field_by_type = {
        "email": "sender_domain",
        "forwarding": "target_domain",
        "signin": "source_ip",
        "mfa": "enabled",
        "oauth_grant": "app_id",
    }
    field = field_by_type[signal_type]
    value = features.get(field)
    if value in (None, ""):
        value = signal_type
    return f"{field}:{str(value).casefold()}"[:255]


def signal_fingerprint(signal_type: str, features: dict) -> str:
    serialised = json.dumps(
        {"signal_type": signal_type, "features": features}, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(serialised.encode()).hexdigest()


def _matches(configuration: dict, features: dict) -> bool:
    matcher = configuration.get("matcher")
    if matcher == "different_nonempty":
        left, right = (features.get(field) for field in configuration["fields"])
        return bool(left and right and left != right)
    if matcher == "nonempty":
        return bool(features.get(configuration["field"]))
    if matcher == "equals":
        return features.get(configuration["field"]) == configuration.get("value")
    if matcher == "all_equal":
        return all(
            features.get(field) == value for field, value in configuration["conditions"].items()
        )
    if matcher == "any_equal":
        return any(
            features.get(field) == value for field, value in configuration["conditions"].items()
        )
    if matcher == "host_suffix_in":
        return any(
            host == suffix or host.endswith(f".{suffix}")
            for host in features.get(configuration["field"], [])
            for suffix in configuration["values"]
        )
    if matcher == "host_label_in":
        return any(
            label in configuration["values"]
            for host in features.get(configuration["field"], [])
            for label in re.split(r"[.-]", host)
        )
    if matcher == "host_label_untrusted":
        trusted_hosts = configuration.get("trusted_hosts", [])
        return any(
            not any(_is_same_or_subdomain(host, trusted) for trusted in trusted_hosts)
            and any(label in configuration["values"] for label in re.split(r"[.-]", host))
            for host in features.get(configuration["field"], [])
        )
    return False


def evaluate_rules(signal_type: str, features: dict, rules: list[DetectionRule]) -> list[RuleMatch]:
    matches = []
    for rule in rules:
        if (
            rule.enabled
            and rule.signal_type == signal_type
            and _matches(rule.configuration, features)
        ):
            evidence = {
                field: features.get(field)
                for field in rule.configuration.get("evidence", [])
                if field in features
            }
            matches.append(
                RuleMatch(
                    code=rule.code,
                    title=rule.title,
                    weight=round(rule.weight, 4),
                    confidence=round(rule.confidence, 4),
                    evidence=evidence,
                )
            )
    return matches


def combine_weights(weights: list[float]) -> float:
    """Combine independent contributions as ``1 - product(1 - weight)``."""

    return round(1.0 - math.prod(1.0 - max(0.0, min(1.0, item)) for item in weights), 4)


def severity_for(score: float) -> str:
    if score >= 0.80:
        return "critical"
    if score >= 0.60:
        return "high"
    if score >= 0.30:
        return "medium"
    return "low"
