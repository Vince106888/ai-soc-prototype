# Delivery Roadmap

Status is based on executable repository behaviour, not on diagrams or accepted
design decisions.

| Phase | Outcome | Status |
|---|---|---|
| 0. Inception and control | Scope, threat model, traceability, CI, evidence plan | Complete |
| 1. Deterministic vertical slice | Controlled input through findings, severity, guidance, API | Complete |
| 2. Detection and incident model | Multi-signal rules, persistence, correlation, lifecycle, audit | Core implemented; calibration dataset remains |
| 3. User-facing dashboard | Overview, prioritised list, evidence detail, status actions, coverage | Core implemented; accessibility/usability evidence remains |
| 4. Authorised cloud integration | Least-privilege Gmail/Workspace OAuth and collection | Personal Gmail adapter/mocked tests complete; authorised local consent/sample and repeat scan validated; live refresh/expiry/revocation and Workspace admin remain; opt-in worker implemented |
| 5. Bounded explanation layer | Template first; optional constrained AI | Template complete; external AI intentionally absent |
| 6. Evaluation and dissertation evidence | Metrics, benchmark, usability results, screenshots, appendices | Evaluation API implemented; study evidence remains |
| 7. Defence and release | Reproducible demo, container path, tagged release, archive package | Demo/container implemented; release packaging remains |

## Next release priorities

### 1. Consolidate and prove the controlled platform

- Expand the labelled fixture pack across all five signal types.
- Calibrate weights and the decision threshold without conflating score with
  probability.
- Repeat/extend the verified email-only API-to-dashboard run (113.963 seconds for 500 records); see [benchmark](BENCHMARK.md).
- Complete keyboard/accessibility checks and the three-minute usability study.
- Native PostgreSQL migration/controlled scan/worker/restore passed on this development host; execute the prepared Compose smoke on a Docker host.

### 2. Harden identity and operations

- Validate the implemented invited Google sign-in with the real provider;
  server-derived workspace/session/CSRF paths have synthetic coverage. Add
  roles only for shared organisational workspaces.
- Complete HTTPS public-origin/cookie configuration, Google production setup,
  identity lifecycle and hosted isolation checks before remote registration;
  see [onboarding](ONBOARDING.md).
- Add rate limiting, structured redacted logging, metrics, and operational
  alerts.
- Extend implemented local trial deletion to configurable general retention and
  verify backup/restore/deletion policy.
- Add TLS/reverse-proxy guidance around the checked-in one-host Compose deployment.

### 3. Add one live provider safely

- Reproduce the successful authorised local Gmail consent/sample trial on other
  installations; per-installation Google setup remains required.
- Review the implemented encrypted tokens, refresh, disconnect/revocation and trial expiry during a real provider trial.
- Detect personal Gmail versus Workspace-admin capabilities and show unavailable
  telemetry honestly.
- Opt-in bounded collection now runs in a leased retryable worker; extend observability and live-provider outage testing for operational use.

### 4. Consider external AI only after the safety gate

Template explanations already make the platform usable without an external
model. An AI adapter is optional and must remain downstream of deterministic
detection. Before enabling it, add redaction, structured-output validation,
prompt-injection tests, approved-action enforcement, audit records, and a
measured comparison against templates.

## Definition of launch-ready for a controlled demonstration

- Backend and dashboard install from clean checkouts using documented commands.
- All lint, test, build, and coverage gates pass.
- A versioned scenario creates traceable findings and a correlated incident.
- The user can identify priority/evidence/action and complete a valid lifecycle
  transition.
- The capability screen reports actual connector configuration and telemetry
  limits; current external AI is unavailable and Gmail supports validated local
  on-demand samples only.
- No secret, token, private message, generated database, or temporary artifact
  is present in the repository.

Production launch has a higher gate: identity, target-host migration testing,
encryption, TLS, rate limiting, retention, monitoring, backups, live-connector
safety, and security testing must all be complete.

## 5 October completion checkpoint

The small worker/scheduler, immutable validated rule extension, email-only HTTP/dashboard benchmark and native PostgreSQL scan/restore are complete. The synthetic challenge report documents five false positives and three misses. Container runtime smoke and participant study remain pending; do not mark dissertation evaluation complete without those results or explicit supervisor-approved limitations. See `COMPLETION_REVIEW.md`.
