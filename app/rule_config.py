"""Validated operator rule import. New supported matcher instances need no UI change."""

import argparse
import json
from pathlib import Path
from typing import Annotated

from pydantic import Field, model_validator

from . import database
from .entities import AuditRecord, DetectionRule
from .platform_schemas import APIModel, CanonicalSignalType
from .rules import SUPPRESSION_FLAGS

SAFE_FIELDS = {
    "email": {
        "display_name",
        "sender_domain",
        "reply_to_domain",
        "matched_terms",
        "url_hosts",
        "payment_change_terms",
        "payment_action_terms",
        "claimed_domains",
        "lookalike_domain",
        "claimed_brand",
        "brand_mismatch",
        "authentication_failures",
        "local_scam_terms",
        "first_contact",
        "trusted_sender",
    },
    "forwarding": {"target_domain", "enabled", "external", "authorized"},
    "signin": {
        "new_device",
        "unusual",
        "impossible_travel",
        "risk_level",
        "success",
        "source_country",
    },
    "mfa": {"enabled", "method_count"},
    "oauth_grant": {"broad_scope", "verified", "scope_categories", "app_name"},
}


class RuleImport(APIModel):
    code: Annotated[str, Field(pattern=r"^[A-Z][A-Z0-9-]{2,39}$")]
    signal_type: CanonicalSignalType
    title: Annotated[str, Field(min_length=1, max_length=200)]
    weight: Annotated[float, Field(ge=0.1, le=1)]
    confidence: Annotated[float, Field(ge=0, le=1)]
    version: Annotated[int, Field(ge=1)] = 1
    enabled: bool = True
    configuration: dict

    @model_validator(mode="after")
    def validate_matcher(self):
        config = self.configuration
        matcher = config.get("matcher")
        options = {
            "different_nonempty": {"fields"},
            "all_nonempty": {"fields"},
            "nonempty": {"field"},
            "equals": {"field", "value"},
            "all_equal": {"conditions"},
            "any_equal": {"conditions"},
            "host_suffix_in": {"field", "values"},
            "host_label_in": {"field", "values"},
            "host_label_untrusted": {"field", "values", "trusted_hosts"},
        }
        if matcher not in options:
            raise ValueError("Unsupported deterministic matcher")
        required = options[matcher] | {"matcher", "evidence"}
        if not required <= set(config) <= required | {"suppress_if"}:
            raise ValueError("Supply exactly the documented matcher keys and evidence")
        if "suppress_if" in config and (
            not isinstance(config["suppress_if"], list)
            or not set(config["suppress_if"]) <= SUPPRESSION_FLAGS
        ):
            raise ValueError("suppress_if may only list supported context flags")
        fields = []
        for key in ["evidence", "fields"]:
            if key in config:
                value = config[key]
                if not isinstance(value, list) or not value or len(value) > 20:
                    raise ValueError("Matcher/evidence fields must be a nonempty bounded list")
                fields.extend(value)
        if "field" in config:
            fields.append(config["field"])
        if "conditions" in config:
            conditions = config["conditions"]
            if not isinstance(conditions, dict) or not conditions or len(conditions) > 20:
                raise ValueError("Conditions must be a nonempty bounded object")
            fields.extend(conditions)
            if any(type(value) not in (str, bool, int, float) for value in conditions.values()):
                raise ValueError("Condition values must be scalar")
        if any(
            not isinstance(field, str) or field not in SAFE_FIELDS[self.signal_type]
            for field in fields
        ):
            raise ValueError("Only approved minimised feature/evidence fields are allowed")
        if matcher == "different_nonempty" and len(config["fields"]) != 2:
            raise ValueError("different_nonempty requires exactly two fields")
        if "value" in config and type(config["value"]) not in (str, bool, int, float):
            raise ValueError("Comparison value must be scalar")
        if matcher.startswith("host_") and config["field"] != "url_hosts":
            raise ValueError("Host matchers require the minimised url_hosts list")
        for key in ["values", "trusted_hosts"]:
            if key in config:
                values = config[key]
                if not isinstance(values, list) or not values or len(values) > 100:
                    raise ValueError("Host values must be a nonempty bounded list")
                if any(
                    not isinstance(value, str)
                    or not value
                    or len(value) > 253
                    or not all(c.isalnum() or c in ".-" for c in value)
                    for value in values
                ):
                    raise ValueError("Use host names or labels, never full URLs")
        return self


def import_rule(db, payload: RuleImport):
    rule = db.get(DetectionRule, payload.code)
    if rule:
        raise ValueError(
            "Use a new rule code to preserve historical evidence; overwrites are rejected"
        )
    if rule is None:
        rule = DetectionRule(code=payload.code)
        db.add(rule)
    for key, value in payload.model_dump().items():
        setattr(rule, key, value)
    db.add(
        AuditRecord(
            tenant_id="operator",
            actor="operator-cli",
            action="rule_imported",
            detail=f"Global research rule {payload.code}; version {payload.version}.",
        )
    )
    db.commit()
    return rule


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    try:
        payload = RuleImport.model_validate_json(args.file.read_text("utf-8"))
        if not args.check_only:
            database.migrate_schema()
            with database.SessionLocal() as db:
                import_rule(db, payload)
    except (ValueError, OSError):
        parser.error("Invalid rule file, configuration, or version; no rule was imported.")
    print(
        json.dumps(
            {
                "code": payload.code,
                "version": payload.version,
                "validated": True,
                "imported": not args.check_only,
            }
        )
    )


if __name__ == "__main__":
    main()
