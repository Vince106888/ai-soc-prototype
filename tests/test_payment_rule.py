"""Bounded payment-redirection indicator and preserved authentication observations."""

import pytest

from app.entities import DetectionRule
from app.rules import DEFAULT_RULES, evaluate_rules, normalise_signal


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Use the new bank details and send payment to the supplier.", True),
        ("Please send payment for the approved invoice.", False),
        ("The new bank details are pending review.", False),
        ("Review renewed bank details and resend payments.", False),
        ("NEW PAYMENT INSTRUCTIONS: arrange a BANK TRANSFER.", True),
    ],
)
def test_payment_redirection_requires_both_phrase_groups(text, expected):
    _, features = normalise_signal("email", {"sender": "supplier@example.test", "body": text})
    matches = evaluate_rules(
        "email", features, [DetectionRule(**item, enabled=True) for item in DEFAULT_RULES]
    )
    match = next((item for item in matches if item.code == "EMAIL-006"), None)
    assert bool(match) is expected
    assert "body" not in features
    if match:
        assert match.weight == 0.50
        assert set(match.evidence) == {"payment_change_terms", "payment_action_terms"}
        assert text not in str(match.evidence)


def test_authentication_retains_only_known_checks_and_values():
    _, features = normalise_signal(
        "email",
        {
            "sender": "team@example.test",
            "authentication": {
                "spf": "PASS",
                "dkim": "fail",
                "dmarc": "unknown-private-text",
                "secret": "private",
            },
        },
    )
    assert features["authentication_results"] == {"spf": "pass", "dkim": "fail"}
    assert features["authentication_failures"] == ["dkim"]
    assert "private" not in str(features)
    _, absent = normalise_signal("email", {"sender": "team@example.test"})
    assert absent["authentication_results"] == {}
