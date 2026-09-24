# Evaluation Guide

SentinelSME evaluation has three distinct layers. Automated tests prove code
behaviour, labelled scenarios measure detector behaviour, and a user study
measures whether alerts help non-specialists. None substitutes for the others.

## 1. Automated verification

Run the backend checks from the repository root:

```bash
uv sync --dev --frozen
uv run ruff check .
uv run pytest --cov=app --cov-report=term-missing
```

Run dashboard checks from `frontend/`:

```bash
npm install
npm run lint
npm test
npm run build
```

The backend coverage gate is 90%. Tests should cover:

- strict request and signal validation;
- every rule's positive, negative, and boundary cases;
- score and severity boundaries;
- idempotent ingestion;
- related and unrelated correlation scenarios;
- valid and invalid lifecycle transitions;
- automatic reopen on new related evidence;
- tenant isolation and optional API-key enforcement;
- privacy minimisation and redacted failures;
- list filtering, audit records, and template fallback behaviour.

Coverage measures exercised code, not detector quality.

## 2. Labelled detector evaluation

`POST /api/v1/evaluation` accepts up to 1,000 labelled controlled cases and a
decision threshold from `0.10` to `1.00` (default `0.30`). It normalises each
signal, applies the current persisted rule configuration, and returns:

- true positives, false positives, true negatives, and false negatives;
- accuracy;
- precision;
- recall;
- specificity;
- F1 score.

The evaluation endpoint is a dry run: it does not create persistent signals,
findings, or incidents.

Use a versioned, balanced scenario set containing at least:

| Category | Suspicious examples | Benign comparisons |
|---|---|---|
| Email identity | Mismatched reply-to | Legitimate same-domain reply-to |
| Language | Credential pressure and urgency | Routine urgent operational wording |
| Links | Shorteners and credential-themed domains | Normal organisational links |
| Forwarding | Unknown external destination | Approved external workflow |
| Sign-in | New device, impossible travel, high risk | Expected travel/device change |
| MFA | Disabled | Enabled with one or more methods |
| OAuth | Broad/unverified application | Verified least-privilege application |

Record the code revision, rule versions, input-set checksum, threshold, and full
metric result. Do not tune and report performance on the same examples without
clearly labelling the result as training/development evidence.

## 3. End-to-end acceptance evidence

The revised Chapter 4 report defines these platform-level checks:

- a connected controlled source can be activated/disconnected;
- both user and schedule-labelled jobs can be recorded;
- duplicate source records are not re-imported;
- each enabled scenario produces the expected finding and a benign comparison
  does not produce that finding;
- related findings form one incident and unrelated findings stay separate;
- every incident is traceable to at least one signal and rule;
- invalid lifecycle transitions are rejected and accepted transitions audited;
- template guidance is available without external AI;
- the documented development setup completes an end-to-end controlled scan.

Because no collector executes queued jobs, the current end-to-end path requires
an explicit call to the signal-ingestion endpoint after job creation.

## Performance target

The report target is to process up to 500 prepared message records and make the
result visible within five minutes on the development computer. This is a
target, not a published benchmark result. A valid benchmark report must state:

- machine and operating system;
- database engine and state;
- exact input mix and number of findings;
- warm-up and run count;
- elapsed ingestion and dashboard-visible times;
- failures, retries, and duplicate counts.

## Usability target

The report target is for at least 80% of participants to complete all three
tasks within three minutes without assistance:

1. identify the highest-priority incident;
2. explain why the alert was created;
3. locate the recommended next step.

Capture completion, elapsed time, errors, clarification requests, and qualitative
feedback. Use controlled identities and scenarios. Participation, consent, and
data handling must follow the applicable university research requirements.

## Interpretation cautions

- Incident score is a prioritisation value, not an attack probability.
- Rule confidence is configured, not statistically calibrated confidence.
- A small synthetic set cannot establish real-world detection performance.
- A clean scan means only that no configured rule matched the supplied signals.
- API availability and Gmail/Workspace telemetry limits must be reported rather
  than silently treated as negative evidence.
