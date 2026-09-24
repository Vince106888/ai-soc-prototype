# Requirements Traceability Matrix

This matrix uses the identifiers and acceptance intent from the revised Chapter
4 report. Status values are **Implemented**, **Partial**, **Not implemented**, or
**Unverified target**. A source/profile schema alone is not treated as a working
external integration.

## Functional requirements

| ID | Requirement | Status | Implementation/evidence |
|---|---|---|---|
| FR-01 | Connect and disconnect an authorised source | Partial | Source registration and active/disconnected enforcement work; Gmail OAuth consent/token exchange does not |
| FR-02 | Collect mailbox security signals | Partial | Controlled email inputs are minimised and normalised; no live mailbox collector |
| FR-03 | Collect account-posture signals | Implemented for controlled data | Forwarding, sign-in, MFA, and OAuth-grant inputs; live Workspace admin source absent |
| FR-04 | Normalise collected data | Implemented | Common persisted signal model with type-specific derived features |
| FR-05 | Run user and scheduled scans | Partial | Both trigger values and job records exist; no scheduler/worker executes remote collection |
| FR-06 | Detect suspicious email and links | Implemented | `EMAIL-001/002`, `URL-001/002`, deterministic tests |
| FR-07 | Detect posture/compromise indicators | Implemented for controlled data | `FORWARD-001`, `SIGNIN-001`, `MFA-001`, `OAUTH-001` |
| FR-08 | Score findings | Implemented | Stored rule/evidence/weight/confidence; bounded score `0..1` |
| FR-09 | Correlate related findings | Implemented | Same tenant/account/key and 30-minute window; unrelated keys remain separate |
| FR-10 | Manage incident lifecycle | Implemented | Validated transitions, automatic reopen, audit history |
| FR-11 | Display prioritised incidents | Implemented | Dashboard priority queue and API severity/status/text/account filters |
| FR-12 | Display incident evidence | Implemented | Detail response/view includes signals, findings, explanation, actions, audit |
| FR-13 | Explain incidents and recommend responses | Implemented with templates | Four-part template and advisory action catalogue; external AI absent |
| FR-14 | Record audit and evaluation data | Implemented | Lifecycle/system audit records and labelled evaluation metrics |

## Non-functional requirements

| ID | Requirement/target | Status | Implementation/evidence or gap |
|---|---|---|---|
| NFR-01 | Protect tokens, secrets, and evidence | Partial | Optional API key, minimisation, defensive HTTP controls; no tokens stored; TLS/encryption/rotation are operator responsibilities |
| NFR-02 | Collect and retain only necessary data | Implemented for controlled ingestion | Bodies reduced to matched terms, URLs to hosts, attachments/raw messages rejected; automated retention absent |
| NFR-03 | Restrict users to their resources | Partial | Tenant-scoped queries and optional shared key; no authenticated identity binding or roles |
| NFR-04 | 80% of users identify priority/reason/action within 3 minutes | Unverified target | Dashboard supports the tasks; formal usability study remains |
| NFR-05 | Trace severity to evidence and rules | Implemented | Incident detail exposes signals, findings, copied weights/confidence, score, explanation source |
| NFR-06 | No corruption on duplicate processing or temporary failures | Partial | Idempotent source IDs and transactions; template fallback; no live external retry/worker implementation |
| NFR-07 | Up to 500 records visible within 5 minutes | Unverified target | API accepts 500-signal batches; benchmark evidence remains |
| NFR-08 | Modular, separately testable, configuration-driven design | Implemented with limits | Modules and stored rule configuration are separate; new matcher families still require code |
| NFR-09 | Documented one-host container startup and end-to-end scan | Partial | Local API/dashboard runbooks exist; no supported container stack or executing collector |

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

## Remaining evidence gaps

- live Gmail/Workspace consent, capability, collection, expiry, revocation, and
  retry evidence;
- production identity and tenant-isolation penetration tests;
- PostgreSQL deployment and migration evidence;
- worker/scheduler execution and failure recovery;
- 500-record timed benchmark;
- representative labelled dataset and calibration report;
- formal non-specialist usability study;
- automated retention/deletion and backup restoration.

