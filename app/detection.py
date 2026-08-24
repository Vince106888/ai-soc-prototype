import re
from urllib.parse import urlparse

from .models import AnalysisResult, Finding, MessageInput

SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "ow.ly", "is.gd"}
URGENT_TERMS = {
    "urgent", "immediately", "verify your account", "password expires",
    "account suspended", "click here", "confirm your identity",
}


def _domain(address: str | None) -> str:
    if not address or "@" not in address:
        return ""
    return address.rsplit("@", 1)[1].lower().strip("> ")


def analyze_message(message: MessageInput) -> AnalysisResult:
    findings: list[Finding] = []
    sender_domain = _domain(message.sender)
    reply_domain = _domain(message.reply_to)

    if reply_domain and sender_domain and reply_domain != sender_domain:
        findings.append(Finding(
            rule_id="EMAIL-001", title="Reply-to domain mismatch",
            evidence=f"Sender uses {sender_domain}, but replies go to {reply_domain}.", weight=25,
        ))

    text = f"{message.subject} {message.body}".lower()
    matched = sorted(term for term in URGENT_TERMS if term in text)
    if matched:
        findings.append(Finding(
            rule_id="EMAIL-002", title="Urgent or credential-seeking language",
            evidence="Matched language: " + ", ".join(matched), weight=20,
        ))

    for url in message.urls:
        host = (urlparse(url).hostname or "").lower()
        if host in SHORTENERS:
            findings.append(Finding(
                rule_id="URL-001", title="Shortened URL",
                evidence=f"The URL uses the shortening service {host}.", weight=20,
            ))
        if re.search(r"(?:login|verify|secure|account)[.-]", host):
            findings.append(Finding(
                rule_id="URL-002", title="Credential-themed domain",
                evidence=f"The hostname {host} contains a credential-themed label.", weight=25,
            ))

    score = min(100, sum(f.weight for f in findings))
    severity = "critical" if score >= 80 else "high" if score >= 55 else "medium" if score >= 25 else "low"
    explanation = (
        "This message contains multiple indicators that should be reviewed before the user clicks a link or replies."
        if findings else "No configured suspicious indicators were detected in this controlled analysis."
    )
    actions = (
        ["Do not open the links yet.", "Verify the sender through a separate trusted channel.",
         "Use the organisation's official website to access the account."]
        if findings else ["Continue normal caution and report unexpected requests."]
    )
    return AnalysisResult(score=score, severity=severity, findings=findings,
                          explanation=explanation, recommended_actions=actions)

