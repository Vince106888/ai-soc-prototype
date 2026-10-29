"""Windows restart rejects unsafe configuration before touching Docker services."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from scripts.run import find_docker

POWERSHELL = shutil.which("powershell")
pytestmark = pytest.mark.skipif(
    not POWERSHELL or not find_docker(), reason="Windows PowerShell and Docker CLI required"
)
SOURCE = Path(__file__).parents[1] / "scripts/restart.ps1"


def installation(tmp_path):
    scripts = tmp_path / "scripts"
    scripts.mkdir()
    script = scripts / "restart.ps1"
    shutil.copyfile(SOURCE, script)
    (tmp_path / "data").mkdir()
    (tmp_path / "data/docker.env").write_text("PRIVATE_MARKER_MUST_NOT_BE_PRINTED")
    return script


def invoke(script, *args):
    return subprocess.run(
        [
            POWERSHELL,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script),
            "-NoBrowser",
            *args,
        ],
        capture_output=True,
        text=True,
        timeout=20,
    )


def test_missing_google_configuration_never_starts_unauthenticated_workspace(tmp_path):
    result = invoke(installation(tmp_path))
    assert result.returncode != 0
    assert "Saved Google sign-in configuration is missing" in result.stderr
    assert "Restarting LindaBiz" not in result.stdout
    assert "PRIVATE_MARKER" not in result.stdout + result.stderr


def test_port_change_is_rejected_before_restarting_services(tmp_path):
    script = installation(tmp_path)
    config = {
        "services": {
            "api": {
                "environment": {
                    "AI_SOC_GOOGLE_LOGIN_REDIRECT_URI": "http://127.0.0.1:8001/api/v1/auth/callback",
                },
                "volumes": [],
            }
        }
    }
    (tmp_path / "data/compose.google.json").write_text(json.dumps(config))
    result = invoke(script, "-Port", "8002")
    assert result.returncode != 0
    assert "saved Google callback uses a different port" in result.stderr
    assert "Restarting LindaBiz" not in result.stdout
    assert "PRIVATE_MARKER" not in result.stdout + result.stderr
