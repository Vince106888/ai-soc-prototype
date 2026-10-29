"""The benchmark must exercise repeat processing without modifying the user's database."""

import json
import sys

from app import benchmark, database


def test_benchmark_is_isolated_and_reports_repeat_counts(tmp_path, monkeypatch, capsys):
    original = f"sqlite:///{(tmp_path / 'original.db').as_posix()}"
    database.configure_database(original)
    database.create_schema()
    monkeypatch.setattr(sys, "argv", ["benchmark", "--runs", "1"])
    benchmark.main()
    report = json.loads(capsys.readouterr().out)
    assert str(database.engine.url) == original
    result = report["measurements"][0]
    assert result["imported"] == result["duplicate_count"] == 500
    assert result["findings"] == 300 and result["incidents"] == 50
    assert result["ingestion_seconds"] > 0
    assert len(report["input_sha256"]) == 64
