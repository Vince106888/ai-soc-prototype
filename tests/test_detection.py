from app.detection import analyze_message
from app.models import MessageInput


def test_benign_message_has_low_score():
    result = analyze_message(MessageInput(
        sender="lecturer@strathmore.edu",
        subject="Project meeting",
        body="Please review the agenda before tomorrow's meeting.",
        urls=["https://strathmore.edu/agenda"],
    ))
    assert result.score == 0
    assert result.severity == "low"
    assert result.findings == []


def test_suspicious_message_produces_evidence_backed_score():
    result = analyze_message(MessageInput(
        sender="Support <support@example.com>",
        reply_to="recovery@unknown.test",
        subject="Urgent: verify your account",
        body="Your account is suspended. Click here immediately.",
        urls=["https://bit.ly/example", "https://secure-account.test/login"],
    ))
    assert result.score >= 55
    assert result.severity in {"high", "critical"}
    assert len(result.findings) >= 3

