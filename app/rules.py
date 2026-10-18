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
PAYMENT_CHANGE_TERMS = [
    "new bank details",
    "updated bank details",
    "change bank account",
    "change of bank details",
    "update payment details",
    "new payment instructions",
    # Kenyan mobile-money equivalents of a changed payment destination.
    "new paybill",
    "new paybill number",
    "new till number",
    "change of paybill",
    "paybill has changed",
    "till number has changed",
]
PAYMENT_ACTION_TERMS = [
    "wire transfer",
    "bank transfer",
    "transfer the payment",
    "send payment",
    "pay the invoice",
    "payment to",
    "pay via mpesa",
    "pay through mpesa",
    "paybill number",
    "till number",
    "account number",
]
# Kenyan mobile-money and tax pressure wording. These phrases also appear in
# legitimate mail, so the rule is a low-weight review indicator, not a verdict.
# "m-pesa" and "m pesa" are folded to "mpesa" before matching.
LOCAL_SCAM_TERMS = [
    "mpesa reversal",
    "reverse the transaction",
    "sent to you by mistake",
    "sent by mistake",
    "kra penalty",
    "tax refund",
    "itax account suspended",
    "fuliza limit",
]
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
    # Kenyan brands commonly impersonated in payment and tax lures. Domains
    # were checked against each organisation's public website (October 2026).
    "safaricom": ["safaricom.co.ke"],
    "kra": ["kra.go.ke"],
    "ecitizen": ["ecitizen.go.ke"],
    "equity bank": ["equitybank.com", "equitybank.co.ke"],
    "kcb": ["kcbgroup.com"],
    "co-operative bank": ["co-opbank.co.ke"],
}
# Display-name phrases that claim a brand. Multi-word bank names avoid matching
# ordinary words such as "equity" in an unrelated newsletter name.
BRAND_ALIASES = {
    "google": ["google"],
    "microsoft": ["microsoft"],
    "strathmore": ["strathmore"],
    "safaricom": ["safaricom", "mpesa"],
    "kra": ["kra", "kenya revenue authority"],
    "ecitizen": ["ecitizen", "e citizen"],
    "equity bank": ["equity bank"],
    "kcb": ["kcb", "kcb bank"],
    "co-operative bank": ["co operative bank", "coop bank", "co op bank"],
}
# Feature flags a rule may list in ``suppress_if``. A trusted sender silences
# only content-style indicators; authentication, lookalike, brand and payment
# redirection rules always run because a trusted supplier can be compromised.
SUPPRESSION_FLAGS = {"trusted_sender"}
TRUST_SUPPRESSIBLE = ["trusted_sender"]

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
        "version": 2,
        "configuration": {
            "suppress_if": TRUST_SUPPRESSIBLE,
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
        "version": 2,
        "configuration": {
            "suppress_if": TRUST_SUPPRESSIBLE,
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
        "version": 2,
        "configuration": {
            "suppress_if": TRUST_SUPPRESSIBLE,
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
        "version": 2,
        "configuration": {
            "suppress_if": TRUST_SUPPRESSIBLE,
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
        "code": "EMAIL-006",
        "signal_type": "email",
        "title": "Payment redirection request",
        "weight": 0.50,
        "confidence": 0.75,
        "configuration": {
            "matcher": "all_nonempty",
            "fields": ["payment_change_terms", "payment_action_terms"],
            "evidence": ["payment_change_terms", "payment_action_terms"],
        },
    },
    {
        "code": "EMAIL-007",
        "signal_type": "email",
        "title": "First-contact sender requesting a payment change",
        "weight": 0.35,
        "confidence": 0.80,
        "configuration": {
            "matcher": "all_nonempty",
            "fields": ["first_contact", "payment_change_terms"],
            "evidence": ["first_contact", "sender_domain", "payment_change_terms"],
        },
    },
    {
        "code": "EMAIL-008",
        "signal_type": "email",
        "title": "Mobile-money or tax pressure wording",
        "weight": 0.30,
        "confidence": 0.70,
        "configuration": {
            "suppress_if": TRUST_SUPPRESSIBLE,
            "matcher": "nonempty",
            "field": "local_scam_terms",
            "evidence": ["local_scam_terms"],
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


MPESA_VARIANTS = re.compile(r"(?<!\w)m[\s-]?pesa(?!\w)")


def _fold(text: str) -> str:
    return MPESA_VARIANTS.sub("mpesa", text.casefold())


def _matched_terms(text: str, terms: list[str] = URGENT_TERMS) -> list[str]:
    folded = _fold(text)
    return sorted(term for term in terms if re.search(rf"(?<!\w){re.escape(term)}(?!\w)", folded))


def _edit_distance(left: str, right: str, maximum: int = 2) -> int:
    """Return a small Levenshtein distance using a threshold-banded matrix."""

    if abs(len(left) - len(right)) > maximum:
        return maximum + 1
    if len(left) > len(right):
        left, right = right, left

    sentinel = maximum + 1
    previous = {index: index for index in range(min(len(right), maximum) + 1)}
    for left_index, left_character in enumerate(left, start=1):
        start = max(1, left_index - maximum)
        end = min(len(right), left_index + maximum)
        current: dict[int, int] = {0: left_index} if left_index <= maximum else {}
        for right_index in range(start, end + 1):
            current[right_index] = min(
                current.get(right_index - 1, sentinel) + 1,
                previous.get(right_index, sentinel) + 1,
                previous.get(right_index - 1, sentinel)
                + (left_character != right[right_index - 1]),
            )
        previous = current
        if not current or min(current.values()) > maximum:
            return maximum + 1
    return min(previous.get(len(right), sentinel), sentinel)


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
        display_text = " " + " ".join(re.findall(r"[a-z0-9]+", _fold(display_name))) + " "
        claimed_brand = next(
            (
                brand
                for brand, aliases in BRAND_ALIASES.items()
                if any(f" {alias} " in display_text for alias in aliases)
            ),
            "",
        )
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
        authentication_results = {
            key: str(authentication[key]).casefold()
            for key in ("spf", "dkim", "dmarc")
            if key in authentication
            and str(authentication[key]).casefold()
            in {"pass", "fail", "failed", "softfail", "neutral", "none", "temperror", "permerror"}
        }
        text = f"{subject} {body}"
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
            "matched_terms": _matched_terms(text),
            "payment_change_terms": _matched_terms(text, PAYMENT_CHANGE_TERMS),
            "payment_action_terms": _matched_terms(text, PAYMENT_ACTION_TERMS),
            "local_scam_terms": _matched_terms(text, LOCAL_SCAM_TERMS),
            "claimed_domains": claimed_domains,
            "lookalike_domain": lookalike_domain,
            "claimed_brand": claimed_brand,
            "brand_mismatch": brand_mismatch,
            "authentication_failures": authentication_failures,
            "authentication_results": authentication_results,
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


def apply_context(features: dict, context: SenderContext | None) -> dict:
    """Add workspace context (trusted senders, sender history) to email features.

    Context is evaluated at ingestion and stored as booleans, so a later change to
    the trusted list never re-scores retained evidence.
    """

    if context is None:
        return features
    features = dict(features)
    sender = features.get("sender", "")
    domain = features.get("sender_domain", "")
    trusted_match = bool(sender) and (
        sender in context.trusted_addresses
        or any(_is_same_or_subdomain(domain, item) for item in context.trusted_domains)
    )
    # A failed SPF/DKIM/DMARC result means the From address may be forged, so it
    # cannot earn trust.
    features["trusted_sender"] = trusted_match and not features.get("authentication_failures")
    features["first_contact"] = bool(sender) and context.first_contact and not trusted_match
    claimed = set(features.get("claimed_domains", []))
    claimed.update(context.trusted_domains)
    claimed.update(address.rsplit("@", 1)[-1] for address in context.trusted_addresses)
    features["claimed_domains"] = sorted(claimed)[:20]
    features["lookalike_domain"] = any(
        not _is_same_or_subdomain(domain, item) and _edit_distance(domain, item) <= 2
        for item in features["claimed_domains"]
    )
    return features


@dataclass(frozen=True)
class SenderContext:
    trusted_addresses: frozenset[str]
    trusted_domains: frozenset[str]
    first_contact: bool


def _matches(configuration: dict, features: dict) -> bool:
    if any(features.get(flag) for flag in configuration.get("suppress_if", [])):
        return False
    matcher = configuration.get("matcher")
    if matcher == "different_nonempty":
        left, right = (features.get(field) for field in configuration["fields"])
        return bool(left and right and left != right)
    if matcher == "nonempty":
        return bool(features.get(configuration["field"]))
    if matcher == "all_nonempty":
        return all(features.get(field) for field in configuration["fields"])
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
