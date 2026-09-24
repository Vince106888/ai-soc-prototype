# Capability Matrix

This matrix separates executable behaviour from design intent. “Interface
only” means a data model or API shape exists but no component performs the
external work. The runtime `/api/v1/capabilities` response is the machine-readable
companion to this page.

## Current capabilities

| Area | Capability | Status | Evidence or boundary |
|---|---|---|---|
| Input | Controlled account and source registry | Implemented | `/api/v1/accounts` and account source routes |
| Input | Batch ingestion of up to 500 controlled signals | Implemented | `/api/v1/sources/{source_id}/signals` |
| Input | Email, forwarding, sign-in, MFA, OAuth-grant schemas | Implemented | Strict `SignalInput` validation and normalisation |
| Input | Duplicate prevention | Implemented | Unique source/external ID plus signal fingerprint |
| Scanning | User or schedule-labelled scan-job records | Implemented | Scan jobs can be created, listed, and inspected |
| Scanning | Mailbox fetch performed by a worker | Not implemented | Creating a job does not collect or process remote data |
| Scanning | Periodic scheduler process | Not implemented | `schedule` is a supported trigger value only |
| Detection | Eight deterministic email/account rules | Implemented | Seeded rule catalogue and evidence-backed findings |
| Detection | Configurable stored rules | Partial | Stored configuration can be overridden; supported matcher types remain code-defined |
| Scoring | Bounded combined incident score and severity | Implemented | `1 - product(1 - weight)`, score in `0..1` |
| Correlation | Same account/key, 30-minute window | Implemented | Related findings update one incident |
| Lifecycle | Review, resolve, false-positive, reopen | Implemented | Validated transitions and automatic reopen on new evidence |
| Evidence | Persistent signal-to-rule-to-incident chain | Implemented | SQLAlchemy entities and detail API |
| Guidance | Plain-language template explanation | Implemented | Four-part explanation and advisory action catalogue |
| Guidance | External generative-AI explanation | Not implemented | Capability response reports `ai_explanations: false` |
| Response | Human review and lifecycle decisions | Implemented | Dashboard/API status change with audit record |
| Response | Password reset, grant revocation, or mailbox change | Not implemented | Recommendations are advisory only |
| Dashboard | Overview, priority queue, incident detail | Implemented | React/Vite SPA |
| Dashboard | Severity, status, and search filters | Implemented | Incident list controls |
| Dashboard | Account and signal coverage view | Implemented | API-backed coverage screen |
| Dashboard | Scan request form | Interface only | Creates a queued controlled scan job; no collector runs it |
| Evaluation | Labelled-case confusion matrix and metrics | Implemented | `/api/v1/evaluation` |
| Evaluation | Representative calibrated research dataset | Not implemented | Current examples and tests are controlled, not representative |
| Storage | SQLite zero-configuration persistence | Implemented | Default `data/sentinelsme.db` |
| Storage | PostgreSQL-compatible SQLAlchemy URL | Supported, unverified for production | Set `AI_SOC_DATABASE_URL`; no production migration release yet |
| Access | Tenant-scoped platform queries | Implemented prototype control | Caller supplies `X-Tenant-ID`; no identity binding |
| Access | Optional shared API key | Implemented prototype control | `AI_SOC_API_KEY` and `X-API-Key` |
| Cloud | Gmail OAuth 2.0 consent and token exchange | Not implemented | Report design only; no token table or live connector |
| Cloud | Google Workspace admin telemetry | Not implemented | Controlled equivalents can be ingested |
| Operations | One-command container deployment | Not implemented | Run API and dashboard separately |
| Operations | Automated retention/deletion | Not implemented | Operator-managed database lifecycle |

## Input profiles

| Profile | Operational now | Signal coverage | Constraint |
|---|---|---|---|
| Controlled evaluation | Yes | All five supported signal types | Caller must supply synthetic or authorised scenarios |
| Personal Gmail | No | Intended: message metadata, sender, links, labels | Requires OAuth connector and approved scopes |
| Workspace administrator | No | Intended: mailbox, login, forwarding, grants, posture | Requires managed domain, administrator consent, and supported APIs |

## Interpretation rules

- A schema accepting `gmail` or `workspace` identifies the source profile; it
  does not mean live collection exists.
- A queued scan job is an operational record; it is not evidence that a mailbox
  was scanned.
- “AI-assisted” describes the bounded architecture. The current executable
  explanation source is `template`.
- The dashboard is a client of the API. It does not make detection decisions.
