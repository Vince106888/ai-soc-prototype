"""End-to-end acceptance tests for the persistent platform API."""

from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api import router
from app.database import configure_database, create_schema
from app.demo import DEFAULT_FIXTURE
from app.demo import main as demo_main
from app.entities import DetectionRule
from app.platform_schemas import SignalInput
from app.rules import (
    DEFAULT_RULES,
    _edit_distance,
    combine_weights,
    evaluate_rules,
    normalise_signal,
    severity_for,
)

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def platform_client(tmp_path: Path, monkeypatch) -> AsyncGenerator[AsyncClient]:
    monkeypatch.delenv("AI_SOC_API_KEY", raising=False)
    configure_database(f"sqlite:///{(tmp_path / 'platform.db').as_posix()}")
    create_schema()
    test_app = FastAPI()
    test_app.include_router(router)
    async with AsyncClient(
        transport=ASGITransport(app=test_app), base_url="http://testserver"
    ) as client:
        yield client


async def _account_and_source(client: AsyncClient, tenant: str = "acme") -> tuple[str, str]:
    headers = {"X-Tenant-ID": tenant}
    account_response = await client.post(
        "/api/v1/accounts",
        headers=headers,
        json={"email": f"security@{tenant}.example", "display_name": tenant},
    )
    assert account_response.status_code == 201
    account_id = account_response.json()["id"]
    source_response = await client.post(
        f"/api/v1/accounts/{account_id}/sources",
        headers=headers,
        json={
            "source_type": "controlled",
            "name": "Evaluation fixtures",
            "external_id": f"fixture-{tenant}",
            "capabilities": ["email", "forwarding", "signin", "mfa", "oauth_grant"],
        },
    )
    assert source_response.status_code == 201
    return account_id, source_response.json()["id"]


async def test_end_to_end_ingestion_is_idempotent_and_privacy_minimised(
    platform_client: AsyncClient,
):
    account_id, source_id = await _account_and_source(platform_client)
    headers = {"X-Tenant-ID": "acme"}
    job = await platform_client.post(
        "/api/v1/scan-jobs", headers=headers, json={"source_id": source_id, "trigger": "user"}
    )
    assert job.status_code == 202
    payload = {
        "scan_job_id": job.json()["id"],
        "signals": [
            {
                "external_id": "message-001",
                "signal_type": "email",
                "correlation_key": "campaign:account-review",
                "features": {
                    "sender": "Microsoft Security <notice@micros0ft.com>",
                    "display_name": "Microsoft Security",
                    "reply_to": "collect@unknown.test",
                    "subject": "Urgent account review",
                    "body": "Verify your account at https://secure-account.test/login now.",
                    "urls": ["https://bit.ly/review"],
                    "claimed_domains": ["microsoft.com"],
                    "authentication": {"spf": "fail", "dkim": "fail"},
                },
            }
        ],
    }
    first = await platform_client.post(
        f"/api/v1/sources/{source_id}/signals", headers=headers, json=payload
    )
    completed_job_reuse = await platform_client.post(
        f"/api/v1/sources/{source_id}/signals", headers=headers, json=payload
    )
    duplicate_payload = {"signals": payload["signals"]}
    second = await platform_client.post(
        f"/api/v1/sources/{source_id}/signals", headers=headers, json=duplicate_payload
    )

    assert first.status_code == 201
    assert first.json()["imported_count"] == 1
    assert first.json()["finding_count"] >= 6
    assert completed_job_reuse.status_code == 409
    completed_job = await platform_client.get(
        f"/api/v1/scan-jobs/{job.json()['id']}", headers=headers
    )
    assert completed_job.json()["status"] == "completed"
    assert second.json()["duplicate_count"] == 1
    incidents = await platform_client.get("/api/v1/incidents", headers=headers)
    assert len(incidents.json()) == 1
    assert incidents.json()[0]["account_id"] == account_id
    assert incidents.json()[0]["severity"] == "critical"
    detail = await platform_client.get(
        f"/api/v1/incidents/{incidents.json()[0]['id']}", headers=headers
    )
    stored_features = detail.json()["signals"][0]["features"]
    assert "body" not in stored_features
    assert "attachments" not in stored_features
    assert stored_features["url_hosts"] == ["bit.ly", "secure-account.test"]
    assert detail.json()["explanation"]["source"] == "template"
    assert detail.json()["recommendations"]


