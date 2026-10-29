"""Production startup, deletion recovery and the independent model worker lifecycle."""

import pytest
from test_auth import environment as environment
from test_deployment import production_settings as production_settings

from app import database, deletion_ledger, deployment, explanation_worker, main


def test_ledger_requires_storage_and_rejects_corruption(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_SOC_ENVIRONMENT", "production")
    monkeypatch.delenv("AI_SOC_DELETION_LEDGER_DIR", raising=False)
    with pytest.raises(deployment.DeploymentError):
        deletion_ledger.record("user-synthetic")
    monkeypatch.setenv("AI_SOC_DELETION_LEDGER_DIR", str(tmp_path))
    with pytest.raises(ValueError):
        deletion_ledger.record("../invalid")
    deletion_ledger.record("user-synthetic")
    receipt = next(tmp_path.glob("*.deleted"))
    receipt.write_text("tampered")
    with database.SessionLocal() as db, pytest.raises(deployment.DeploymentError):
        deletion_ledger.reconcile(db)


def test_ledger_is_inactive_in_development(monkeypatch):
    monkeypatch.setenv("AI_SOC_ENVIRONMENT", "development")
    deletion_ledger.record("unused")
    deletion_ledger.reconcile(None)


@pytest.mark.anyio
async def test_public_startup_requires_built_dashboard(
    environment, production_settings, tmp_path, monkeypatch
):
    monkeypatch.setattr(main, "FRONTEND_DIST", tmp_path)
    with pytest.raises(deployment.DeploymentError):
        async with main.lifespan(main.app):
            pass
    (tmp_path / "index.html").write_text("<html>Controlled dashboard</html>")
    database.configure_database(f"sqlite:///{(tmp_path / 'startup.db').as_posix()}")
    monkeypatch.setattr(main, "SessionLocal", database.SessionLocal)
    async with main.lifespan(main.app):
        assert main.health_ready()["database"] == "reachable"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.parametrize("outcome", ["idle", "explained", "disabled"])
def test_model_worker_once_stops_without_collecting(monkeypatch, capsys, outcome):
    monkeypatch.setattr("sys.argv", ["model-worker", "--once"])
    monkeypatch.setattr(explanation_worker.deployment, "validate", lambda: None)
    monkeypatch.setattr(explanation_worker.database, "migrate_schema", lambda: None)
    monkeypatch.setattr(explanation_worker.signal, "signal", lambda *args: None)
    monkeypatch.setattr(explanation_worker, "process_one", lambda: outcome)
    explanation_worker.main()
    assert outcome == "idle" or outcome in capsys.readouterr().out
