"""Unit tests for deterministic detection, validation, and scoring."""

import pytest
from pydantic import ValidationError

from app.detection import _severity_for, analyze_message
from app.models import MAX_URLS, MessageInput


def test_benign_message_has_low_score():
    """A normal organisational message should not trigger a configured rule."""

    result = analyze_message(
        MessageInput(
            sender="lecturer@strathmore.edu",
            subject="Project meeting",
            body="Please review the agenda before tomorrow's meeting.",
            urls=["https://strathmore.edu/agenda"],
        )
    )

    assert result.score == 0
    assert result.severity == "low"
    assert result.findings == []


def test_suspicious_message_produces_expected_evidence_backed_score():
    """The reference fixture should deterministically trigger all four rules."""

    result = analyze_message(
        MessageInput(
            sender="Support <support@example.com>",
            reply_to="recovery@unknown.test",
            subject="Urgent: verify your account",
            body="Your account is suspended. Click here immediately.",
            urls=["https://bit.ly/example", "https://secure-account.test/login"],
        )
    )

    assert result.score == 90
    assert result.severity == "critical"
    assert [finding.rule_id for finding in result.findings] == [
        "EMAIL-001",
        "EMAIL-002",
        "URL-001",
        "URL-002",
    ]


def test_same_reply_to_domain_does_not_trigger_mismatch():
    result = analyze_message(
        MessageInput(
            sender="Support <support@example.com>",
            reply_to="help@example.com",
        )
    )

    assert all(finding.rule_id != "EMAIL-001" for finding in result.findings)


def test_explicitly_empty_reply_to_is_supported():
    message = MessageInput(sender="sender@example.com", reply_to=None)

    assert message.reply_to is None


def test_urgent_term_requires_word_boundaries():
    result = analyze_message(
        MessageInput(
            sender="sender@example.com",
            subject="The urgently scheduled maintenance",
        )
    )

    assert all(finding.rule_id != "EMAIL-002" for finding in result.findings)


def test_repeated_shortener_urls_do_not_inflate_score():
    result = analyze_message(
        MessageInput(
            sender="sender@example.com",
            urls=["https://bit.ly/example", "https://bit.ly/example"],
        )
    )

    assert result.score == 20
    assert [finding.rule_id for finding in result.findings] == ["URL-001"]


def test_shortener_subdomain_is_detected_but_suffix_impersonation_is_not():
    shortener_result = analyze_message(
        MessageInput(sender="sender@example.com", urls=["https://go.bit.ly/example"])
    )
    impersonator_result = analyze_message(
        MessageInput(sender="sender@example.com", urls=["https://bit.ly.evil.test/example"])
    )

    assert any(finding.rule_id == "URL-001" for finding in shortener_result.findings)
    assert all(finding.rule_id != "URL-001" for finding in impersonator_result.findings)


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (0, "low"),
        (24, "low"),
        (25, "medium"),
        (54, "medium"),
        (55, "high"),
        (79, "high"),
        (80, "critical"),
        (100, "critical"),
    ],
)
def test_severity_boundaries(score: int, expected: str):
    assert _severity_for(score) == expected


@pytest.mark.parametrize(
    "data",
    [
        {"sender": ""},
        {"sender": "not-an-email"},
        {"sender": "sender@example.com trailing-text"},
        {"sender": "sender@example.com,other@example.com"},
        {"sender": "sender@example.com\r\nBcc: victim@example.com"},
        {"sender": "sender@example.com", "urls": ["not-a-url"]},
        {"sender": "sender@example.com", "urls": ["ftp://example.com/file"]},
        {"sender": "sender@example.com", "urls": ["https://user:secret@example.com/"]},
        {"sender": "sender@example.com", "urls": ["https://example.com"] * (MAX_URLS + 1)},
        {"sender": "sender@example.com", "unexpected": "field"},
    ],
)
def test_invalid_or_unsafe_input_is_rejected(data: dict[str, object]):
    with pytest.raises(ValidationError):
        MessageInput.model_validate(data)
