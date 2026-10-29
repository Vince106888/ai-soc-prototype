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
| Scanning | Bounded Gmail fetch performed by a worker | Implemented; mocked worker/provider contract | Opt-in recurring sample; no real-time interception; `app/worker.py`, `SCHEDULING.md` |
| Scanning | Periodic scheduler process | Implemented and controlled execution verified | Atomic lease, bounded retry/backoff, pause after three failures; controlled CLI fallback |
| Detection | Fourteen deterministic email/account rules | Implemented | Seeded rule catalogue and evidence-backed findings |
| Detection | Workspace trusted senders (address or domain) | Implemented | `/api/v1/trusted-senders`, false-positive "trust this sender"; silences content-only rules for authenticated senders, never authentication/lookalike/brand/payment rules; new evidence only |
| Detection | Lookalike checks against trusted domains | Implemented | Trusted domains become `claimed_domains`, so `EMAIL-003` works for Gmail samples |
| Detection | First-contact sender history | Implemented | Account-salted SHA-256 sender digests; earliest-time logic; `EMAIL-007` only with a payment-change phrase |
| Detection | Kenya-localised indicators | Implemented with limits | Safaricom/M-PESA, KRA, eCitizen, Equity, KCB, Co-op brand domains; paybill/till changes in `EMAIL-006`; `EMAIL-008` wording. Synthetic tests only; real-world accuracy unknown |
| Input | Self-reported posture check (MFA, forwarding, app access) | Implemented | `/api/v1/accounts/{id}/posture-check`; labelled self-reported source; "not sure" answers skipped; not provider telemetry |
| Detection | Payment-change plus payment-instruction indicator | Implemented | `EMAIL-006`; bounded phrase evidence, normal/boundary/privacy/isolation tests; BEC accuracy unknown |
| Detection | Validated stored-rule extension | Implemented with limits | Operator-only `app.rule_config` import; approved minimised fields, immutable existing codes; new matcher families require code |
| Scoring | Bounded combined incident score and severity | Implemented | `1 - product(1 - weight)`, score in `0..1` |
| Correlation | Same account/key, 30-minute window | Implemented | Related findings update one incident |
| Lifecycle | Review, resolve, false-positive, reopen | Implemented | Validated transitions and automatic reopen on new evidence |
| Evidence | Persistent signal-to-rule-to-incident chain | Implemented | SQLAlchemy entities and detail API |
| Evidence | Searchable retained signals including no-match records | Implemented | Tenant-scoped `/signals` page/detail; stored features only, no re-scoring |
| Guidance | Plain-language template explanation | Implemented | Four-part explanation, per-indicator reasons with a "could be legitimate if" counterfactual, warning-sign count, advisory action catalogue |
| Guidance | Local-model explanation (Ollama, loopback only) | Implemented; off by default; synthetic laptop check passed | 28 October: 4/4 valid outputs, repeat median 27.62 s, max 47.17 s, no fallbacks; generated local report `data/explainer-check-2026-10-28.json`; not detection-accuracy evidence |
| Response | Human review and lifecycle decisions | Implemented | Dashboard/API status change with audit record |
| Response | Password reset, grant revocation, or mailbox change | Not implemented | Recommendations are advisory only |
| Dashboard | Overview, priority queue, incident detail | Implemented | React/Vite SPA |
| Dashboard | Severity, status, and search filters | Implemented | Incident list controls |
| Dashboard | Server pagination and account/result/type filters | Implemented | Counted incident/evidence pages; open priority queue independent of list filters |
| Dashboard | Read-only detection catalogue | Implemented | API-backed rule codes, versions, configuration, weights and confidence |
| Dashboard | Incident tabs and product coverage map | Implemented | Keyboard-accessible Overview/Evidence/Activity; explicit sample/controlled/absent capabilities, see `PRODUCT_SCOPE.md` |
| Dashboard | Account and signal coverage view | Implemented | API-backed coverage screen |
| Dashboard | Controlled account/source setup and source lifecycle | Implemented | Creates minimized source metadata and activates/disconnects sources through the tenant-scoped API |
| Dashboard | Selected-email analysis and history | Implemented | Selected-email form executes existing jobs/ingestion; indicators, no-match, failure and duplicates shown |
| Evaluation | Labelled-case confusion matrix and metrics | Implemented | `/api/v1/evaluation` |
| Evaluation | Representative calibrated research dataset | Not implemented | Current examples and tests are controlled, not representative |
| Evaluation | Isolated 500-signal local service benchmark | Implemented and measured | Three fresh SQLite runs; median 4.572 s; HTTP/dashboard/Gmail/concurrency excluded; see `BENCHMARK.md` |
| Storage | SQLite zero-configuration persistence | Implemented | Default `data/sentinelsme.db` |
| Storage | PostgreSQL and versioned migrations | Implemented and container-tested | Private URL configuration; production secret files and separate restricted app role; isolated backup restoration passed |
| Access | Tenant-scoped platform queries | Implemented | Google mode derives workspace from a verified server session; local mode uses caller-supplied `X-Tenant-ID` |
| Access | Optional shared API key | Local prototype control | `AI_SOC_API_KEY` and `X-API-Key` in local mode only |
| Access | Google sign-in and app sessions | Implemented; live public sign-in pending | Separate `openid email`, public or invited policy, eight-hour opaque Secure cookies in production, exact-Origin CSRF and private workspaces |
| Dashboard | Guided entry and account sign-out | Implemented | Google welcome screen, automatic workspace, prefilled Gmail account, local-demo alternative; see `ONBOARDING.md` |
| Access | Public Google registration and private workspaces | Implemented; controlled identity/TLS tests passed | Public self-registration; server-derived tenant; live Google client/domain acceptance remains required; shared organisation roles are outside scope |
| Cloud | Personal Gmail OAuth and bounded collection | Implemented; local consent/sample validated | Read-only scope, single-use browser-bound state/PKCE, encrypted tokens; refresh/disconnect covered by mocked tests; per-installation credentials required |
| Cloud | Google Workspace admin telemetry | Not implemented | Controlled equivalents can be ingested |
| Operations | API/dashboard/worker/PostgreSQL Compose deployment | Private runtime and controlled public TLS acceptance passed | Standalone public Caddy/Nginx stack; restricted app DB role; real ingestion/isolation/privacy/lifecycle/deletion and non-empty isolated restore; final live VPS/domain acceptance pending |
| Operations | Retention and deletion | Implemented and tested | Seven-day development trial; configurable production evidence retention (default 30 days), full workspace deletion/session revocation, independent durable deletion receipts replayed before restored API readiness |

