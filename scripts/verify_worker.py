"""Verify the running polling worker, using only the seeded controlled acceptance tenant.

Run inside the API container after app.demo --tenant container-acceptance.
The controlled schedule is disabled again on success or failure. No Gmail calls.
"""

import json
import os
import time
from datetime import timedelta

import httpx
from sqlalchemy import select

from app.database import SessionLocal
from app.entities import Source, utcnow
from app.platform_schemas import ScheduleUpdate
from app.scheduling import configure_schedule

TENANT = "container-acceptance"


def set_due() -> str:
    with SessionLocal() as db:
        source = db.scalar(
            select(Source).where(
                Source.tenant_id == TENANT,
                Source.external_id == "controlled-evaluation",
                Source.source_type == "controlled",
            )
        )
        if source is None:
            raise RuntimeError("Seed the controlled container-acceptance tenant first.")
        schedule = configure_schedule(
            db,
            TENANT,
            source.id,
            ScheduleUpdate(enabled=True, acknowledged=True),
            controlled_demo=True,
            actor="acceptance-check",
        )
        schedule.next_run_at = utcnow() - timedelta(seconds=1)
        db.commit()
        return source.id


def main():
    headers = {"X-API-Key": os.getenv("AI_SOC_API_KEY", ""), "X-Tenant-ID": TENANT}
    with httpx.Client(base_url="http://127.0.0.1:8000", headers=headers, timeout=15) as client:
        previous = client.get("/api/v1/scan-jobs")
        previous.raise_for_status()
        old_ids = {item["id"] for item in previous.json()}
        source_id = set_due()
        try:
            deadline = time.monotonic() + 100
            while time.monotonic() < deadline:
                response = client.get("/api/v1/scan-jobs")
                response.raise_for_status()
                for job in response.json():
                    if job["id"] not in old_ids and job["source_id"] == source_id:
                        if job["status"] == "failed":
                            raise RuntimeError("The running worker failed the controlled job.")
                        if job["status"] == "completed" and job["trigger"] == "schedule":
                            if job["duplicate_count"] < 1:
                                raise RuntimeError("Scheduled replay did not detect duplicates.")
                            print(
                                json.dumps(
                                    {
                                        "running_worker": "passed",
                                        "controlled_schedule": "completed",
                                        "duplicates_detected": True,
                                    }
                                )
                            )
                            return
                time.sleep(2)
            raise RuntimeError(
                "The running worker did not complete the controlled job within 100s."
            )
        finally:
            with SessionLocal() as db:
                configure_schedule(
                    db,
                    TENANT,
                    source_id,
                    ScheduleUpdate(enabled=False, acknowledged=True),
                    controlled_demo=True,
                    actor="acceptance-check",
                )


if __name__ == "__main__":
    main()
