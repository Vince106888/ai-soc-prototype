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

