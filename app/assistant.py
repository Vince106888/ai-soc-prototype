"""Grounded explanation assistant for the console's "Ask LindaBiz" panel.

Answers are assembled from structured data the platform already stores: the
incident's findings, deterministic explanation, recommendations and the rule
catalogue. No language model is called and nothing here creates findings,
changes scores, infers missing telemetry or performs remediation. A question
that asks for any of those is declined with an explanation of what to do
instead. Questions and answers are not stored; the audit record keeps only the
topic and incident reference.
"""

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .entities import AuditRecord, DetectionRule
from .platform import incident_detail
from .platform_schemas import AssistantReply, IncidentDetail

RULE_CODE = re.compile(r"\b([A-Za-z]{3,8}-\d{3})\b")

REMEDIATION = re.compile(
    r"\b(delete|remove|block|quarantine|reset|change|disable|revoke|lock|unlock|fix|"
    r"clean|ban|report to|forward|reply|send)\b.*\b(email|mail|message|account|password|"
    r"sender|mailbox|user|it|this)\b|\bdo it for me\b|\bact on\b",
    re.IGNORECASE,
)

TOPICS: list[tuple[str, re.Pattern]] = [
    (
        "score",
        re.compile(r"\b(score|priority|severity|critical|how bad|how serious|risk|band)\b", re.I),
    ),
    (
        "next",
        re.compile(
            r"\b(next|should i|what do i do|what can i do|action|recommend|advice|steps?)\b", re.I
        ),
    ),
    (
        "legitimate",
        re.compile(
            r"\b(legit|legitimate|false positive|safe|trust|genuine|real|harmless|okay|ok)\b", re.I
        ),
    ),
    (
        "why",
        re.compile(
            r"\b(why|flagged|reason|rules?|indicators?|warning signs?|evidence|matched)\b", re.I
        ),
    ),
    (
        "privacy",
        re.compile(
            r"\b(privacy|store|stored|retain|retention|keep|data|bod(?:y|ies)|attachments?)\b",
            re.I,
        ),
    ),
    (
        "scanning",
        re.compile(
            r"\b(scan|scanning|gmail|schedule|automatic|manual|sample|mailbox|inbox)\b", re.I
        ),
    ),
    ("alerts", re.compile(r"\b(alerts?|webhook|notif\w*|bell)\b", re.I)),
    (
        "happened",
        re.compile(
            r"\b(what happened|explain|summary|summari[sz]e|means?|this|incident|about)\b",
            re.I,
        ),
    ),
]

SUGGESTIONS_INCIDENT = [
    "What happened here?",
    "Why was this flagged?",
    "What should I do next?",
    "What does the score mean?",
    "Could this be legitimate?",
]
SUGGESTIONS_GENERAL = [
    "How is the priority score calculated?",
    "What does LindaBiz store?",
    "How do automatic scans work?",
    "How do alerts work?",
]

BANDS = "Critical is 80 and above, high 60 to 79, medium 30 to 59 and low below 30."


def _percent(value: float) -> int:
    return round(value * 100)


def _reply(answer: str, topic: str, *, refs=None, incident=False) -> AssistantReply:
    return AssistantReply(
        answer=answer,
        topic=topic,
        references=sorted(set(refs or [])),
        suggestions=SUGGESTIONS_INCIDENT if incident else SUGGESTIONS_GENERAL,
        grounded_in="incident" if incident else "general",
    )


def _rule_answer(db: Session, code: str, detail: IncidentDetail | None) -> AssistantReply:
    rule = db.scalar(select(DetectionRule).where(DetectionRule.code == code.upper()))
    if rule is None:
        return _reply(
            f"I don't have a rule called {code.upper()}. Open Detection to browse the "
            "catalogue of rules LindaBiz applies.",
            "rule",
            incident=detail is not None,
        )
    parts = [
        f"{rule.code} is “{rule.title}”. It applies to {rule.signal_type} signals, has a weight of "
        f"{rule.weight:.2f} and a configured confidence of {rule.confidence:.2f}. "
        f"It is currently {'enabled' if rule.enabled else 'disabled'}.",
        "Weight sets review priority and confidence is configured, not calibrated; "
        "neither measures how likely an attack is.",
    ]
    if detail is not None:
        matched = [item for item in detail.findings if item.rule_code == rule.code]
        parts.append(
            f"It matched {len(matched)} time(s) on this incident."
            if matched
            else "It did not match on this incident."
        )
    return _reply(" ".join(parts), "rule", refs=[rule.code], incident=detail is not None)


def _score_answer(detail: IncidentDetail | None) -> AssistantReply:
    formula = (
        "The score is 1 − the product of (1 − weight) across the matched rules, so every extra "
        "independent rule raises it but it can never exceed 100. "
    )
    if detail is None:
        return _reply(
            f"{formula}{BANDS} Priority orders what to review first; it is not the probability "
            "that an attack occurred.",
            "score",
        )
    weights = ", ".join(f"{item.rule_code} {item.weight:.2f}" for item in detail.findings)
    return _reply(
        f"This incident scores {_percent(detail.score)} out of 100, which is {detail.severity} "
        f"priority. {formula}Here the weights were {weights or 'none'}. {BANDS} "
        "It is a priority for human review, not the probability that an attack occurred.",
        "score",
        refs=[item.rule_code for item in detail.findings],
        incident=True,
    )


