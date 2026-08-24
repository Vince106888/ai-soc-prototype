# Delivery Roadmap

## Phase 0: Inception and control (current)

**Outcome:** reproducible repository, frozen scope, threat model, requirements traceability, CI, issue tracker and evidence plan.

**Exit gate:** architecture decision record approved; no ambiguous v1 platform or AI claim remains.

## Phase 1: Deterministic vertical slice

**Outcome:** controlled fixture -> normalisation -> rules -> score -> incident -> API/dashboard response.

**Exit gate:** unit and integration tests pass; benign and suspicious scenarios have expected outcomes; no secrets or raw uncontrolled data are required.

## Phase 2: Detection and incident model

**Outcome:** versioned finding taxonomy, URL/email/posture rules, score calibration, correlation windows, incident lifecycle and audit events.

**Exit gate:** labelled scenario pack and confusion-matrix-producing evaluator are available.

## Phase 3: User-facing dashboard

**Outcome:** authenticated prototype dashboard showing severity, evidence, explanation, status and safe next action.

**Exit gate:** keyboard-accessible critical workflow and usability review instrument are complete.

## Phase 4: Authorised cloud integration

**Outcome:** selected Gmail/Workspace adapter with least-privilege OAuth and explicit capability detection.

**Exit gate:** live integration works against a controlled test account, tokens are protected, and unavailable telemetry is surfaced honestly.

## Phase 5: Bounded explanation layer

**Outcome:** template-first explanations, optional controlled AI adapter, structured output validation, prompt-injection tests and review logging.

**Exit gate:** unsafe or unsupported recommendations are rejected; explanation quality is evaluated against approved answers.

## Phase 6: Evaluation and dissertation evidence

**Outcome:** technical metrics, false-positive review, usability results, security checklist, screenshots, logs and appendices.

**Exit gate:** every research objective and requirement has evidence or a documented limitation.

## Phase 7: Defence and release

**Outcome:** reproducible demo, proposal/final presentation, defence answers, tagged release and archive package.

**Exit gate:** clean repository, clean metadata, verified setup instructions, no secrets, no temporary artefacts.

