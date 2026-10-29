"""Deterministic per-indicator reasons for the template explanation.

Each matched rule contributes two short statements:

* ``why`` is a feature-based explanation of why the indicator matters;
* ``legitimate_if`` is a counterfactual: the ordinary situation in which the same
  evidence would be expected. A controlled user study (Cau et al., 2025) found
  feature-based warnings worked best on real phishing and counterfactual ones
  reduced false alarms, so the dashboard shows both.

The warning-sign count summarises how many distinct indicators were visible. It
borrows the idea behind the NIST Phish Scale (fewer visible cues make a message
harder for people to spot) but it is not an implementation of that scale.
"""

from __future__ import annotations

REASONS: dict[str, tuple[str, str]] = {
    "EMAIL-001": (
        "Replies would go to a different domain from the sender, a common way to "
        "move a conversation to an attacker.",
        "The organisation uses a separate helpdesk or mailing service for replies.",
    ),
    "EMAIL-002": (
        "The message uses pressure or credential wording that tries to rush a decision.",
        "It is a routine reminder you were already expecting from this sender.",
    ),
    "URL-001": (
        "A shortened link hides its real destination until it is opened.",
        "The sender routinely shares shortened links and you can confirm them another way.",
    ),
    "URL-002": (
        "A link host uses sign-in wording but is not a recognised sign-in service.",
        "The host belongs to a service you already use, reached from its official site.",
    ),
    "EMAIL-003": (
        "The sender domain is only a character or two away from a domain you trust.",
        "The organisation genuinely owns both spellings; confirm before relying on it.",
    ),
    "EMAIL-004": (
        "The display name claims a known brand but the address is not that brand's domain.",
        "The brand sends through an approved third-party mailing service.",
    ),
    "EMAIL-005": (
        "Your provider reported that sender authentication failed, so the From "
        "address may be forged.",
        "The sender's mail settings are misconfigured; ask them through another channel.",
    ),
    "EMAIL-006": (
        "The message asks to change where a payment goes, the core step in invoice fraud.",
        "You confirmed the change by phoning a number you already had for this supplier.",
    ),
    "EMAIL-007": (
        "This is the first message from this address and it already asks for a payment change.",
        "A new contact at a known supplier introduced themselves through a channel you trust.",
    ),
    "EMAIL-008": (
        "The wording matches mobile-money reversal or tax-penalty pressure used in local scams.",
        "You were expecting this exact transaction or tax notice and can verify it in the "
        "official app or portal.",
    ),
    "FORWARD-001": (
        "Mail is being copied to an outside address that is not marked as approved.",
        "You set up this forwarding yourself for a known reason.",
    ),
    "SIGNIN-001": (
        "A sign-in looked unusual for this account, which can mean someone else has the password.",
        "You recently signed in from a new device, network or country.",
    ),
    "MFA-001": (
        "Without a second sign-in step, a stolen password is enough to take over the account.",
        "Another approved control protects this account; record it in the review note.",
    ),
    "OAUTH-001": (
        "An application holds broad or unverified access to account data.",
        "You installed this application on purpose and still use it.",
    ),
}
DEFAULT_REASON = (
    "A configured indicator matched the supplied evidence.",
    "The activity was expected and can be confirmed through a trusted channel.",
)


def reasons_for(findings: list) -> list[dict]:
    """Return one reason entry per distinct rule, strongest first."""

    ordered = sorted(findings, key=lambda item: (-item.weight, item.rule_code))
    seen: set[str] = set()
    out = []
    for finding in ordered:
        if finding.rule_code in seen:
            continue
        seen.add(finding.rule_code)
        why, legitimate_if = REASONS.get(finding.rule_code, DEFAULT_REASON)
        out.append(
            {
                "rule_code": finding.rule_code,
                "indicator": finding.title,
                "why": why,
                "legitimate_if": legitimate_if,
            }
        )
    return out[:8]


def warning_signs(reasons: list[dict]) -> dict:
    count = len(reasons)
    if count <= 1:
        level, note = (
            "few",
            "Only one warning sign was visible. Careful scams often look like this, so "
            "verify through a trusted channel instead of relying on how the message looks.",
        )
    elif count <= 3:
        level, note = (
            "some",
            "Several warning signs were visible. Check each one before acting.",
        )
    else:
        level, note = (
            "many",
            "Many warning signs were visible. Treat the request as suspicious until verified.",
        )
    return {"warning_signs": count, "warning_level": level, "warning_note": note}
