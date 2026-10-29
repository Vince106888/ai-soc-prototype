"""Operator initialization never overwrites credentials or accepts ambiguous callbacks."""

import json

import pytest

from app.deployment import DeploymentError
from scripts.production import initialise


def client_file(tmp_path):
    path = tmp_path / "client.json"
    path.write_text(
        json.dumps(
            {
                "web": {
                    "client_id": "synthetic-client",
                    "client_secret": "synthetic-secret",
                    "redirect_uris": ["https://sentinel.example.test:8443/api/v1/auth/callback"],
                }
            }
        )
    )
    return path


def test_init_private_files_and_refuses_overwrite(tmp_path, capsys):
    target = tmp_path / "operator"
    client = client_file(tmp_path)
    initialise(target, "https://sentinel.example.test:8443", client, "ops@example.test", True)
    original = (target / "secrets/token-key").read_bytes()
    with pytest.raises(FileExistsError):
        initialise(target, "https://sentinel.example.test:8443", client, "ops@example.test", True)
    assert (target / "secrets/token-key").read_bytes() == original
    assert "synthetic-secret" not in capsys.readouterr().out
    assert "AI_SOC_GMAIL_ENABLED=false" in (target / "deployment.env").read_text()


@pytest.mark.parametrize("origin", ["http://sentinel.example.test", "https://real.example:8443"])
def test_invalid_test_origin_does_not_create_files(tmp_path, origin):
    target = tmp_path / "operator"
    with pytest.raises((ValueError, DeploymentError)):
        initialise(target, origin, client_file(tmp_path), "ops@example.test", True)
    assert not target.exists()
