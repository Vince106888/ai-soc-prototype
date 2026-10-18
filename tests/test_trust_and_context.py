"""Trusted senders, first-contact history and Kenya-localised indicators."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app import database
from app.api import router
from app.entities import DetectionRule, SenderHistory
from app.rules import DEFAULT_RULES, SenderContext, apply_context, evaluate_rules, normalise_signal

pytestmark = pytest.mark.anyio
RULES = [DetectionRule(**item, enabled=True) for item in DEFAULT_RULES]


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client(tmp_path, monkeypatch):
    monkeypatch.delenv("AI_SOC_API_KEY", raising=False)
    database.configure_database(f"sqlite:///{(tmp_path / 'trust.db').as_posix()}")
    database.create_schema()
    app = FastAPI()
    app.include_router(router)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c


async def seed(client, tenant="alpha"):
    headers = {"X-Tenant-ID": tenant}
    account = (
        await client.post(
            "/api/v1/accounts", headers=headers, json={"email": f"owner@{tenant}.test"}
        )
    ).json()
    source = (
        await client.post(
            f"/api/v1/accounts/{account['id']}/sources",
            headers=headers,
            json={"name": "Trust test", "external_id": tenant, "capabilities": ["email"]},
        )
    ).json()
    return headers, account, source


def email(external_id, sender, body, *, when=None, auth=None, **extra):
    features = {"sender": sender, "subject": "Notice", "body": body, **extra}
    if auth:
        features["authentication"] = auth
    item = {"external_id": external_id, "signal_type": "email", "features": features}
    if when:
        item["occurred_at"] = when.isoformat()
    return item


async def ingest(client, headers, source, *signals):
    response = await client.post(
        f"/api/v1/sources/{source['id']}/signals", headers=headers, json={"signals": list(signals)}
    )
    assert response.status_code == 201, response.text
    return response.json()["items"]


async def codes(client, headers, item):
    detail = (await client.get(f"/api/v1/signals/{item['signal_id']}", headers=headers)).json()
    return {finding["rule_code"] for finding in detail["findings"]}, detail["features"]


def match_codes(raw, context=None):
    _, features = normalise_signal("email", raw)
    features = apply_context(features, context)
    return {match.code for match in evaluate_rules("email", features, RULES)}, features


# ----------------------------------------------------------------- trusted senders
async def test_trusted_domain_silences_content_rules_but_not_spoofing_or_payment(client):
    headers, _account, source = await seed(client)
    added = await client.post(
        "/api/v1/trusted-senders",
        headers=headers,
        json={"kind": "domain", "value": "Supplier.CO.KE.", "note": "Main supplier"},
    )
    assert added.status_code == 201 and added.json()["value"] == "supplier.co.ke"
    items = await ingest(
        client,
        headers,
        source,
        email("urgent", "accounts@billing.supplier.co.ke", "Urgent: click here bit.ly/x"),
        email(
            "forged",
            "accounts@supplier.co.ke",
            "urgent, click here",
            auth={"spf": "fail", "dmarc": "fail"},
        ),
        email(
            "bec",
            "ceo@supplier.co.ke",
            "We have new bank details, please send payment today.",
        ),
    )
    urgent, features = await codes(client, headers, items[0])
    assert urgent == set() and features["trusted_sender"] is True
    assert features["first_contact"] is False
    forged, features = await codes(client, headers, items[1])
    # Failed authentication means the From address may be forged: no trust.
    assert {"EMAIL-002", "EMAIL-005"} <= forged and features["trusted_sender"] is False
    bec, _ = await codes(client, headers, items[2])
    assert bec == {"EMAIL-006"}  # a trusted supplier can still be compromised


async def test_trusted_list_validation_idempotency_removal_and_isolation(client):
    headers, *_ = await seed(client)
    for value, kind in [("gmail.com", "domain"), ("not a domain", "domain"), ("x@", "address")]:
        response = await client.post(
            "/api/v1/trusted-senders", headers=headers, json={"kind": kind, "value": value}
        )
        assert response.status_code == 422
    body = {"kind": "address", "value": "Friend@Gmail.com"}
    first = (await client.post("/api/v1/trusted-senders", headers=headers, json=body)).json()
    again = (await client.post("/api/v1/trusted-senders", headers=headers, json=body)).json()
    assert first["id"] == again["id"] and first["value"] == "friend@gmail.com"
    assert (
        await client.get("/api/v1/trusted-senders", headers={"X-Tenant-ID": "beta"})
    ).json() == []
    assert (
        await client.delete(
            f"/api/v1/trusted-senders/{first['id']}", headers={"X-Tenant-ID": "beta"}
        )
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/trusted-senders/{first['id']}", headers=headers)
    ).status_code == 204
    assert (await client.get("/api/v1/trusted-senders", headers=headers)).json() == []
    audit = (await client.get("/api/v1/audit", headers=headers)).json()
    assert {"trusted_sender_added", "trusted_sender_removed"} <= {a["action"] for a in audit}
    assert "friend@gmail.com" not in str(audit)


async def test_false_positive_can_trust_sender_for_new_evidence_only(client):
    headers, _account, source = await seed(client)
    items = await ingest(
        client, headers, source, email("news", "news@updates.example.org", "Urgent: click here")
    )
    incident_id = items[0]["incident_ids"][0]
    refused = await client.patch(
        f"/api/v1/incidents/{incident_id}/status",
        headers=headers,
        json={"status": "under_review", "trust_sender": "domain"},
    )
    assert refused.status_code == 409
    marked = await client.patch(
        f"/api/v1/incidents/{incident_id}/status",
        headers=headers,
        json={"status": "false_positive", "trust_sender": "domain"},
    )
    assert marked.status_code == 200 and marked.json()["status"] == "false_positive"
    trusted = (await client.get("/api/v1/trusted-senders", headers=headers)).json()
    assert [(t["kind"], t["value"]) for t in trusted] == [("domain", "updates.example.org")]
    later = await ingest(
        client, headers, source, email("news-2", "news@updates.example.org", "Urgent: click here")
    )
    assert later[0]["finding_count"] == 0
    # Stored evidence is not re-scored after the list changes.
    old = (await client.get(f"/api/v1/incidents/{incident_id}", headers=headers)).json()
    assert old["finding_count"] == 1


async def test_shared_provider_domain_cannot_be_trusted_from_false_positive(client):
    headers, _account, source = await seed(client)
    items = await ingest(client, headers, source, email("x", "someone@gmail.com", "urgent"))
    incident_id = items[0]["incident_ids"][0]
    response = await client.patch(
        f"/api/v1/incidents/{incident_id}/status",
        headers=headers,
        json={"status": "false_positive", "trust_sender": "domain"},
    )
    assert response.status_code == 409
    detail = (await client.get(f"/api/v1/incidents/{incident_id}", headers=headers)).json()
    assert detail["status"] == "new"  # refused before the status changed


async def test_trusted_domain_enables_lookalike_detection(client):
    headers, _account, source = await seed(client)
    await client.post(
        "/api/v1/trusted-senders",
        headers=headers,
        json={"kind": "domain", "value": "kenpower.co.ke"},
    )
    items = await ingest(client, headers, source, email("look", "billing@kenp0wer.co.ke", "Hello"))
    found, features = await codes(client, headers, items[0])
    assert "EMAIL-003" in found and "kenpower.co.ke" in features["claimed_domains"]


# ----------------------------------------------------------------- first contact
async def test_first_contact_uses_hashed_history_and_earliest_time(client):
    headers, account, source = await seed(client)
    now = datetime.now(UTC)
    body = "Our paybill has changed. Please pay the invoice to the new paybill number."
    newer, older = await ingest(
        client,
        headers,
        source,
        email("newer", "accounts@vendor.example", body, when=now),
        email("older", "accounts@vendor.example", body, when=now - timedelta(days=3)),
    )
    newer_codes, newer_features = await codes(client, headers, newer)
    older_codes, older_features = await codes(client, headers, older)
    assert {"EMAIL-006", "EMAIL-007"} <= newer_codes and newer_features["first_contact"] is True
    # A sample delivered newest-first still treats the earliest message as first contact.
    assert "EMAIL-007" in older_codes and older_features["first_contact"] is True
    repeat = await ingest(
        client, headers, source, email("third", "accounts@vendor.example", body, when=now)
    )
    third_codes, third_features = await codes(client, headers, repeat[0])
    assert "EMAIL-007" not in third_codes and third_features["first_contact"] is False
    with database.SessionLocal() as db:
        rows = list(db.scalars(select(SenderHistory)))
    assert len(rows) == 1 and rows[0].message_count == 3
    assert "vendor.example" not in rows[0].sender_digest
    assert (await client.delete(f"/api/v1/accounts/{account['id']}", headers=headers)).status_code
    with database.SessionLocal() as db:
        assert list(db.scalars(select(SenderHistory))) == []


def test_first_contact_alone_is_not_an_indicator():
    found, features = match_codes(
        {"sender": "hello@new.example", "body": "Nice to meet you"},
        SenderContext(frozenset(), frozenset(), first_contact=True),
    )
    assert features["first_contact"] is True and found == set()


# ----------------------------------------------------------------- Kenya localisation
@pytest.mark.parametrize(
    ("display", "sender", "expected"),
    [
        ("M-PESA Support", "alerts@mpesa-help.example", "safaricom"),
        ("Safaricom Care", "care@safaricom.co.ke", ""),
        ("KRA iTax", "notices@kra-refunds.example", "kra"),
        ("Kenya Revenue Authority", "service@kra.go.ke", ""),
        ("Equity Bank Alerts", "alerts@equity-secure.example", "equity bank"),
        ("Equity Research Weekly", "news@research.example", None),
        ("KCB Bank", "info@kcbgroup.com", ""),
        ("Co-operative Bank", "alerts@co-opbank.co.ke", ""),
    ],
)
def test_kenyan_brand_impersonation(display, sender, expected):
    found, features = match_codes({"sender": sender, "display_name": display, "body": "Hi"})
    if expected is None:
        assert features["claimed_brand"] == ""
    else:
        assert features["claimed_brand"] or not expected
        assert ("EMAIL-004" in found) is bool(expected)


@pytest.mark.parametrize(
    ("text", "rule", "expected"),
    [
        ("Ksh 2,000 was sent to you by mistake, kindly reverse the transaction", "EMAIL-008", True),
        ("Request an M-Pesa reversal now", "EMAIL-008", True),
        ("Your KRA penalty is due today", "EMAIL-008", True),
        ("Thanks for the meeting notes", "EMAIL-008", False),
        ("Our new till number is 12345, pay via M-PESA", "EMAIL-006", True),
        ("Pay the invoice using paybill number 400200", "EMAIL-006", False),
    ],
)
def test_local_scam_and_mobile_money_wording(text, rule, expected):
    found, features = match_codes({"sender": "x@unknown.example", "body": text})
    assert (rule in found) is expected
    assert "body" not in features and text not in str(features)


def test_migration_upgrades_seeded_v1_rules_and_creates_tables(tmp_path):
    from pathlib import Path

    from alembic.config import Config
    from sqlalchemy import inspect

    from alembic import command

    url = f"sqlite:///{(tmp_path / 'upgrade.db').as_posix()}"
    database.configure_database(url)
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.attributes["database_url_configured_by_app"] = True
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "9d213bf807a2")
    with database.SessionLocal() as db:
        db.add(
            DetectionRule(
                code="EMAIL-002",
                signal_type="email",
                title="Urgent or credential-seeking language",
                weight=0.3,
                confidence=0.85,
                configuration={"matcher": "nonempty", "field": "matched_terms", "evidence": []},
                version=1,
            )
        )
        db.add(
            DetectionRule(
                code="EMAIL-005",
                signal_type="email",
                title="Email authentication failed",
                weight=0.55,
                confidence=0.95,
                configuration={"matcher": "nonempty", "field": "authentication_failures"},
                version=1,
            )
        )
        db.commit()
    command.upgrade(config, "head")
    with database.SessionLocal() as db:
        urgent = db.get(DetectionRule, "EMAIL-002")
        auth = db.get(DetectionRule, "EMAIL-005")
        assert urgent.version == 2 and urgent.configuration["suppress_if"] == ["trusted_sender"]
        assert auth.version == 1 and "suppress_if" not in auth.configuration
    tables = set(inspect(database.engine).get_table_names())
    assert {"trusted_senders", "sender_history"} <= tables


# ----------------------------------------------------------------- explanations
def test_every_default_rule_has_feature_and_counterfactual_reasons():
    from app.guidance import REASONS

    assert {item["code"] for item in DEFAULT_RULES} <= set(REASONS)
    for why, legitimate_if in REASONS.values():
        assert 20 < len(why) < 200 and 20 < len(legitimate_if) < 200


async def test_incident_explanation_lists_reasons_and_warning_signs(client):
    headers, _account, source = await seed(client)
    items = await ingest(
        client,
        headers,
        source,
        email(
            "multi",
            "ceo@payments.example",
            "Urgent: new bank details, send payment today. Details at bit.ly/abc",
            reply_to="pay@elsewhere.example",
        ),
    )
    case = (
        await client.get(f"/api/v1/incidents/{items[0]['incident_ids'][0]}", headers=headers)
    ).json()
    explanation = case["explanation"]
    codes_in_order = [reason["rule_code"] for reason in explanation["reasons"]]
    assert set(codes_in_order) == {f["rule_code"] for f in case["findings"]}
    assert codes_in_order[0] == "EMAIL-006"  # strongest first
    assert all(reason["why"] and reason["legitimate_if"] for reason in explanation["reasons"])
    assert explanation["warning_signs"] == len(codes_in_order) >= 4
    assert explanation["warning_level"] == "many"
    single = await ingest(client, headers, source, email("one", "a@b.example", "urgent"))
    one = (
        await client.get(f"/api/v1/incidents/{single[0]['incident_ids'][0]}", headers=headers)
    ).json()["explanation"]
    assert one["warning_level"] == "few" and "trusted channel" in one["warning_note"]


# ----------------------------------------------------------------- posture self-check
async def test_posture_self_check_feeds_posture_rules_and_skips_unsure(client):
    headers, account, _source = await seed(client)
    url = f"/api/v1/accounts/{account['id']}/posture-check"
    response = await client.post(
        url,
        headers=headers,
        json={
            "mfa": "off",
            "forwarding": "unapproved",
            "forwarding_domain": "@Mail.Example.org",
            "apps": [
                {
                    "name": "Invoice Helper",
                    "full_mailbox_access": True,
                    "from_known_developer": False,
                },
                {"name": "Calendar", "full_mailbox_access": False, "from_known_developer": True},
            ],
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["submitted"] == ["mfa", "forwarding", "app:1", "app:2"] and body["skipped"] == []
    rules = set()
    for item in body["ingestion"]["items"]:
        found, _ = await codes(client, headers, item)
        rules |= found
    assert rules == {"MFA-001", "FORWARD-001", "OAUTH-001"}
    sources = (
        await client.get(f"/api/v1/accounts/{account['id']}/sources", headers=headers)
    ).json()
    posture = next(item for item in sources if item["external_id"].startswith("posture:"))
    assert "self-reported" in posture["name"]
    # A second check reuses the same self-reported source.
    again = await client.post(
        url, headers=headers, json={"mfa": "on", "forwarding": "unsure", "apps": []}
    )
    assert again.status_code == 201
    assert again.json()["skipped"] == ["forwarding"] and again.json()["source_id"] == posture["id"]
    assert again.json()["ingestion"]["finding_count"] == 0
    audit = (await client.get("/api/v1/audit", headers=headers)).json()
    assert "posture_self_check" in {item["action"] for item in audit}


async def test_posture_self_check_validation_and_isolation(client):
    headers, account, _source = await seed(client)
    url = f"/api/v1/accounts/{account['id']}/posture-check"
    unsure = await client.post(
        url, headers=headers, json={"mfa": "unsure", "forwarding": "unsure", "apps": []}
    )
    assert unsure.status_code == 422
    sources = (
        await client.get(f"/api/v1/accounts/{account['id']}/sources", headers=headers)
    ).json()
    assert not any(item["external_id"].startswith("posture:") for item in sources)
    bad = await client.post(
        url,
        headers=headers,
        json={"mfa": "on", "forwarding": "approved", "forwarding_domain": "not a domain"},
    )
    assert bad.status_code == 422
    other = await client.post(
        url, headers={"X-Tenant-ID": "beta"}, json={"mfa": "off", "forwarding": "none"}
    )
    assert other.status_code == 404
    extra = await client.post(
        url, headers=headers, json={"mfa": "off", "forwarding": "none", "x": 1}
    )
    assert extra.status_code == 422
