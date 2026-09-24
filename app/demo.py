"""Seed a reproducible end-to-end controlled demo and print its results.

Run with ``python -m app.demo`` after installing the project dependencies.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from sqlalchemy import select

from .database import SessionLocal, configure_database, create_schema
from .entities import Account, Source
from .platform import create_account, create_scan_job, create_source, ingest_signals, run_evaluation
from .platform_schemas import (
    AccountCreate,
    EvaluationRequest,
    SignalBatch,
    SourceCreate,
)

DEFAULT_FIXTURE = Path(__file__).parents[1] / "fixtures" / "evaluation" / "scenarios.json"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed and evaluate the controlled SentinelSME demo"
    )
    parser.add_argument("--database-url", help="SQLAlchemy URL; defaults to AI_SOC_DATABASE_URL")
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument("--tenant", default="demo")
    args = parser.parse_args()
    if args.database_url:
        configure_database(args.database_url)
    create_schema()
    fixture = EvaluationRequest.model_validate_json(args.fixture.read_text(encoding="utf-8"))

    with SessionLocal() as session:
        account = session.scalar(
            select(Account).where(
                Account.tenant_id == args.tenant,
                Account.email == "security@sentinelsme.example",
            )
        )
        if account is None:
            account = create_account(
                session,
                args.tenant,
                AccountCreate(
                    email="security@sentinelsme.example",
                    display_name="SentinelSME Demo",
                ),
            )
        source = session.scalar(
            select(Source).where(
                Source.tenant_id == args.tenant,
                Source.external_id == "controlled-evaluation",
            )
        )
        if source is None:
            source = create_source(
                session,
                args.tenant,
                account.id,
                SourceCreate(
                    name="Controlled evaluation scenarios",
                    external_id="controlled-evaluation",
                    capabilities=["email", "forwarding", "signin", "mfa", "oauth_grant"],
                ),
            )
        job = create_scan_job(session, args.tenant, source.id, "user")
        ingestion = ingest_signals(
            session,
            args.tenant,
            source.id,
            SignalBatch(scan_job_id=job.id, signals=[item.signal for item in fixture.cases]),
        )
        evaluation = run_evaluation(session, fixture)
        print(
            json.dumps(
                {
                    "account_id": account.id,
                    "source_id": source.id,
                    "scan_job_id": job.id,
                    "ingestion": ingestion.model_dump(mode="json"),
                    "evaluation": evaluation.model_dump(mode="json"),
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
