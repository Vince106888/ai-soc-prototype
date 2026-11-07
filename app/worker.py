"""One small polling worker. Gmail remains bounded and schedules require opt-in."""

import argparse
import json
import time
from datetime import timedelta

from sqlalchemy import select

from . import alerts, auth, database, deployment, explainer
from .auth import purge_expired
from .demo import DEFAULT_FIXTURE
from .entities import Account, ScanSchedule, Source, utcnow
from .gmail import scan_mailbox
from .platform import create_scan_job, get_scan_job, ingest_signals, mark_scan_job_failed
from .platform_schemas import EvaluationRequest, ScheduleUpdate, SignalBatch
from .retention import expire_trials, production_maintenance
from .scheduling import claim_due, complete_lease, configure_schedule


def run_due(*, maximum_jobs: int = 10, maximum_explanations: int = 3) -> dict:
    counts = {"completed": 0, "failed": 0}
    with database.SessionLocal() as db:
        expire_trials(db)
        purge_expired(db)
        production_maintenance(db)
    for _ in range(maximum_jobs):
        with database.SessionLocal() as db:
            claimed = claim_due(db, utcnow())
            if not claimed:
                break
            tenant, source_id, lease = claimed
            schedule = db.get(ScanSchedule, source_id)
            job_id = None
            try:
                if schedule.last_job_id:
                    previous = get_scan_job(db, tenant, schedule.last_job_id)
                    if previous.status in {"queued", "running"}:
                        mark_scan_job_failed(db, tenant, previous.id, source_id, RuntimeError())
                job = create_scan_job(db, tenant, source_id, "schedule")
                job_id = job.id
                schedule.last_job_id = job_id
                db.commit()
                source = db.get(Source, source_id)
                if source.source_type == "gmail":
                    account = db.get(Account, source.account_id)
                    if auth.required() and not auth.workspace_allowed(db, tenant, account.email):
                        schedule.enabled = False
                        db.commit()
                        raise ValueError("Pilot invitation withdrawn")
                    scan_mailbox(
                        db,
                        tenant,
                        source_id,
                        schedule.maximum_messages,
                        schedule.recent_days,
                        job_id=job_id,
                    )
                elif source.source_type == "controlled":
                    fixture = EvaluationRequest.model_validate_json(
                        DEFAULT_FIXTURE.read_text("utf-8")
                    )
                    ingest_signals(
                        db,
                        tenant,
                        source_id,
                        SignalBatch(
                            scan_job_id=job_id,
                            signals=[case.signal for case in fixture.cases][
                                : schedule.maximum_messages
                            ],
                        ),
                    )
                else:
                    raise ValueError("Unsupported scheduled source")
                complete_lease(db, source_id, lease, succeeded=True)
                counts["completed"] += 1
            except Exception as exc:
                db.rollback()
                mark_scan_job_failed(db, tenant, job_id, source_id, exc)
                complete_lease(db, source_id, lease, succeeded=False)
                counts["failed"] += 1
    # External alerts go out after evidence has committed; failures never block collection.
    with database.SessionLocal() as db:
        delivered = alerts.deliver_pending(db)
    if delivered["sent"] or delivered["failed"]:
        counts["alerts_sent"] = delivered["sent"]
        counts["alerts_failed"] = delivered["failed"]
    if explainer.settings().enabled and maximum_explanations > 0:
        # Explanations run after collection has committed, so a slow or absent model
        # never delays or blocks evidence; the template stays visible until replaced.
        with database.SessionLocal() as db:
            explained = explainer.explain_pending(db, limit=maximum_explanations)
        counts["explained"] = explained["explained"]
        counts["explain_failed"] = explained["failed"]
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--collection-only", action="store_true")
    parser.add_argument("--poll-seconds", type=int, choices=range(5, 301), default=30)
    parser.add_argument(
        "--enable-demo",
        action="store_true",
        help="Explicitly opt in the built-in controlled demo source; never enables Gmail.",
    )
    parser.add_argument("--tenant", default="demo")
    args = parser.parse_args()
    deployment.validate()
    if deployment.production() and args.enable_demo:
        parser.error("Synthetic demo schedules are disabled in production.")
    database.migrate_schema()
    if args.enable_demo:
        with database.SessionLocal() as db:
            source = db.scalar(
                select(Source).where(
                    Source.tenant_id == args.tenant,
                    Source.external_id == "controlled-evaluation",
                    Source.source_type == "controlled",
                )
            )
            if source is None:
                parser.error("Run app.demo for this tenant first.")
            schedule = configure_schedule(
                db,
                args.tenant,
                source.id,
                ScheduleUpdate(enabled=True, acknowledged=True),
                controlled_demo=True,
                actor="demo-operator",
            )
            schedule.next_run_at = utcnow() - timedelta(seconds=1)
            db.commit()
    while True:
        # Aggregate counts only: never log source IDs, mailbox content or tokens.
        print(
            json.dumps(run_due(maximum_explanations=0) if args.collection_only else run_due()),
            flush=True,
        )
        if args.once:
            return
        time.sleep(args.poll_seconds)


if __name__ == "__main__":
    main()
