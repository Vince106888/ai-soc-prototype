# System Overview

SentinelSME is a browser-accessible defensive monitoring prototype for
resource-constrained organisations. Its implemented controlled-data path turns
email and account-security signals into evidence-backed incidents and advisory
response guidance.

```text
React dashboard
    -> FastAPI /api/v1
        -> account/source/scan control
        -> privacy-minimising normalisation
        -> deterministic rule evaluation
        -> bounded score and confidence
        -> 30-minute incident correlation
        -> template explanation and approved actions
        -> SQLAlchemy evidence store
```

The original `/analyze` route is a stateless compatibility path. The platform
workflow uses `/api/v1` and persistence.

## User workflow

```text
register controlled account and source
    -> create scan record
    -> submit controlled signals
    -> review prioritised incident
    -> inspect rules and evidence
    -> follow advisory guidance
    -> move incident through review lifecycle
    -> preserve audit/evaluation evidence
```

The dashboard has overview, incidents, and coverage views. Incident detail
answers four questions: what happened, why it matters, how severe it is, and
what to do next. Evidence remains visible so the explanation is reviewable.

## Components

- `app/main.py`: FastAPI application, middleware, health, and legacy analysis.
- `app/api.py`: versioned account/source/scan/incident/rule/audit/evaluation API.
- `app/platform_schemas.py`: strict platform request and response contracts.
- `app/database.py` and `app/entities.py`: database configuration and relational
  evidence model.
- `app/rules.py`: normalisation, seeded rules, bounded scoring, correlation-key
  defaults, and fingerprints.
- `app/platform.py`: orchestration, persistence, correlation, lifecycle,
  explanations, recommendations, and evaluation.
- `frontend/src/`: React dashboard, API client, UI states, and tests.

## System boundary

Implemented: controlled inputs, all five signal types, deterministic rules,
persistence, correlation, lifecycle, audit, template guidance, evaluation, and
dashboard review.

Not implemented: live Gmail/Workspace access, OAuth tokens, a scheduler/worker,
external model calls, automated remediation, production identity, or enterprise
SIEM/endpoint/network coverage.

See `CAPABILITY_MATRIX.md` for the precise status, `DATA_MODEL.md` for the
evidence chain, `RULE_CATALOG.md` for decision logic, and `API.md` for the
executable interface.