async def test_lifecycle_audit_and_tenant_boundary(platform_client: AsyncClient):
    _account_id, source_id = await _account_and_source(platform_client, "tenant-a")
    headers = {"X-Tenant-ID": "tenant-a"}
    response = await platform_client.post(
        f"/api/v1/sources/{source_id}/signals",
        headers=headers,
        json={
            "signals": [
                {
                    "external_id": "mfa-1",
                    "signal_type": "mfa",
                    "features": {"enabled": False, "method_count": 0},
                }
            ]
        },
    )
    incident_id = response.json()["items"][0]["incident_ids"][0]

    hidden = await platform_client.get(
        f"/api/v1/incidents/{incident_id}", headers={"X-Tenant-ID": "tenant-b"}
    )
    assert hidden.status_code == 404
    for next_status in ("under_review", "resolved", "under_review", "false_positive"):
        changed = await platform_client.patch(
            f"/api/v1/incidents/{incident_id}/status",
            headers=headers,
            json={"status": next_status, "actor": "reviewer", "note": "verified"},
        )
        assert changed.status_code == 200
        assert changed.json()["status"] == next_status
    invalid = await platform_client.patch(
        f"/api/v1/incidents/{incident_id}/status",
        headers=headers,
        json={"status": "resolved"},
    )
    assert invalid.status_code == 409
    audit = await platform_client.get(
        "/api/v1/audit", headers=headers, params={"incident_id": incident_id}
    )
    assert len(audit.json()) == 5  # creation plus four accepted transitions


async def test_api_key_guard_is_enabled_only_when_configured(
    platform_client: AsyncClient, monkeypatch
):
    monkeypatch.setenv("AI_SOC_API_KEY", "correct-secret")
    denied = await platform_client.get("/api/v1/capabilities")
    wrong = await platform_client.get("/api/v1/capabilities", headers={"X-API-Key": "wrong"})
    accepted = await platform_client.get(
        "/api/v1/capabilities", headers={"X-API-Key": "correct-secret"}
    )
    assert denied.status_code == wrong.status_code == 401
    assert accepted.status_code == 200


async def test_evaluation_reports_standard_metrics(platform_client: AsyncClient):
    result = await platform_client.post(
        "/api/v1/evaluation",
        json={
            "threshold": 0.3,
            "cases": [
                {
                    "case_id": "malicious",
                    "expected_suspicious": True,
                    "signal": {
                        "external_id": "eval-1",
                        "signal_type": "oauth_grant",
                        "features": {
                            "app_name": "Unknown Exporter",
                            "verified": False,
                            "scopes": ["https://mail.google.com/"],
                        },
                    },
                },
                {
                    "case_id": "benign",
                    "expected_suspicious": False,
                    "signal": {
                        "external_id": "eval-2",
                        "signal_type": "mfa",
                        "features": {"enabled": True, "method_count": 2},
                    },
                },
            ],
        },
    )
    assert result.status_code == 200
    assert result.json()["confusion_matrix"] == {
        "true_positive": 1,
        "false_positive": 0,
        "true_negative": 1,
        "false_negative": 0,
    }
    assert result.json()["accuracy"] == result.json()["f1_score"] == 1.0


async def test_account_source_scan_listing_and_error_paths(platform_client: AsyncClient):
    account_id, source_id = await _account_and_source(platform_client, "operations")
    headers = {"X-Tenant-ID": "operations"}

    assert (await platform_client.get("/api/v1/accounts", headers=headers)).json()[0][
        "id"
    ] == account_id
    assert (
        await platform_client.get(f"/api/v1/accounts/{account_id}", headers=headers)
    ).status_code == 200
    assert (
        await platform_client.get(f"/api/v1/accounts/{account_id}/sources", headers=headers)
    ).json()[0]["id"] == source_id
    assert (await platform_client.get("/api/v1/sources", headers=headers)).json()[0][
        "id"
    ] == source_id
    assert len((await platform_client.get("/api/v1/rules", headers=headers)).json()) == 11
    assert (await platform_client.get("/api/v1/capabilities", headers=headers)).json()[
        "controlled_ingestion"
    ]

    job = await platform_client.post(
        "/api/v1/scan-jobs",
        headers=headers,
        json={"source_id": source_id, "trigger": "schedule"},
    )
    job_id = job.json()["id"]
    assert (
        await platform_client.get(f"/api/v1/scan-jobs/{job_id}", headers=headers)
    ).status_code == 200
    assert (await platform_client.get("/api/v1/scan-jobs", headers=headers)).json()[0][
        "trigger"
    ] == "schedule"

    compact_payload = {"account_id": account_id, "scope": "full", "target": "mailbox"}
    assert (
        await platform_client.post("/api/v1/scans", headers=headers, json=compact_payload)
    ).status_code == 202
    compact_again = await platform_client.post(
        "/api/v1/scans", headers=headers, json=compact_payload
    )
    assert compact_again.status_code == 202
    assert (
        await platform_client.get(f"/api/v1/scans/{compact_again.json()['id']}", headers=headers)
    ).status_code == 200

    disconnected = await platform_client.patch(
        f"/api/v1/sources/{source_id}", headers=headers, json={"status": "disconnected"}
    )
    assert disconnected.json()["status"] == "disconnected"
    denied_scan = await platform_client.post(
        "/api/v1/scan-jobs", headers=headers, json={"source_id": source_id}
    )
    assert denied_scan.status_code == 409
    await platform_client.patch(
        f"/api/v1/sources/{source_id}", headers=headers, json={"status": "active"}
    )

    duplicate_account = await platform_client.post(
        "/api/v1/accounts",
        headers=headers,
        json={"email": "security@operations.example"},
    )
    assert duplicate_account.status_code == 409
    assert (
        await platform_client.get("/api/v1/accounts/missing", headers=headers)
    ).status_code == 404
    assert (
        await platform_client.get("/api/v1/scan-jobs/missing", headers=headers)
    ).status_code == 404
    assert (
        await platform_client.patch(
            "/api/v1/sources/missing", headers=headers, json={"status": "active"}
        )
    ).status_code == 404


