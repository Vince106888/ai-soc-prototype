"""Portable startup must preserve existing secrets and work outside the checkout."""

import sys

import pytest

from scripts import run as launcher


def test_deployment_secrets_are_generated_once_outside_existing_env(tmp_path, monkeypatch):
    monkeypatch.setattr(launcher, "ROOT", tmp_path)
    original = tmp_path / ".env"
    original.write_text("PRIVATE_EXISTING_CONFIGURATION", encoding="utf-8")
    env = launcher.docker_environment()
    path = tmp_path / "data/docker.env"
    first = path.read_text()
    values = dict(line.split("=", 1) for line in first.splitlines())
    assert len(values["AI_SOC_API_KEY"]) == len(values["POSTGRES_PASSWORD"]) == 64
    assert values["AI_SOC_API_KEY"] != values["POSTGRES_PASSWORD"]
    assert values["AI_SOC_AUTH_MODE"] == "local"
    assert env["AI_SOC_ENV_FILE"] == str(path)
    launcher.docker_environment()
    assert path.read_text() == first
    assert original.read_text() == "PRIVATE_EXISTING_CONFIGURATION"


def test_subprocess_uses_checkout_even_from_another_directory(tmp_path, monkeypatch):
    calls = []
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(launcher.subprocess, "run", lambda *args, **kwargs: calls.append(kwargs))
    launcher.run("example-command")
    assert calls[0]["cwd"] == launcher.ROOT
    assert calls[0]["check"] is True


def test_stop_never_destroys_data_volumes(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(launcher, "ROOT", tmp_path)
    monkeypatch.setattr(launcher.shutil, "which", lambda name: name)
    monkeypatch.setattr(launcher, "run", lambda *args, **kwargs: calls.append(args))
    monkeypatch.setattr(sys, "argv", ["run.py", "down", "--model"])
    launcher.main()
    assert calls[0][-1] == "down"
    assert "compose.ollama.yaml" in calls[0]
    assert "--volumes" not in calls[0]


def test_missing_docker_does_not_create_secrets(tmp_path, monkeypatch):
    monkeypatch.setattr(launcher, "ROOT", tmp_path)
    monkeypatch.setattr(launcher, "find_docker", lambda: None)
    monkeypatch.setattr(sys, "argv", ["run.py", "docker"])
    with pytest.raises(SystemExit) as exc:
        launcher.main()
    assert exc.value.code == 2
    assert not (tmp_path / "data").exists()


def test_low_disk_blocks_build_before_creating_secrets(tmp_path, monkeypatch):
    from types import SimpleNamespace

    monkeypatch.setattr(launcher, "ROOT", tmp_path)
    monkeypatch.setattr(launcher.shutil, "which", lambda name: name)
    monkeypatch.setattr(launcher.shutil, "disk_usage", lambda path: SimpleNamespace(free=1024))
    monkeypatch.setattr(sys, "argv", ["run.py", "docker"])
    with pytest.raises(SystemExit) as exc:
        launcher.main()
    assert exc.value.code == 2
    assert not (tmp_path / "data").exists()


def test_doctor_handles_engine_timeout_without_creating_or_printing_secrets(tmp_path, monkeypatch):
    import json
    from types import SimpleNamespace

    monkeypatch.setattr(launcher, "ROOT", tmp_path)
    monkeypatch.setattr(launcher, "find_docker", lambda: "docker")
    monkeypatch.setattr(
        launcher.shutil, "disk_usage", lambda path: SimpleNamespace(free=6 * 1024**3)
    )

    def timeout(*args, **kwargs):
        raise launcher.subprocess.TimeoutExpired("docker", 15)

    monkeypatch.setattr(launcher.subprocess, "run", timeout)
    report = launcher.doctor(8001)
    assert report["docker_cli_found"] and not report["docker_engine_ready"]
    assert report["build_disk_headroom"]
    assert report["dashboard_url"] == "http://127.0.0.1:8001"
    assert "AI_SOC_API_KEY" not in json.dumps(report)
    assert not (tmp_path / "data").exists()
