"""Reproducible, synthetic 500-signal benchmark in an isolated temporary database."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import statistics
import tempfile
import time
from pathlib import Path

from sqlalchemy import func, select

from . import database
from .entities import Incident, utcnow
from .evidence import signal_page
from .platform import create_account, create_source, ingest_signals, list_incidents
from .platform_schemas import AccountCreate, SignalBatch, SignalInput, SourceCreate


def prepared_signals() -> list[SignalInput]:
    signals = []
    for index in range(500):
        kind = ["email", "forwarding", "signin", "mfa", "oauth_grant"][index % 5]
        suspicious = (index // 5) % 2 == 0
        features = {
            "email": {
                "sender": "team@example.test",
                "reply_to": "reply@other.test" if suspicious else "team@example.test",
                "subject": "Verify your account" if suspicious else "Meeting agenda",
                "body": "Synthetic controlled content only.",
            },
            "forwarding": {
                "enabled": True,
                "external": True,
                "authorized": not suspicious,
                "target": "archive@other.test",
            },
            "signin": {"new_device": suspicious, "unusual": suspicious},
            "mfa": {"enabled": not suspicious, "method_count": 0 if suspicious else 2},
            "oauth_grant": {
                "app_id": "synthetic-app",
                "app_name": "Synthetic application",
                "verified": not suspicious,
                "scopes": ["gmail.modify"] if suspicious else ["profile"],
            },
        }[kind]
        signals.append(
            SignalInput(
                external_id=f"benchmark-{index:03}",
                signal_type=kind,
                correlation_key=f"controlled-group-{index // 10}",
                features=features,
            )
        )
    return signals


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=int, default=3, choices=range(1, 6))
    args = parser.parse_args()
    signals = prepared_signals()
    checksum = hashlib.sha256(
        json.dumps([signal.model_dump(mode="json") for signal in signals], sort_keys=True).encode()
    ).hexdigest()
    measurements = []
    original_url = database.engine.url.render_as_string(hide_password=False)
    try:
        with tempfile.TemporaryDirectory(prefix="sentinelsme-benchmark-") as directory:
            for run in range(args.runs):
                database.configure_database(
                    f"sqlite:///{(Path(directory) / f'run-{run}.db').as_posix()}"
                )
                database.migrate_schema()
                with database.SessionLocal() as db:
                    account = create_account(
                        db, "benchmark", AccountCreate(email="owner@example.test")
                    )
                    source = create_source(
                        db,
                        "benchmark",
                        account.id,
                        SourceCreate(
                            name="Synthetic benchmark",
                            external_id="benchmark",
                            capabilities=["email", "forwarding", "signin", "mfa", "oauth_grant"],
                        ),
                    )
                    start = time.perf_counter()
                    result = ingest_signals(
                        db, "benchmark", source.id, SignalBatch(signals=signals)
                    )
                    ingestion_seconds = time.perf_counter() - start
                    start = time.perf_counter()
                    list_incidents(db, "benchmark", limit=25)
                    signal_page(db, "benchmark", limit=25)
                    query_seconds = time.perf_counter() - start
                    start = time.perf_counter()
                    duplicates = ingest_signals(
                        db, "benchmark", source.id, SignalBatch(signals=signals)
                    )
                    duplicate_seconds = time.perf_counter() - start
                    measurements.append(
                        {
                            "run": run + 1,
                            "ingestion_seconds": round(ingestion_seconds, 4),
                            "incident_and_evidence_query_seconds": round(query_seconds, 4),
                            "duplicate_seconds": round(duplicate_seconds, 4),
                            "imported": result.imported_count,
                            "findings": result.finding_count,
                            "incidents": db.scalar(select(func.count()).select_from(Incident)),
                            "duplicate_count": duplicates.duplicate_count,
                        }
                    )
                database.engine.dispose()
    finally:
        database.configure_database(original_url)
    print(
        json.dumps(
            {
                "measured_at": utcnow().isoformat(),
                "os": platform.platform(),
                "python": platform.python_version(),
                "database": "fresh temporary SQLite per run",
                "input_sha256": checksum,
                "signals": 500,
                "mix": "100 each of five types; half suspicious",
                "warmup": "none; migrations and account/source creation excluded",
                "measurements": measurements,
                "median_ingestion_seconds": round(
                    statistics.median(m["ingestion_seconds"] for m in measurements), 4
                ),
                "boundary": (
                    "Local service calls only; no live mail, HTTP, browser rendering "
                    "or concurrent users measured."
                ),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
