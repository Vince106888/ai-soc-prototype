"""500 synthetic emails through real HTTP; finish timing after observing the UI."""

import argparse
import hashlib
import json
import platform
import time
from pathlib import Path

import httpx


def prepared_emails():
    return [
        {
            "external_id": f"prepared-email-{i:03}",
            "signal_type": "email",
            "occurred_at": "2026-10-05T12:00:00Z",
            "correlation_key": f"group-{i // 10}",
            "features": {
                "sender": "billing@example.test",
                "subject": "Synthetic invoice",
                "reply_to": "unknown@other.test" if i % 2 == 0 else "billing@example.test",
                "body": "New bank details: send payment by wire transfer."
                if i % 2 == 0
                else "Meeting agenda attached in the controlled scenario.",
            },
        }
        for i in range(500)
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--tenant", default="acceptance")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--confirm-visible",
        action="store_true",
        help="Use only after personally verifying the 500-email result in the dashboard.",
    )
    args = parser.parse_args()
    if args.confirm_visible:
        report = json.loads(args.output.read_text("utf-8"))
        report["dashboard_visible_at_epoch"] = time.time()
        report["http_start_to_dashboard_visible_seconds"] = round(
            time.time() - report["http_started_at_epoch"], 3
        )
        report["within_five_minutes"] = report["http_start_to_dashboard_visible_seconds"] < 300
        report["observation"] = (
            "Operator visually checked workspace overview, incident queue and retained email "
            "evidence count; manual timing includes navigation/tool latency."
        )
    else:
        emails = prepared_emails()
        with httpx.Client(
            base_url=args.base_url, headers={"X-Tenant-ID": args.tenant}, timeout=240
        ) as client:

            def post(path, payload):
                response = client.post(path, json=payload)
                response.raise_for_status()
                return response.json()

            account = post(
                "/api/v1/accounts",
                {
                    "email": f"benchmark-{time.time_ns()}@example.test",
                    "display_name": "500-email acceptance run",
                },
            )
            source = post(
                f"/api/v1/accounts/{account['id']}/sources",
                {
                    "name": "Prepared email benchmark",
                    "external_id": f"benchmark-{time.time_ns()}",
                    "capabilities": ["email"],
                },
            )
            job = post("/api/v1/scan-jobs", {"source_id": source["id"], "trigger": "user"})
            epoch, start = time.time(), time.perf_counter()
            result = post(
                f"/api/v1/sources/{source['id']}/signals",
                {"scan_job_id": job["id"], "signals": emails},
            )
            ingestion_seconds = time.perf_counter() - start
            query_start = time.perf_counter()
            response = client.get(
                "/api/v1/signals", params={"limit": 25, "source_id": source["id"]}
            )
            response.raise_for_status()
            evidence = response.json()
            response = client.get(
                "/api/v1/incidents/page", params={"limit": 25, "account_id": account["id"]}
            )
            response.raise_for_status()
            incidents = response.json()
            query_seconds = time.perf_counter() - query_start
            repeat = post(f"/api/v1/sources/{source['id']}/signals", {"signals": emails})
        report = {
            "os": platform.platform(),
            "python": platform.python_version(),
            "workspace": args.tenant,
            "database": "isolated controlled SQLite acceptance database",
            "input_sha256": hashlib.sha256(json.dumps(emails, sort_keys=True).encode()).hexdigest(),
            "input": "500 prepared email-only records; 250 suspicious, 250 benign; no live mail",
            "warmup": "none; migration/account/source/job setup excluded",
            "run_count": 1,
            "http_started_at_epoch": epoch,
            "http_ingestion_seconds": round(ingestion_seconds, 4),
            "http_query_seconds": round(query_seconds, 4),
            "imported": result["imported_count"],
            "findings": result["finding_count"],
            "retained_email_total": evidence["total"],
            "incidents": incidents["total"],
            "duplicates_on_repeat": repeat["duplicate_count"],
            "repeat_new_findings": repeat["finding_count"],
            "failures": 0,
            "dashboard_visible_at_epoch": None,
            "within_five_minutes": None,
        }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