def _next_answer(detail: IncidentDetail | None) -> AssistantReply:
    if detail is None:
        return _reply(
            "Open an incident and ask again: I will list its recommended next steps. In general, "
            "verify the sender through a separate trusted channel before opening links, and use "
            "the organisation's official website to reach any account.",
            "next",
        )
    steps = [f"{item.position}. {item.action}" for item in detail.recommendations]
    text = " ".join(steps) if steps else detail.explanation.next_step
    return _reply(
        f"{detail.explanation.next_step} Recommended steps: {text} These are advisory only. "
        "LindaBiz will not change your account or take action for you; you record your decision "
        "under “Record your decision”.",
        "next",
        refs=[item.rule_code for item in detail.findings],
        incident=True,
    )


def _why_answer(detail: IncidentDetail | None) -> AssistantReply:
    if detail is None:
        return _reply(
            "Open an incident and ask “Why was this flagged?”. I will list each matched rule, "
            "what it means and when it could be legitimate.",
            "why",
        )
    reasons = detail.explanation.reasons
    if reasons:
        lines = [f"{item.indicator} ({item.rule_code}): {item.why}" for item in reasons]
    else:
        lines = [f"{item.title} ({item.rule_code})" for item in detail.findings]
    return _reply(
        f"{len(detail.findings)} deterministic rule(s) matched. " + " ".join(lines),
        "why",
        refs=[item.rule_code for item in detail.findings],
        incident=True,
    )


def _legitimate_answer(detail: IncidentDetail | None) -> AssistantReply:
    cannot = (
        "LindaBiz cannot certify that a message is safe, and no matched rule proves it is "
        "malicious. "
    )
    if detail is None:
        return _reply(
            cannot + "Open an incident and ask again to see when each warning sign could be "
            "legitimate. If you confirm a message is genuine, mark it a false positive; you can "
            "also trust the sender for new evidence.",
            "legitimate",
        )
    cases = [f"{item.rule_code}: {item.legitimate_if}" for item in detail.explanation.reasons]
    body = " ".join(cases) if cases else "Check the matched rules under Evidence."
    return _reply(
        f"{cannot}It could be legitimate if — {body} Verify through a trusted channel. If you "
        "confirm it is genuine, record it as a false positive (optionally trusting the sender "
        "for new evidence; authentication and payment-change checks still run).",
        "legitimate",
        refs=[item.rule_code for item in detail.findings],
        incident=True,
    )


def _happened_answer(detail: IncidentDetail | None) -> AssistantReply:
    if detail is None:
        return _reply(
            "Select an incident first and I will explain what happened, why it matters and what "
            "to do next, using only its stored findings.",
            "happened",
        )
    text = f"{detail.explanation.what_happened} {detail.explanation.why_it_matters}"
    if detail.explanation.warning_note:
        text += f" {detail.explanation.warning_note}"
    return _reply(
        text,
        "happened",
        refs=[item.rule_code for item in detail.findings],
        incident=True,
    )


STATIC = {
    "privacy": (
        "LindaBiz keeps minimised evidence: matched phrases, link hostnames and a few "
        "observations. It does not keep full message bodies or attachments, never opens links, "
        "and never sends, deletes or changes mail. Trial data is deleted automatically after the "
        "retention period shown in Connections, and you can delete an account's data there."
    ),
    "scanning": (
        "You choose how each Gmail mailbox is scanned. Manual (the default) scans only when you "
        "request a bounded sample. Automatic runs on a schedule you set (every 15 minutes to "
        "daily) and needs your separate consent first; pausing it is one click. Scans are "
        "read-only and bounded in size, and automatic scans need the background worker running."
    ),
    "alerts": (
        "An in-app alert (the bell) is raised once per incident when it reaches your chosen "
        "level, High and above by default. You can also add an https webhook. Alerts carry the "
        "title, severity, score and rule codes only, never message text. Email alerts are not "
        "offered because email is the evidence LindaBiz analyses."
    ),
    "remediation": (
        "I can't do that. LindaBiz only explains evidence; it does not delete, block, "
        "quarantine, send or change anything, and I can't act on your accounts. Do the action "
        "yourself in your mail provider, then record your decision on the incident."
    ),
    "fallback": (
        "I can explain what happened on an incident, why it was flagged, what the score means, "
        "what to do next, whether it could be legitimate, how a rule such as EMAIL-002 works, "
        "and how scanning, alerts and privacy work. I can't judge a message that isn't an "
        "incident, and I don't make findings of my own."
    ),
}


def ask(
    db: Session, tenant_id: str, question: str, incident_id: str | None = None, actor: str = "user"
) -> AssistantReply:
    detail = incident_detail(db, tenant_id, incident_id) if incident_id else None
    text = question.strip()
    reply: AssistantReply

    if REMEDIATION.search(text):
        reply = _reply(STATIC["remediation"], "remediation", incident=detail is not None)
    elif code := RULE_CODE.search(text):
        reply = _rule_answer(db, code.group(1), detail)
    else:
        topic = next((name for name, pattern in TOPICS if pattern.search(text)), None)
        if topic == "score":
            reply = _score_answer(detail)
        elif topic == "next":
            reply = _next_answer(detail)
        elif topic == "legitimate":
            reply = _legitimate_answer(detail)
        elif topic == "why":
            reply = _why_answer(detail)
        elif topic in STATIC:
            reply = _reply(STATIC[topic], topic, incident=detail is not None)
        elif topic == "happened":
            reply = _happened_answer(detail)
        else:
            reply = _reply(STATIC["fallback"], "fallback", incident=detail is not None)

    db.add(
        AuditRecord(
            tenant_id=tenant_id,
            incident_id=incident_id,
            actor=actor,
            action="assistant_asked",
            detail=f"Topic {reply.topic}.",
        )
    )
    db.commit()
    return reply