## Input profiles

| Profile | Operational now | Signal coverage | Constraint |
|---|---|---|---|
| Controlled evaluation | Yes | All five supported signal types | Caller must supply synthetic or authorised scenarios |
| Personal Gmail | Authorised local consent/sample succeeded on 4 October 2026 | Bounded read-only inbox samples, email only | Own Google client and consent required; trial is integration evidence, not accuracy validation |
| Workspace administrator | No | Intended: mailbox, login, forwarding, grants, posture | Requires managed domain, administrator consent, and supported APIs |

## Interpretation rules

- A schema accepting `gmail` or `workspace` identifies the source profile; it
  does not establish that a connector is configured or validated. Gmail has an
  executable adapter; Workspace administrator collection remains absent.
- A queued scan job is an operational record; it is not evidence that a mailbox
  was scanned.
- Templates remain the default; explicitly enabled loopback Ollama may rewrite
  structured findings. Any invalid output or model outage preserves templates.
- The dashboard is a client of the API. It does not make detection decisions.

Dashboard additions: tenant-scoped workspace totals independent of filters,
seven-day retained activity, observed signals, copied weight/confidence, processed
source counts, Gmail consent/sample scan controls, and local deletion. The opt-in
scheduler/worker added on 5 October executes recurring bounded samples; generic
queued jobs still require explicit ingestion.

Public deployment procedures and remaining live release gates are in [PUBLIC_DEPLOYMENT.md](PUBLIC_DEPLOYMENT.md). Production AI requests are queued against a template revision in a separate leased worker; slow inference does not block collection or HTTP.
