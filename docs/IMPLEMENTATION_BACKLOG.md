# Implementation Backlog

The controlled-data platform and dashboard are now implemented. This backlog
tracks the remaining gaps between that research prototype and the Chapter 4
target architecture.

## Priority 1: evidence and calibration

- [ ] Add a versioned labelled scenario pack for every supported signal type.
- [ ] Publish repeatable confusion-matrix results and threshold rationale.
- [ ] Run and document the 500-record/five-minute target.
- [ ] Conduct the three-task usability study and accessibility review.
- [ ] Capture reproducible, redacted dashboard evidence for the dissertation.

## Priority 2: platform hardening

- [ ] Add production-grade identity and bind tenant IDs to authenticated claims.
- [ ] Add role-based access control and security tests.
- [x] Add an initial schema migration and PostgreSQL driver/container path.
- [ ] Validate migration, backup, and restore procedures against the target PostgreSQL host.
- [ ] Implement rate limits, structured redacted logs, metrics, and alerts.
- [ ] Implement retention/deletion and backup-restore procedures.
- [x] Supply a supported one-host deployment definition.
- [ ] Exercise the container and PostgreSQL path on a Docker-capable target host.

## Priority 3: live provider integration

- [ ] Register a controlled Google application and finalise minimum scopes.
- [ ] Implement OAuth state validation, callback, encrypted token storage,
  refresh, revocation, and disconnect.
- [ ] Implement Gmail collection for permitted message metadata.
- [ ] Implement Workspace capability detection and permitted admin telemetry.
- [ ] Implement worker/scheduler execution, retry, partial-failure, and
  observability behaviour.

## Priority 4: optional AI explanation

- [ ] Define the redacted structured prompt boundary.
- [ ] Validate model output against the four-part explanation schema.
- [ ] Enforce the approved action catalogue.
- [ ] Test prompt injection, unavailable telemetry, refusal, timeout, and
  malformed output paths.
- [ ] Compare explanation clarity and safety with the implemented templates.

## Out of scope

- endpoint detection or network packet capture;
- malware execution or detonation;
- credential collection or offensive testing;
- autonomous password, mailbox, OAuth, or account changes;
- claims of regulatory certification or complete threat prevention.
