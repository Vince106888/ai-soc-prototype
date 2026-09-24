"""Deterministic email and URL analysis for the first prototype slice.

Each rule returns observable evidence and a fixed score contribution. No AI
model decides whether a message is suspicious, and supplied URLs are parsed
locally but never opened.
"""

import re
from email.utils import parseaddr
from urllib.parse import urlparse

from .models import AnalysisResult, Finding, MessageInput

# Small, explicit catalogues keep the first rule set reproducible and auditable.
SHORTENERS = frozenset({"bit.ly", "tinyurl.com", "t.co", "ow.ly", "is.gd"})
URGENT_TERMS = frozenset(
    {
        "urgent",
        "immediately",
        "verify your account",
        "password expires",
        "account suspended",
        "click here",
        "confirm your identity",
    }
)
CREDENTIAL_LABELS = frozenset({"account", "login", "secure", "verify"})
RULE_WEIGHTS = {
    "EMAIL-001": 25,
    "EMAIL-002": 20,
    "URL-001": 20,
    "URL-002": 25,
}


def _domain(address: str | None) -> str:
    """Extract a canonical lowercase domain from a validated mailbox."""

    if not address:
        return ""
    _, parsed_address = parseaddr(address, strict=True)
    return parsed_address.rsplit("@", 1)[1].lower().rstrip(".")


def _contains_term(text: str, term: str) -> bool:
    """Match a phrase at word boundaries instead of as an arbitrary substring."""

    return re.search(rf"(?<!\w){re.escape(term)}(?!\w)", text) is not None


def _is_shortener(host: str) -> bool:
    """Recognise a listed shortener and its subdomains without suffix confusion."""

    return any(host == service or host.endswith(f".{service}") for service in SHORTENERS)


def _severity_for(score: int) -> str:
    """Map a bounded numeric score to the documented severity bands."""

    if score >= 80:
        return "critical"
    if score >= 55:
        return "high"
    if score >= 25:
        return "medium"
    return "low"


def analyze_message(message: MessageInput) -> AnalysisResult:
    """Run every configured rule and build an evidence-backed result."""

    findings: list[Finding] = []
    sender_domain = _domain(message.sender)
    reply_domain = _domain(message.reply_to)

    # EMAIL-001: replies going to another domain can indicate impersonation.
    if reply_domain and reply_domain != sender_domain:
        findings.append(
            Finding(
                rule_id="EMAIL-001",
                title="Reply-to domain mismatch",
                evidence=f"Sender uses {sender_domain}, but replies go to {reply_domain}.",
                weight=RULE_WEIGHTS["EMAIL-001"],
            )
        )

    # EMAIL-002: social-engineering language is checked without interpreting it.
    text = f"{message.subject} {message.body}".casefold()
    matched_terms = sorted(term for term in URGENT_TERMS if _contains_term(text, term))
    if matched_terms:
        findings.append(
            Finding(
                rule_id="EMAIL-002",
                title="Urgent or credential-seeking language",
                evidence="Matched language: " + ", ".join(matched_terms),
                weight=RULE_WEIGHTS["EMAIL-002"],
            )
        )

    # Canonicalise and deduplicate hosts so repeated URLs cannot inflate a score.
    hosts = {(urlparse(str(url)).hostname or "").casefold().rstrip(".") for url in message.urls}
    hosts.discard("")

    shortener_hosts = sorted(host for host in hosts if _is_shortener(host))
    if shortener_hosts:
        findings.append(
            Finding(
                rule_id="URL-001",
                title="Shortened URL",
                evidence="Shortening service used: " + ", ".join(shortener_hosts) + ".",
                weight=RULE_WEIGHTS["URL-001"],
            )
        )

    credential_hosts = sorted(
        host
        for host in hosts
        if any(label in CREDENTIAL_LABELS for label in re.split(r"[.-]", host))
    )
    if credential_hosts:
        findings.append(
            Finding(
                rule_id="URL-002",
                title="Credential-themed domain",
                evidence="Credential-themed hostname used: " + ", ".join(credential_hosts) + ".",
                weight=RULE_WEIGHTS["URL-002"],
            )
        )

    # Scoring is additive, capped at 100, and mapped to fixed severity bands.
    score = min(100, sum(finding.weight for finding in findings))
    severity = _severity_for(score)

    # Guidance comes from an approved static catalogue rather than generated text.
    if findings:
        explanation = (
            "This message contains indicators that should be reviewed before "
            "the user clicks a link or replies."
        )
        actions = [
            "Do not open the links yet.",
            "Verify the sender through a separate trusted channel.",
            "Use the organisation's official website to access the account.",
        ]
    else:
        explanation = "No configured suspicious indicators were detected in this analysis."
        actions = ["Continue normal caution and report unexpected requests."]

    return AnalysisResult(
        score=score,
        severity=severity,
        findings=findings,
        explanation=explanation,
        recommended_actions=actions,
    )
