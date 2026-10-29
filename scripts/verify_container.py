"""Read-only check of an already seeded controlled Compose acceptance workspace."""

import json
import os

import httpx


def main():
    with httpx.Client(
        base_url="http://127.0.0.1:8000",
        timeout=30,
        headers={"X-API-Key": os.environ["AI_SOC_API_KEY"], "X-Tenant-ID": "container-acceptance"},
    ) as client:
        assert client.get("/health/ready").status_code == 200
        page = client.get("/")
        assert page.status_code == 200 and 'id="root"' in page.text
        response = client.get("/api/v1/scan-jobs")
        response.raise_for_status()
        completed = [job for job in response.json() if job["status"] == "completed"]
        assert {job["trigger"] for job in completed} >= {"user", "schedule"}
        assert any(job["imported_count"] > 0 for job in completed)
        assert any(job["trigger"] == "schedule" and job["duplicate_count"] > 0 for job in completed)
        page = client.get("/api/v1/incidents/page")
        page.raise_for_status()
        assert page.json()["total"] > 0
    print(
        json.dumps(
            {
                "ready": True,
                "dashboard_served": True,
                "user_and_scheduled_scans": True,
                "duplicate_check": True,
                "controlled_incidents": True,
            }
        )
    )


if __name__ == "__main__":
    main()
