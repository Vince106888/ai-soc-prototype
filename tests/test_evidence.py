"""Evidence browser acceptance: no-match review, paging, privacy and tenant isolation."""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app import database
from app.api import router

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client(tmp_path, monkeypatch):
    monkeypatch.delenv("AI_SOC_API_KEY", raising=False)
    database.configure_database(f"sqlite:///{(tmp_path / 'evidence.db').as_posix()}")
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
            json={"name": "Evidence test", "external_id": tenant, "capabilities": ["email", "mfa"]},
        )
    ).json()
    signals = [
        {
            "external_id": "routine",
            "signal_type": "email",
            "features": {
                "sender": "team@example.test",
                "subject": "Budget 100%_review",
                "body": "private full message content",
                "urls": ["https://example.test/path?secret=x"],
            },
        },
        {
            "external_id": "indicator",
            "signal_type": "email",
            "features": {
                "sender": "notice@example.test",
                "body": "verify your account",
                "subject": "Account review",
            },
        },
        {"external_id": "posture", "signal_type": "mfa", "features": {"enabled": False}},
    ]
    result = (
        await client.post(
            f"/api/v1/sources/{source['id']}/signals", headers=headers, json={"signals": signals}
        )
    ).json()
    return account, source, result


async def test_evidence_search_pages_detail_and_no_match_remain_private(client):
    account, source, result = await seed(client)
    headers = {"X-Tenant-ID": "alpha"}
    page = (await client.get("/api/v1/signals", headers=headers, params={"limit": 1})).json()
    assert page["total"] == 3 and len(page["items"]) == 1
    next_page = (
        await client.get("/api/v1/signals", headers=headers, params={"limit": 1, "offset": 1})
    ).json()
    assert page["items"][0]["id"] != next_page["items"][0]["id"]
    for params, count in (
        ({"has_findings": "false"}, 1),
        ({"has_findings": "true"}, 2),
        ({"signal_type": "email"}, 2),
        ({"search": "100%_"}, 1),
        ({"search": "missing%_"}, 0),
        ({"account_id": account["id"], "source_id": source["id"]}, 3),
        ({"account_id": "other"}, 0),
    ):
        assert (await client.get("/api/v1/signals", headers=headers, params=params)).json()[
            "total"
        ] == count
    detail = (
        await client.get(f"/api/v1/signals/{result['items'][0]['signal_id']}", headers=headers)
    ).json()
    assert detail["findings"] == detail["incidents"] == []
    assert "body" not in detail["features"] and detail["features"]["url_hosts"] == ["example.test"]
    assert "private full message" not in str(detail) and "secret=x" not in str(detail)
    found = (
        await client.get(f"/api/v1/signals/{result['items'][1]['signal_id']}", headers=headers)
    ).json()
    assert found["findings"][0]["rule_code"] == "EMAIL-002"
    assert found["incidents"][0]["id"] == result["items"][1]["incident_ids"][0]
    assert (
        await client.get("/api/v1/signals", headers=headers, params={"limit": 101})
    ).status_code == 422
    assert (
        await client.get("/api/v1/signals", headers=headers, params={"offset": -1})
    ).status_code == 422


async def test_tenant_isolation_auth_and_deletion_remove_evidence(client, monkeypatch):
    account, source, result = await seed(client)
    await seed(client, "beta")
    beta = {"X-Tenant-ID": "beta"}
    assert (
        await client.get(f"/api/v1/signals/{result['items'][0]['signal_id']}", headers=beta)
    ).status_code == 404
    assert (
        await client.get("/api/v1/signals", headers=beta, params={"source_id": source["id"]})
    ).json()["total"] == 0
    monkeypatch.setenv("AI_SOC_API_KEY", "private-test-key")
    assert (await client.get("/api/v1/signals", headers=beta)).status_code == 401
    monkeypatch.delenv("AI_SOC_API_KEY")
    alpha = {"X-Tenant-ID": "alpha"}
    assert (
        await client.delete(f"/api/v1/accounts/{account['id']}", headers=alpha)
    ).status_code == 204
    assert (await client.get("/api/v1/signals", headers=alpha)).json()["total"] == 0
    assert (await client.get("/api/v1/signals", headers=beta)).json()["total"] == 3


async def test_incident_page_counts_filters_and_prioritises_only_open_records(client):
    account, _source, result = await seed(client)
    headers = {"X-Tenant-ID": "alpha"}
    page = (await client.get("/api/v1/incidents/page", headers=headers, params={"limit": 1})).json()
    assert page["total"] == 2 and len(page["items"]) == 1
    incident_id = result["items"][2]["incident_ids"][0]
    for status in ("under_review", "resolved"):
        assert (
            await client.patch(
                f"/api/v1/incidents/{incident_id}/status", headers=headers, json={"status": status}
            )
        ).status_code == 200
    active = (
        await client.get("/api/v1/incidents/page", headers=headers, params={"open_only": "true"})
    ).json()
    assert active["total"] == 1 and active["items"][0]["id"] != incident_id
    assert (
        await client.get(
            "/api/v1/incidents/page", headers=headers, params={"account_id": account["id"]}
        )
    ).json()["total"] == 2
    assert (await client.get("/api/v1/incidents/page", headers={"X-Tenant-ID": "unknown"})).json()[
        "total"
    ] == 0
    assert (
        await client.get("/api/v1/incidents/page", headers=headers, params={"search": "%"})
    ).json()["total"] == 0


async def test_payment_evidence_is_traceable_private_and_tenant_scoped(client):
    _, source, _ = await seed(client)
    headers = {"X-Tenant-ID": "alpha"}
    payload = {
        "signals": [
            {
                "external_id": "payment",
                "signal_type": "email",
                "correlation_key": "payment-only",
                "features": {
                    "sender": "supplier@example.test",
                    "subject": "Invoice update",
                    "body": "Use the new bank details: account 123456789 and send payment.",
                    "authentication": {"spf": "pass", "dkim": "pass"},
                },
            }
        ]
    }
    response = await client.post(
        f"/api/v1/sources/{source['id']}/signals", headers=headers, json=payload
    )
    assert response.status_code == 201
    item = response.json()["items"][0]
    # A never-seen sender asking for a payment change also matches EMAIL-007.
    assert item["finding_count"] == 2
    detail = (await client.get(f"/api/v1/signals/{item['signal_id']}", headers=headers)).json()
    weights = {finding["rule_code"]: finding["weight"] for finding in detail["findings"]}
    assert weights == {"EMAIL-006": 0.5, "EMAIL-007": 0.35}
    assert detail["features"]["first_contact"] is True
    assert detail["features"]["authentication_results"] == {"spf": "pass", "dkim": "pass"}
    assert "123456789" not in str(detail) and "body" not in detail["features"]
    incident_id = item["incident_ids"][0]
    case = (await client.get(f"/api/v1/incidents/{incident_id}", headers=headers)).json()
    assert case["score"] == 0.675
    assert "previously trusted" in case["explanation"]["next_step"]
    assert case["explanation"]["source"] == "template"
    assert (
        await client.get(f"/api/v1/signals/{item['signal_id']}", headers={"X-Tenant-ID": "beta"})
    ).status_code == 404
    repeat = await client.post(
        f"/api/v1/sources/{source['id']}/signals", headers=headers, json=payload
    )
    assert repeat.json()["duplicate_count"] == 1
