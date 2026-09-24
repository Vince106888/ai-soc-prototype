# Delivery Roadmap

Status is based on executable repository behaviour, not on diagrams or accepted
design decisions.

| Phase | Outcome | Status |
|---|---|---|
| 0. Inception and control | Scope, threat model, traceability, CI, evidence plan | Complete |
| 1. Deterministic vertical slice | Controlled input through findings, severity, guidance, API | Complete |
| 2. Detection and incident model | Multi-signal rules, persistence, correlation, lifecycle, audit | Core implemented; calibration dataset remains |
| 3. User-facing dashboard | Overview, prioritised list, evidence detail, status actions, coverage | Core implemented; accessibility/usability evidence remains |
| 4. Authorised cloud integration | Least-privilege Gmail/Workspace OAuth and collection | Not started; schemas only |
| 5. Bounded explanation layer | Template first; optional constrained AI | Template complete; external AI intentionally absent |
| 6. Evaluation and dissertation evidence | Metrics, benchmark, usability results, screenshots, appendices | Evaluation API implemented; study evidence remains |
| 7. Defence and release | Reproducible demo, container path, tagged release, archive package | Demo/container implemented; release packaging remains |

## Next release priorities

### 1. Consolidate and prove the controlled platform

- Expand the labelled fixture pack across all five signal types.
- Calibrate weights and the decision threshold without conflating score with
  probability.
- Add the documented 500-record benchmark and preserve reproducible output.
- Complete keyboard/accessibility checks and the three-minute usability study.
- Validate the checked-in migration and backup/restore flow against the target PostgreSQL host.

### 2. Harden identity and operations

- Replace caller-asserted tenant identity with authenticated server-derived
  identity and roles.
- Add rate limiting, structured redacted logging, metrics, and operational
  alerts.
- Implement retention/deletion and backup-restore tests.
- Add TLS/reverse-proxy guidance around the checked-in one-host Compose deployment.

### 3. Add one live provider safely

- Complete Gmail OAuth authorization-code flow with least-privilege scopes.
- Encrypt tokens using keys outside the database; implement refresh,
  revocation, disconnection, and expiry.
- Detect personal Gmail versus Workspace-admin capabilities and show unavailable
  telemetry honestly.
- Run collection in a retryable worker and distinguish failed, partial, and
  clean scans.

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
- The capability screen states that live connectors and AI are unavailable.
- No secret, token, private message, generated database, or temporary artifact
  is present in the repository.

Production launch has a higher gate: identity, target-host migration testing,
encryption, TLS, rate limiting, retention, monitoring, backups, live-connector
safety, and security testing must all be complete.
