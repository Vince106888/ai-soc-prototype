"""Evaluate versioned synthetic splits without opening the operator's database."""

import argparse
import hashlib
import json
import platform
import tempfile
from pathlib import Path

from sqlalchemy import select

from app import database
from app.entities import DetectionRule, utcnow
from app.platform import evaluate_one, run_evaluation
from app.platform_schemas import EvaluationRequest

ROOT = Path(__file__).resolve().parents[1]


def evaluate(path: Path) -> dict:
    raw = path.read_bytes()
    data = json.loads(raw)
    request = EvaluationRequest.model_validate(data["evaluation"])
    with database.SessionLocal() as db:
        metrics = run_evaluation(db, request).model_dump(mode="json")
        results = []
        for case in request.cases:
            score, codes = evaluate_one(db, case.signal)
            results.append(
                {
                    "case_id": case.case_id,
                    "expected": case.expected_suspicious,
                    "predicted": score >= request.threshold,
                    "score": score,
                    "rules": codes,
                }
            )
        rules = [
            {
                "code": r.code,
                "version": r.version,
                "weight": r.weight,
                "confidence": r.confidence,
                "configuration": r.configuration,
                "enabled": r.enabled,
            }
            for r in db.scalars(select(DetectionRule).order_by(DetectionRule.code))
        ]
    return {
        "dataset": path.name,
        "dataset_sha256": hashlib.sha256(raw).hexdigest(),
        "label_basis": data["label_basis"],
        "metrics": metrics,
        "cases": results,
        "rule_snapshot_sha256": hashlib.sha256(
            json.dumps(rules, sort_keys=True).encode()
        ).hexdigest(),
        "rule_snapshot": rules,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    original = database.engine.url.render_as_string(hide_password=False)
    try:
        with tempfile.TemporaryDirectory(prefix="lindabiz-evaluation-") as directory:
            database.configure_database(f"sqlite:///{Path(directory).as_posix()}/evaluation.db")
            database.migrate_schema()
            results = [
                evaluate(ROOT / "fixtures/evaluation" / f"{split}.json")
                for split in ["development-v1", "heldout-v1"]
            ]
            database.engine.dispose()
    finally:
        database.configure_database(original)
    report = {
        "measured_at": utcnow().isoformat(),
        "os": platform.platform(),
        "python": platform.python_version(),
        "detector_sha256": hashlib.sha256((ROOT / "app/rules.py").read_bytes()).hexdigest(),
        "splits": results,
        "limitation": (
            "Synthetic stipulated labels, authored with knowledge of the rules. Challenge cases "
            "include development probes as controls; this is not independent or representative "
            "accuracy validation. No calibration or threshold tuning was performed."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "metrics": [r["metrics"] for r in results]}))


if __name__ == "__main__":
    main()
