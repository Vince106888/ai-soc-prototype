# Proposal Defence Presentation Audit

## Guidance alignment

The university guidance allocates approximately ten minutes as follows:

| Required area | Expected time | Deck coverage |
|---|---:|---|
| Introduction / project concept | 1.5 min | Slides 1–3 |
| Literature review | 1.5 min | Slides 5–6 |
| Design and analysis | 3 min | Slides 7–10 |
| Implementation | 2 min | Slides 9, 11–13 |
| Evaluation and limitations | 2 min | Slides 14–15 |

The upgraded deck contains 15 slides and is designed for roughly 10 minutes. It includes the required project concept, literature gap, technical design/data flow, system architecture, implementation plan, evaluation strategy and limitations.

## Main improvements made

1. The deck now states explicitly that the project is a browser-accessible web application.
2. It distinguishes the backend analysis service, dashboard, storage, integration adapter and explanation layer.
3. It adds a dedicated slide showing the six-stage analysis algorithm.
4. It states that detection and scoring are deterministic while AI is bounded explanation support.
5. It replaces ambiguous technology alternatives with a proposal-stage implementation plan aligned with the repository.
6. It identifies the first vertical slice: controlled message -> indicators -> score -> incident -> dashboard alert.
7. It keeps the proposal honest about API restrictions, controlled data and the absence of a native mobile app.
8. It ties requirements to acceptance evidence and final evaluation.

## Slide review

### Slide 1 — Title

Clear proposal-defence framing, project identity and university context. The subtitle prevents the audience from assuming an enterprise SOC replacement.

### Slide 2 — Problem context

Uses three practical concepts: digital dependence, operational visibility gap and human consequence. It avoids unsupported numerical claims while establishing the rationale.

### Slide 3 — Problem and response

The data-flow diagram gives the panel a system-level mental model early. The scope boundary is stated on the slide rather than hidden in the report.

### Slide 4 — Aim, objectives and scope

Connects the general objective to five specific objectives and visibly separates in-scope, out-of-scope and primary-user decisions.

### Slide 5 — Research questions and value

Presents the proposal as an academic investigation rather than only a software build. The contribution is deliberately framed as integration and explainability, not a claim of inventing phishing detection.

### Slide 6 — Literature

Uses existing solutions to construct a fit/integration/usability gap. The presenter should say that existing tools are valuable but solve different problems.

### Slide 7 — Algorithm

This is the key technical upgrade. It shows validation, normalisation, detection, scoring, correlation and explanation, then gives an evidence-backed example and clarifies the AI boundary.

### Slide 8 — Conceptual framework

Connects input, processing, output and feedback. Explain that false-positive review and user feedback refine both rules and alert wording.

### Slide 9 — Architecture

Shows the modular-monolith interpretation of the layered design. Explain why this is more appropriate for a student prototype than premature microservices.

### Slide 10 — Trust boundaries

Connects consent, untrusted input, protected storage and AI safety. This is a strong cybersecurity defence slide.

### Slide 11 — Security controls

Demonstrates that the monitoring tool itself is secured. Avoid claiming compliance certification; present the controls as prototype requirements.

### Slide 12 — Methodology

Maps Agile sprints to tangible deliverables and evaluation evidence. This makes the project executable rather than aspirational.

### Slide 13 — Implementation

Answers “what are you building?” directly: a web application with FastAPI, browser dashboard, prototype storage, controlled fixtures and optional cloud integration. It explicitly says no native mobile app in v1.

### Slide 14 — Evaluation

Separates detection, integration, correlation, performance, usability and security evidence. The presenter must explain the labelled ground-truth scenario set.

### Slide 15 — Limitations and close

Ends with honest constraints and a bounded impact statement. This is preferable to claiming complete protection.

## Presentation risks to avoid

- Do not call the prototype a complete SOC.
- Do not claim full real-time coverage unless implemented.
- Do not imply that AI makes the security decision.
- Do not claim Gmail and Google Workspace expose identical telemetry.
- Do not present provisional score weights as validated results.
- Do not describe controlled fixture results as real-world detection performance.
- Do not add unsupported statistics during the oral defence.

