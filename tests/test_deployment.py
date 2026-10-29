"""Public configuration must fail closed and never echo private configuration values."""

import pytest
from cryptography.fernet import Fernet

from app import auth, deployment


@pytest.fixture
def production_settings(tmp_path, monkeypatch):
    ledger = tmp_path / "deletions"
    ledger.mkdir()
    monkeypatch.setenv("AI_SOC_DELETION_LEDGER_DIR", str(ledger))
    values = {
        "AI_SOC_ENVIRONMENT": "production",
        "AI_SOC_AUTH_MODE": "google",
        "AI_SOC_PUBLIC_ORIGIN": "https://sentinel.example.test",
        "AI_SOC_ALLOWED_HOSTS": "sentinel.example.test,127.0.0.1",
        "AI_SOC_SIGNUP_POLICY": "public",
        "AI_SOC_GOOGLE_CLIENT_ID": "test-client",
        "AI_SOC_GOOGLE_LOGIN_REDIRECT_URI": "https://sentinel.example.test/api/v1/auth/callback",
        "AI_SOC_GOOGLE_REDIRECT_URI": "https://sentinel.example.test/api/v1/gmail/callback",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv("AI_SOC_DATABASE_URL", raising=False)
    monkeypatch.delenv("AI_SOC_INVITED_EMAILS", raising=False)
    for name, value in {
        "AI_SOC_GOOGLE_CLIENT_SECRET": "synthetic-secret-not-for-display",
        "AI_SOC_DB_PASSWORD": "synthetic-database-password",
        "AI_SOC_TOKEN_KEY": Fernet.generate_key().decode(),
    }.items():
        path = tmp_path / name
        path.write_text(value)
        monkeypatch.setenv(name + "_FILE", str(path))
    return values


def test_complete_production_configuration_and_public_signup(production_settings):
    deployment.validate()
    assert auth.required() and auth.allowed("new-user@example.test")
    assert not auth.configuration()["invitation_only"]
    assert auth.settings()[2].startswith("https://sentinel.example.test/")


@pytest.mark.parametrize(
    "name,value",
    [
        ("AI_SOC_AUTH_MODE", "local"),
        ("AI_SOC_ALLOWED_HOSTS", "*"),
        ("AI_SOC_ENVIRONMENT", "typo"),
        ("AI_SOC_SIGNUP_POLICY", "typo"),
        ("AI_SOC_DATABASE_URL", "sqlite:///private.db"),
        ("AI_SOC_GOOGLE_REDIRECT_URI", "https://attacker.test/api/v1/gmail/callback"),
        ("AI_SOC_GOOGLE_LOGIN_REDIRECT_URI", "https://sentinel.example.test/wrong"),
        ("AI_SOC_EVIDENCE_RETENTION_DAYS", "0"),
        ("AI_SOC_EVIDENCE_RETENTION_DAYS", "366"),
    ],
)
def test_invalid_production_settings_fail_closed(production_settings, monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(deployment.DeploymentError) as caught:
        deployment.validate()
    assert "synthetic-secret" not in str(caught.value)
    assert "synthetic-database-password" not in str(caught.value)
    assert auth.required()


@pytest.mark.parametrize(
    "origin",
    [
        "http://sentinel.example.test",
        "https://localhost",
        "https://127.0.0.1",
        "https://user:password@example.test",
        "https://example.test/path",
        "https://example.test/?secret=hidden",
        "https://your-domain.invalid",
        "https://-bad.example.test",
        "https://example.test:99999",
    ],
)
def test_noncanonical_origins_are_rejected(monkeypatch, origin):
    monkeypatch.setenv("AI_SOC_PUBLIC_ORIGIN", origin)
    with pytest.raises(deployment.DeploymentError):
        deployment.public_origin()


def test_missing_secret_never_echoes_value(production_settings, monkeypatch):
    monkeypatch.setenv("AI_SOC_GOOGLE_CLIENT_SECRET_FILE", "missing-private-file")
    with pytest.raises(deployment.DeploymentError, match="Cannot read"):
        deployment.validate()


def test_invitation_policy_remains_explicit(production_settings, monkeypatch):
    monkeypatch.setenv("AI_SOC_SIGNUP_POLICY", "invite_only")
    with pytest.raises(deployment.DeploymentError, match="invitation list"):
        deployment.validate()
    assert not auth.allowed("new-user@example.test")
