# Codebase Guide

## Repository layout

```text
.github/                 CI, issue, and dependency automation
app/                     FastAPI platform and deterministic processing
docs/                    Architecture, contracts, safeguards, and evidence plan
docs/assets/             Original report diagrams used by the documentation
fixtures/                Controlled synthetic demonstration input
frontend/                React/Vite dashboard
tests/                   Backend unit and API tests
AGENTS.md                Repository-wide implementation guardrails
README.md                Product overview and quick start
SECURITY.md              Vulnerability reporting and safe-data rules
pyproject.toml           Python dependencies and quality configuration
uv.lock                  Reproducible Python dependency resolution
```

## Backend map

| File | Responsibility |
|---|---|
| `app/main.py` | Application creation, schema startup, HTTP guards, `/health`, legacy `/analyze`, router registration |
| `app/api.py` | `/api/v1` routes, tenant/API-key context, safe HTTP error mapping |
| `app/platform_schemas.py` | Strict account, source, scan, signal, incident, rule, audit, and evaluation contracts |
| `app/database.py` | SQLite default, configurable SQLAlchemy engine, sessions, schema creation |
| `app/entities.py` | Persistent evidence and operational entities/indexes/constraints |
| `app/rules.py` | Data minimisation, eight default rules, evidence extraction, scoring, fingerprints |
| `app/platform.py` | Application services for registry, ingestion, correlation, lifecycle, detail, evaluation |
| `app/models.py` | Legacy `/analyze` request/finding/result contracts |
| `app/detection.py` | Legacy four-rule stateless analyser |

## Frontend map

| File | Responsibility |
|---|---|
| `frontend/src/App.tsx` | Overview, incidents, coverage, detail, transitions, scan/settings UI |
| `frontend/src/api.ts` | Typed API client and request headers |
| `frontend/src/types.ts` | Client-side platform contracts |
| `frontend/src/styles.css` | Responsive visual system and interaction states |
| `frontend/src/utils.ts` | Display and filtering helpers |
| `frontend/src/*.test.ts*` | API/helper/component behaviour tests |
| `frontend/vite.config.ts` | Vite and local `/api` proxy configuration |

## Persistent request flow

```text
POST signal batch
  -> validate source and optional scan job in tenant
  -> normalise/minimise features
  -> reject duplicate source/external ID
  -> persist signal and fingerprint
  -> evaluate enabled rules
  -> persist evidence-backed findings >= 0.10
  -> correlate by account/key/window
  -> recompute score, confidence, severity, explanation, actions
  -> complete referenced scan job
  -> return per-item import/finding/incident result
```

Incident list/detail and lifecycle requests read the stored evidence chain.
Evaluation is a dry run and does not persist cases.

## Two analysis contracts

The project currently preserves two intentionally different APIs:

- `/analyze`: legacy single email, no persistence, 0–100 additive score;
- `/api/v1`: multi-signal persistent platform, score in 0–1 with bounded
  accumulation.

New platform work should target `/api/v1`. Keep the legacy contract stable until
a deliberate versioned removal is approved.

## Where to document changes

- Route/schema change: `API.md` and OpenAPI tests.
- Entity/index/invariant change: `DATA_MODEL.md`.
- Rule, score, confidence, or correlation change: `RULE_CATALOG.md`.
- Data exposure or lifetime change: `PRIVACY_AND_RETENTION.md` and `SECURITY.md`.
- Runtime/config/deployment change: `OPERATIONS.md`.
- Capability completion: `CAPABILITY_MATRIX.md`, `ROADMAP.md`, and
  `REQUIREMENTS_TRACEABILITY.md`.
- Research measurement change: `EVALUATION.md`.