async def test_correlation_filters_and_cross_source_job_rejection(platform_client: AsyncClient):
    account_id, source_id = await _account_and_source(platform_client, "filters")
    headers = {"X-Tenant-ID": "filters"}
    second_source = await platform_client.post(
        f"/api/v1/accounts/{account_id}/sources",
        headers=headers,
        json={"name": "second", "external_id": "second-source", "capabilities": ["mfa"]},
    )
    job = await platform_client.post(
        "/api/v1/scan-jobs", headers=headers, json={"source_id": source_id}
    )
    rejected = await platform_client.post(
        f"/api/v1/sources/{second_source.json()['id']}/signals",
        headers=headers,
        json={
            "scan_job_id": job.json()["id"],
            "signals": [
                {
                    "external_id": "wrong-source",
                    "signal_type": "mfa",
                    "features": {"enabled": False},
                }
            ],
        },
    )
    assert rejected.status_code == 409
    # A job cannot be mutated through a different source's failed request.
    assert (
        await platform_client.get(f"/api/v1/scan-jobs/{job.json()['id']}", headers=headers)
    ).json()["status"] == "queued"
    created = await platform_client.post(
        f"/api/v1/sources/{source_id}/signals",
        headers=headers,
        json={
            "signals": [
                {
                    "external_id": "signin-filter",
                    "signal_type": "sign_in",
                    "features": {"new_device": True, "source_ip": "192.0.2.10"},
                }
            ]
        },
    )
    assert created.status_code == 201
    assert (
        len(
            (
                await platform_client.get(
                    "/api/v1/incidents",
                    headers=headers,
                    params={"severity": "high", "status": "new", "search": "sign-in"},
                )
            ).json()
        )
        == 1
    )
    assert (
        await platform_client.get(
            "/api/v1/incidents", headers=headers, params={"account_id": "missing"}
        )
    ).json() == []


async def test_signal_feature_types_and_source_capabilities_are_enforced(
    platform_client: AsyncClient,
):
    account_id, _source_id = await _account_and_source(platform_client, "validation")
    headers = {"X-Tenant-ID": "validation"}
    restricted = await platform_client.post(
        f"/api/v1/accounts/{account_id}/sources",
        headers=headers,
        json={
            "name": "mail only",
            "external_id": "mail-only",
            "capabilities": ["email"],
        },
    )
    source_id = restricted.json()["id"]
    invalid_boolean = await platform_client.post(
        f"/api/v1/sources/{source_id}/signals",
        headers=headers,
        json={
            "signals": [
                {
                    "external_id": "bad-bool",
                    "signal_type": "mfa",
                    "features": {"enabled": "false"},
                }
            ]
        },
    )
    assert invalid_boolean.status_code == 422
    unsupported = await platform_client.post(
        f"/api/v1/sources/{source_id}/signals",
        headers=headers,
        json={
            "signals": [
                {
                    "external_id": "valid-mfa",
                    "signal_type": "mfa",
                    "features": {"enabled": False, "method_count": 0},
                }
            ]
        },
    )
    assert unsupported.status_code == 409
    missing_capabilities = await platform_client.post(
        f"/api/v1/accounts/{account_id}/sources",
        headers=headers,
        json={"name": "unspecified", "external_id": "unspecified"},
    )
    assert missing_capabilities.status_code == 422


