# Requirements Traceability Matrix

This matrix uses the identifiers and acceptance intent from the revised Chapter
4 report. Status values are **Implemented**, **Partial**, **Not implemented**, or
**Unverified target**. A source/profile schema alone is not treated as a working
external integration.

## Functional requirements

| ID | Requirement | Status | Implementation/evidence |
|---|---|---|---|
| FR-01 | Connect and disconnect an authorised source | Partial | Controlled lifecycle and Gmail OAuth/refresh/disconnect; local consent validated; live revocation and production identity pending |
| FR-02 | Collect mailbox security signals | Partial | Selected-email ingestion and authorised local Gmail inbox sample/repeat scan validated; broader administrator collection remains absent |
| FR-03 | Collect account-posture signals | Implemented for controlled data | Forwarding, sign-in, MFA, and OAuth-grant inputs; live Workspace admin source absent |
| FR-04 | Normalise collected data | Implemented | Common persisted signal model with type-specific derived features |
| FR-05 | Run user and scheduled scans | Implemented for bounded/controlled scope | On-demand ingestion and opt-in polling worker; real controlled SQLite/PostgreSQL execution, leases/recovery/retry/isolation tests; `SCHEDULING.md` |
| FR-06 | Detect suspicious email and links | Implemented | `EMAIL-001` through `EMAIL-006`, `URL-001/002`, deterministic tests |
| FR-07 | Detect posture/compromise indicators | Implemented for controlled data | `FORWARD-001`, `SIGNIN-001`, `MFA-001`, `OAUTH-001` |
| FR-08 | Score findings | Implemented | Stored rule/evidence/weight/confidence; bounded score `0..1` |
| FR-09 | Correlate related findings | Implemented | Same tenant/account/key and 30-minute window; unrelated keys remain separate |
| FR-10 | Manage incident lifecycle | Implemented | Validated transitions, automatic reopen, audit history |
| FR-11 | Display prioritised incidents | Implemented | Counted/paged severity/status/text/account and latest-evidence time range filters; explicit UTC incident time; independent open queue |
| FR-12 | Display incident evidence | Implemented | Detail response/view plus searchable retained signals, no-match records and linked incidents; findings, explanation, actions and audit |
| FR-13 | Explain incidents and recommend responses | Implemented with templates | Four-part template and advisory action catalogue; external AI absent |
| FR-14 | Record audit and evaluation data | Implemented | Lifecycle/system audit records and labelled evaluation metrics |

## Non-functional requirements

| ID | Requirement/target | Status | Implementation/evidence or gap |
|---|---|---|---|
| NFR-01 | Protect tokens, secrets, and evidence | Partial | Optional API key, minimisation, defensive HTTP controls; Gmail tokens encrypted under external key; full storage encryption/TLS/rotation are operator responsibilities |
| NFR-02 | Collect and retain only necessary data | Implemented locally | Bodies reduced to matched terms, URLs to hosts, attachments/raw messages rejected; seven-day Gmail account expiry and manual deletion tested; general retention pending |
| NFR-03 | Restrict users to their resources | Implemented for invited localhost pilot; production partial | Verified Google subject, server-assigned workspace, session/CSRF checks and cross-user denial tests; local mode remains caller-selected; roles/public hosting absent |
| NFR-04 | 80% of users identify priority/reason/action within 3 minutes | Unverified target | Dashboard supports the tasks; formal usability study remains |
| NFR-05 | Trace severity to evidence and rules | Implemented | Incident detail exposes signals, findings, copied weights/confidence, score, explanation source |
| NFR-06 | No corruption on duplicate processing or temporary failures | Implemented for bounded prototype | Transaction rollback, idempotent external IDs, safe terminal failures, expired lease recovery and three-attempt bounded backoff; live Google outage exercise pending |
| NFR-07 | Up to 500 records visible within 5 minutes | Verified for one controlled development run | 500 email-only records, HTTP ingest 24.6979 s, visibly confirmed in dashboard within 113.963 s; repeat 500 duplicates/zero new findings; `BENCHMARK.md` |
| NFR-08 | Modular, separately testable, configuration-driven design | Implemented with limits | Modules and stored rule configuration are separate; new matcher families still require code |
| NFR-09 | Documented one-host container startup and end-to-end scan | Partial verification | API/dashboard/worker/PostgreSQL Compose and CI smoke implemented; native PostgreSQL scan/worker/restore verified; container runtime execution pending |

## Evidence locations

| Area | Primary code | Automated/review evidence | Documentation |
|---|---|---|---|
| API/access | `app/main.py`, `app/api.py`, `app/platform_schemas.py` | `tests/test_api.py` | `API.md`, `OPERATIONS.md` |
| Persistence | `app/database.py`, `app/entities.py` | platform API tests | `DATA_MODEL.md` |
| Rules/scoring | `app/rules.py`, legacy `app/detection.py` | rule, scoring, and detection tests | `RULE_CATALOG.md` |
| Correlation/lifecycle | `app/platform.py` | correlation/transition tests | `RULE_CATALOG.md` |
| Dashboard | `frontend/src/` | Vitest suite and production build | README and frontend README |
| Privacy/security | validation, normalisation, middleware | rejection/isolation/idempotency tests | `PRIVACY_AND_RETENTION.md`, `SECURITY.md`, `THREAT_MODEL.md` |
| Evaluation | `run_evaluation` and `/api/v1/evaluation` | metric test cases | `EVALUATION.md` |
| Evidence pages | `app/evidence.py`, `app/api.py`, `frontend/src/EvidenceWorkspace.tsx` | `tests/test_evidence.py`, dashboard evidence tests | `API.md`, `DATA_MODEL.md` |
| Local performance | `app/benchmark.py` | three isolated runs and `tests/test_benchmark.py` | `BENCHMARK.md` |
| App onboarding/access | `app/auth.py`, `app/auth_api.py`, `frontend/src/AuthGate.tsx` | `tests/test_auth.py`, AuthGate/API frontend tests; live sign-in pending | `ONBOARDING.md`, `API.md`, privacy/operations |

## Remaining evidence gaps

- live Gmail refresh, expiry, revocation and retry evidence (local consent and
  bounded collection succeeded on 4 October 2026; see `EVALUATION.md`);
- live Workspace administrator consent, capability and collection evidence;
- production identity and tenant-isolation penetration tests;
- container/production PostgreSQL operational evidence; native migration/scan/restore passed on this development host;
- container runtime execution of the prepared worker/API/PostgreSQL stack;
- larger-scale, repeated/concurrent and live-provider performance (one email-only HTTP-to-dashboard run verified);
- representative labelled dataset and calibration report;
- formal non-specialist usability study;
- general retention scheduling, backup deletion, and restoration.


## October analyst-console update

See [PRODUCT_SCOPE.md](PRODUCT_SCOPE.md) for the product comparison and necessary
completion milestones. Email normalisation now retains bounded payment phrase
groups and whitelisted supplied authentication observations. `EMAIL-006` requires
both payment-change and payment-action groups (weight 0.50, confidence 0.75).
Findings remain deterministic and traceable; existing signals are not re-scored.
No database migration or new connector scope is required. Shared screenshots and
evaluation exports must use controlled data; unit tests do not establish accuracy.
