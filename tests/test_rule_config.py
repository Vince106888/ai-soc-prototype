"""Validated rule extension and rejection of unsafe evidence/configuration."""

import json

import pytest
from pydantic import ValidationError

from app import database, rule_config
from app.entities import DetectionRule
from app.platform import evaluate_one
from app.platform_schemas import SignalInput
from app.rule_config import RuleImport, import_rule
from app.rules import DEFAULT_RULES

EXAMPLE = {
    "code": "CUSTOM-001",
    "signal_type": "email",
    "title": "Synthetic rule",
    "weight": 0.4,
    "confidence": 0.8,
    "configuration": {
        "matcher": "nonempty",
        "field": "authentication_failures",
        "evidence": ["authentication_failures"],
    },
}


@pytest.fixture
def db(tmp_path):
    database.configure_database(f"sqlite:///{(tmp_path / 'rules.db').as_posix()}")
    database.migrate_schema()
    with database.SessionLocal() as session:
        yield session


@pytest.mark.parametrize("rule", DEFAULT_RULES)
def test_builtin_configuration_validates(rule):
    assert RuleImport.model_validate(rule).code == rule["code"]


def test_new_stored_rule_executes_without_schema_or_ui_change(db):
    payload = RuleImport.model_validate(EXAMPLE)
    import_rule(db, payload)
    score, codes = evaluate_one(
        db,
        SignalInput(
            external_id="sample",
            signal_type="email",
            features={"sender": "owner@example.test", "spf": "fail"},
        ),
    )
    assert "CUSTOM-001" in codes and score > 0.55
    with pytest.raises(ValueError, match="historical"):
        import_rule(db, payload)


@pytest.mark.parametrize(
    "config",
    [
        {"matcher": "unknown", "evidence": ["sender_domain"]},
        {"matcher": "nonempty", "field": "body", "evidence": ["body"]},
        {"matcher": "nonempty", "field": "matched_terms", "evidence": []},
        {"matcher": "nonempty", "field": "matched_terms", "evidence": "matched_terms"},
        {
            "matcher": "nonempty",
            "field": "matched_terms",
            "evidence": ["matched_terms"],
            "url": "private",
        },
        {
            "matcher": "different_nonempty",
            "fields": ["sender_domain"],
            "evidence": ["sender_domain"],
        },
        {
            "matcher": "equals",
            "field": "brand_mismatch",
            "value": {},
            "evidence": ["brand_mismatch"],
        },
        {"matcher": "all_equal", "conditions": {}, "evidence": ["brand_mismatch"]},
        {
            "matcher": "any_equal",
            "conditions": {"brand_mismatch": {}},
            "evidence": ["brand_mismatch"],
        },
        {
            "matcher": "host_suffix_in",
            "field": "sender_domain",
            "values": ["example.test"],
            "evidence": ["sender_domain"],
        },
        {
            "matcher": "host_suffix_in",
            "field": "url_hosts",
            "values": [],
            "evidence": ["url_hosts"],
        },
        {
            "matcher": "host_suffix_in",
            "field": "url_hosts",
            "values": ["https://example.test/private"],
            "evidence": ["url_hosts"],
        },
        {
            "matcher": "host_suffix_in",
            "field": "url_hosts",
            "values": [None],
            "evidence": ["url_hosts"],
        },
    ],
)
def test_invalid_or_private_configuration_rejected(config):
    with pytest.raises(ValidationError):
        RuleImport.model_validate({**EXAMPLE, "configuration": config})


def test_host_label_matcher_cli_validation_and_import(db, tmp_path, monkeypatch, capsys):
    value = {
        **EXAMPLE,
        "configuration": {
            "matcher": "host_label_in",
            "field": "url_hosts",
            "values": ["signin"],
            "evidence": ["url_hosts"],
        },
    }
    path = tmp_path / "rule.json"
    path.write_text(json.dumps(value), encoding="utf-8")
    monkeypatch.setattr("sys.argv", ["rules", str(path), "--check-only"])
    rule_config.main()
    assert '"imported": false' in capsys.readouterr().out
    monkeypatch.setattr("sys.argv", ["rules", str(path)])
    rule_config.main()
    assert db.get(DetectionRule, "CUSTOM-001")
    with pytest.raises(SystemExit):
        rule_config.main()