async def test_valid_scan_job_records_ingestion_failure(platform_client: AsyncClient):
    _account_id, source_id = await _account_and_source(platform_client, "failed-job")
    headers = {"X-Tenant-ID": "failed-job"}
    source = await platform_client.patch(
        f"/api/v1/sources/{source_id}",
        headers=headers,
        json={"status": "disconnected"},
    )
    assert source.status_code == 200
    # Create the job before disconnecting would be the normal race/failure path.
    await platform_client.patch(
        f"/api/v1/sources/{source_id}", headers=headers, json={"status": "active"}
    )
    job = await platform_client.post(
        "/api/v1/scan-jobs", headers=headers, json={"source_id": source_id}
    )
    await platform_client.patch(
        f"/api/v1/sources/{source_id}",
        headers=headers,
        json={"status": "disconnected"},
    )
    failed = await platform_client.post(
        f"/api/v1/sources/{source_id}/signals",
        headers=headers,
        json={
            "scan_job_id": job.json()["id"],
            "signals": [
                {
                    "external_id": "not-imported",
                    "signal_type": "email",
                    "features": {"sender": "sender@example.com"},
                }
            ],
        },
    )
    assert failed.status_code == 409
    job_state = await platform_client.get(f"/api/v1/scan-jobs/{job.json()['id']}", headers=headers)
    assert job_state.json()["status"] == "failed"
    assert job_state.json()["attempts"] == 1
    assert job_state.json()["error"] == "ConflictError: signal ingestion failed"
    retry_while_disconnected = await platform_client.post(
        f"/api/v1/scan-jobs/{job.json()['id']}/retry", headers=headers
    )
    assert retry_while_disconnected.status_code == 409

    await platform_client.patch(
        f"/api/v1/sources/{source_id}", headers=headers, json={"status": "active"}
    )
    retried = await platform_client.post(
        f"/api/v1/scan-jobs/{job.json()['id']}/retry",
        headers=headers,
    )
    assert retried.status_code == 202
    assert retried.json()["status"] == "queued"


def test_demo_cli_runs_clean_install_flow(tmp_path: Path, monkeypatch, capsys):
    database_url = f"sqlite:///{(tmp_path / 'demo.db').as_posix()}"
    monkeypatch.setattr(
        "sys.argv",
        ["app.demo", "--database-url", database_url, "--fixture", str(DEFAULT_FIXTURE)],
    )
    demo_main()
    output = capsys.readouterr().out
    assert '"imported_count": 5' in output
    assert '"accuracy": 1.0' in output


def test_scoring_boundaries_and_legitimate_login_host_safeguard():
    assert combine_weights([0.8, 0.3]) == 0.86
    assert severity_for(0.29) == "low"
    assert severity_for(0.30) == "medium"
    assert severity_for(0.60) == "high"
    assert severity_for(0.80) == "critical"
    _signal_type, features = normalise_signal(
        "email",
        {
            "sender": "Microsoft <notice@microsoft.com>",
            "display_name": "Microsoft",
            "body": "Use https://login.microsoftonline.com/common/oauth2/authorize",
        },
    )
    assert features["brand_mismatch"] is False
    assert features["url_hosts"] == ["login.microsoftonline.com"]
    rule_models = [DetectionRule(**item) for item in DEFAULT_RULES]
    assert "URL-002" not in {match.code for match in evaluate_rules("email", features, rule_models)}


def test_migration_bootstraps_and_records_schema_version(tmp_path: Path, monkeypatch):
    from sqlalchemy import inspect

    from app import database

    configured_path = tmp_path / "migrated.db"
    monkeypatch.setenv(
        "AI_SOC_DATABASE_URL", f"sqlite:///{(tmp_path / 'environment.db').as_posix()}"
    )
    database.configure_database(f"sqlite:///{configured_path.as_posix()}")
    database.migrate_schema()
    tables = set(inspect(database.engine).get_table_names())

    assert configured_path.exists()
    assert "alembic_version" in tables
    assert {"signals", "findings", "incidents", "audit_log"} <= tables


def test_adversarial_signal_features_are_bounded_before_detection():
    with pytest.raises(ValueError):
        SignalInput(
            external_id="oversized",
            signal_type="email",
            features={"sender": "sender@example.com", "body": "x" * 100_001},
        )
    with pytest.raises(ValueError):
        SignalInput(
            external_id="unknown-nesting",
            signal_type="email",
            features={"sender": "sender@example.com", "payload": {"deep": "x" * 500_000}},
        )
    with pytest.raises(ValueError):
        SignalInput(
            external_id="oversized-domain",
            signal_type="email",
            features={
                "sender": "sender@example.com",
                "claimed_domains": ["a" * 254],
            },
        )
    with pytest.raises(ValueError):
        SignalInput(
            external_id="overflow-date",
            signal_type="signin",
            occurred_at="9999-12-31T23:59:59Z",
            features={},
        )
    assert _edit_distance("a" * 10_000, "short") == 3
    assert _edit_distance("kitten", "sitting") == 3
    assert _edit_distance("google.com", "go0gle.com") == 1
