# Architecture Decision Records

## ADR-001: Modular monolith for v1

**Status:** Accepted

**Decision:** Implement ingestion, normalisation, detection, scoring, correlation, API and explanation as explicit modules in one deployable application.

**Rationale:** The project needs clear boundaries and independent tests, but does not yet need the operational complexity of microservices. A modular monolith is easier to run locally, demonstrate, secure and evaluate.

## ADR-002: Deterministic detection before AI

**Status:** Accepted

**Decision:** Rules and heuristics produce findings and scores. AI/template assistance receives structured findings and produces bounded explanations only.

**Rationale:** This preserves explainability, enables reproducible evaluation, reduces privacy exposure and prevents autonomous model output from becoming the security authority.

## ADR-003: Controlled fixtures before live cloud data

**Status:** Accepted

**Decision:** Build and test the vertical slice with versioned synthetic/controlled fixtures before implementing OAuth and live API collection.

**Rationale:** API permissions and account type are project risks. The core product must remain testable when live telemetry is unavailable.

## ADR-004: Bounded personal Gmail samples in the existing process

**Status:** Accepted for a local research trial; real provider validation pending

**Decision:** Add read-only Web OAuth with state/cookie binding, PKCE, encrypted
tokens, refresh, and explicit on-demand inbox samples to FastAPI. Reuse the
normalisation/detection/incident pipeline. Keep React and SQLite, and retain
controlled analysis when Google is unavailable.

**Rationale:** This adds an executable email source without introducing a worker,
broker, scheduler, or new service. Request size, time, and message counts are
bounded. Full bodies remain transient, and trial data expires after seven days.
Email permission cannot supply administrative account posture; the capability
report and dashboard expose that boundary.

## ADR-005: Invited identity before public registration

**Status:** Implemented for a localhost pilot; live Google sign-in pending

**Decision:** Reuse the Google Web client for a separate `openid email` login.
Verify the provider identity, create a stable random private workspace and use
opaque eight-hour app sessions with CSRF protection. Keep Gmail consent
optional and bound to that signed-in user. Retain the controlled local mode.

**Rationale:** Users need a simple entry path without Cloud Console credentials
or caller-selected tenant IDs. An exact invitation list avoids adding public
registration, passwords, mail delivery or organisation roles before there is
a hosted deployment and an identity/operations policy. See `ONBOARDING.md`.

