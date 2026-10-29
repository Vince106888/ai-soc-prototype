"""Exercise a running deployment over HTTP using a fresh, synthetic-only tenant.

Leaves labelled acceptance evidence in its own workspace. Never scans Gmail.
"""

import argparse
import json
import os
import re
from uuid import uuid4

import httpx


def check(base_url: str) -> dict:
    tenant = f"smoke-{uuid4().hex}"
    headers = {"X-Tenant-ID": tenant, "X-API-Key": os.getenv("AI_SOC_API_KEY", "")}
    with httpx.Client(base_url=base_url, headers=headers, timeout=30) as client:

        def request(method, path, expected=200, **kwargs):
            response = client.request(method, path, **kwargs)
            if response.status_code != expected:
                # Do not dump responses: a deployment could contain private material.
                raise RuntimeError(
                    f"{method} {path}: expected {expected}, got {response.status_code}"
                )
            return response

        request("GET", "/health/ready")
        page = request("GET", "/")
        if 'id="root"' not in page.text:
            raise RuntimeError("Dashboard is not built")
        assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', page.text)
        if not assets:
            raise RuntimeError("Dashboard asset references missing")
        for asset in assets:
            request("GET", asset)
        if headers["X-API-Key"]:
            request(
                "GET",
                "/api/v1/accounts",
                expected=401,
                headers={"X-API-Key": "deliberately-invalid-smoke-key"},
            )
        account = request(
            "POST",
            "/api/v1/accounts",
            201,
            json={
                "email": "acceptance@example.test",
                "display_name": "Synthetic deployment check",
            },
        ).json()
        source = request(
            "POST",
            f"/api/v1/accounts/{account['id']}/sources",
            201,
            json={
                "name": "Synthetic deployment check",
                "external_id": "smoke",
                "capabilities": ["email"],
            },
        ).json()
        job = request("POST", "/api/v1/scan-jobs", 202, json={"source_id": source["id"]}).json()
        signals = [
            {
                "external_id": "smoke-email",
                "signal_type": "email",
                "features": {
                    "sender": "security@example.test",
                    "reply_to": "other@different.test",
                    "body": "SMOKE-BODY-NOT-RETAINED Verify your account immediately.",
                },
            }
        ]
        path = f"/api/v1/sources/{source['id']}/signals"
        ingested = request(
            "POST", path, 201, json={"scan_job_id": job["id"], "signals": signals}
        ).json()
        assert ingested["imported_count"] == 1
        duplicate = request("POST", path, 201, json={"signals": signals}).json()
        assert duplicate["duplicate_count"] == 1
        assert request("GET", f"/api/v1/scan-jobs/{job['id']}").json()["status"] == "completed"
        incident_id = ingested["items"][0]["incident_ids"][0]
        incident_path = f"/api/v1/incidents/{incident_id}"
        detail = request("GET", incident_path)
        assert "SMOKE-BODY-NOT-RETAINED" not in detail.text
        assert all("body" not in item["features"] for item in detail.json()["signals"])
        assert detail.json()["findings"] and detail.json()["recommendations"]
        assert detail.json()["explanation"]["source"] == "template"
        request("GET", incident_path, 404, headers={"X-Tenant-ID": tenant + "-other"})
        for status in ("under_review", "resolved", "under_review", "false_positive"):
            changed = request(
                "PATCH",
                incident_path + "/status",
                json={
                    "status": status,
                    "note": "Synthetic acceptance check",
                    "actor": "smoke",
                },
            ).json()
            assert changed["status"] == status
        request("PATCH", incident_path + "/status", 409, json={"status": "resolved"})
        assert request("GET", "/api/v1/audit", params={"incident_id": incident_id}).json()
    return {
        "result": "passed",
        "tenant": tenant,
        "checks": [
            "readiness",
            "dashboard_and_assets",
            "ingestion",
            "completed_job",
            "idempotency",
            "evidence_and_guidance",
            "privacy",
            "tenant_isolation",
            "lifecycle",
            "audit",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    print(json.dumps(check(args.base_url), indent=2))


if __name__ == "__main__":
    main()
