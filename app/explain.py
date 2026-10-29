"""Local-model explanation commands.

``python -m app.explain --check``
    Verify the local Ollama model end to end on synthetic data only, and write a
    dated evidence report (latency, valid-output rate, fallback reasons, sample text).

``python -m app.explain --tenant demo``
    Explain open incidents in an existing workspace whose guidance is still the template.
"""

from __future__ import annotations

import argparse
import json
import platform
import statistics
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from . import database, explainer
from .demo import DEFAULT_FIXTURE
from .entities import AuditRecord, Incident, IncidentExplanation
from .platform import create_account, create_scan_job, create_source, ingest_signals
from .platform_schemas import AccountCreate, EvaluationRequest, SignalBatch, SourceCreate

CHECK_TENANT = "explainer-check"


def _ollama_info(config: explainer.Settings) -> dict:
    info = {"url": config.url, "model": config.model, "reachable": False, "model_present": False}
    try:
        version = httpx.get(f"{config.url}/api/version", timeout=10).json().get("version")
        tags = httpx.get(f"{config.url}/api/tags", timeout=10).json().get("models", [])
    except (httpx.HTTPError, ValueError):
        return info
    names = {item.get("name") for item in tags} | {item.get("model") for item in tags}
    info.update(reachable=True, ollama_version=version)
    info["model_present"] = config.model in names or f"{config.model}:latest" in names
    for item in tags:
        if item.get("name") in (config.model, f"{config.model}:latest"):
            details = item.get("details", {})
            info.update(
                parameter_size=details.get("parameter_size"),
                quantization=details.get("quantization_level"),
                size_bytes=item.get("size"),
            )
    return info


def _seed(session) -> None:
    fixture = EvaluationRequest.model_validate_json(DEFAULT_FIXTURE.read_text("utf-8"))
    account = create_account(
        session, CHECK_TENANT, AccountCreate(email="security@sentinelsme.example")
    )
    source = create_source(
        session,
        CHECK_TENANT,
        account.id,
        SourceCreate(
            name="Synthetic explainer check",
            external_id="explainer-check",
            capabilities=["email", "forwarding", "signin", "mfa", "oauth_grant"],
        ),
    )
    job = create_scan_job(session, CHECK_TENANT, source.id, "user")
    ingest_signals(
        session,
        CHECK_TENANT,
        source.id,
        SignalBatch(scan_job_id=job.id, signals=[case.signal for case in fixture.cases]),
    )


def check(runs: int, output: Path) -> dict:
    config = explainer.settings()
    report: dict = {
        "measured_at": datetime.now(UTC).isoformat(),
        "platform": platform.platform(),
        "processor": platform.processor(),
        "python": platform.python_version(),
        "enabled": config.enabled,
        "ollama": _ollama_info(config),
        "data": "Built-in synthetic scenarios only (fixtures/evaluation/scenarios.json).",
        "runs": [],
    }
    if not config.enabled:
        report["result"] = "disabled: set AI_SOC_EXPLAINER=ollama (loopback URL only)"
    elif not report["ollama"]["reachable"]:
        report["result"] = "Ollama is not reachable at the configured loopback URL"
    elif not report["ollama"]["model_present"]:
        report["result"] = f"model {config.model} not pulled: run 'ollama pull {config.model}'"
    if "result" in report:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2), encoding="utf-8")
        return report

    with tempfile.TemporaryDirectory() as tmp:
        database.configure_database(f"sqlite:///{(Path(tmp) / 'check.db').as_posix()}")
        try:
            database.migrate_schema()
            with database.SessionLocal() as session:
                _seed(session)
                for run in range(1, runs + 1):
                    session.execute(
                        delete(IncidentExplanation).where(IncidentExplanation.source == "ai")
                    )
                    session.execute(
                        delete(AuditRecord).where(AuditRecord.action.like("ai_explanation_%"))
                    )
                    session.commit()
                    session.expire_all()
                    incidents = session.scalars(
                        select(Incident)
                        .options(
                            selectinload(Incident.findings),
                            selectinload(Incident.explanations),
                            selectinload(Incident.recommendations),
                        )
                        .where(Incident.tenant_id == CHECK_TENANT)
                        .order_by(Incident.score.desc())
                    ).all()
                    for incident in incidents:
                        started = time.perf_counter()
                        outcome = explainer.explain_incident(session, incident, config)
                        elapsed = round(time.perf_counter() - started, 2)
                        entry = {
                            "run": run,
                            "incident": incident.title,
                            "severity": incident.severity,
                            "outcome": outcome,
                            "seconds": elapsed,
                        }
                        if outcome == "explained":
                            session.refresh(incident)
                            latest = max(incident.explanations, key=lambda item: item.created_at)
                            entry["explanation"] = latest.content
                        report["runs"].append(entry)
                        print(
                            json.dumps(
                                {k: entry[k] for k in ("run", "incident", "outcome", "seconds")}
                            )
                        )
        finally:
            database.engine.dispose()
    times = [item["seconds"] for item in report["runs"]]
    valid = [item for item in report["runs"] if item["outcome"] == "explained"]
    report["summary"] = {
        "attempts": len(times),
        "valid_explanations": len(valid),
        "valid_rate_percent": round(100 * len(valid) / len(times), 1) if times else 0,
        "median_seconds": statistics.median(times) if times else None,
        "max_seconds": max(times) if times else None,
        "fallback_reasons": sorted(
            {item["outcome"] for item in report["runs"] if item["outcome"] != "explained"}
        ),
    }
    report["result"] = "completed"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--check", action="store_true", help="synthetic end-to-end model check")
    parser.add_argument("--runs", type=int, choices=range(1, 11), default=3)
    parser.add_argument("--tenant", help="explain pending incidents in this workspace")
    parser.add_argument("--limit", type=int, choices=range(1, 51), default=10)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.check:
        stamp = datetime.now(UTC).strftime("%Y-%m-%d")
        output = args.output or Path("data") / f"explainer-check-{stamp}.json"
        report = check(args.runs, output)
        print(json.dumps({"result": report["result"], **report.get("summary", {})}, indent=2))
        print(f"Report written to {output}")
        return
    if not args.tenant:
        parser.error("use --check, or --tenant to explain pending incidents")
    database.migrate_schema()
    with database.SessionLocal() as session:
        print(
            json.dumps(explainer.explain_pending(session, limit=args.limit, tenant_id=args.tenant))
        )


if __name__ == "__main__":
    main()
