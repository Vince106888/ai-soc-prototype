# Evaluation Guide

## Current controlled evidence — 5 October 2026

`uv run python -m scripts.evaluate_research --output data/synthetic-evaluation.json`
uses a fresh temporary database, versioned fixture checksums, a rule snapshot
and detector-source checksum. It never opens the operator's private dataset.
The 24 development probes cover positive/benign checks for all twelve rules.
They produced TP=12, TN=12, FP=0, FN=0. The separate 32-case challenge file
includes those same probes as controls plus eight difficult intent-labelled
scenarios: TP=12, TN=12, FP=5, FN=3; accuracy/F1=0.75, precision/specificity=0.7059,
recall=0.8 at threshold 0.30.

These are stipulated synthetic labels authored with knowledge of the rules.
The file named `heldout-v1` is a challenge file, not an independent blind
evaluation or statistically representative held-out dataset. No threshold or
weight tuning was performed. False positives include approved urgency, link
shorteners, routing, new devices and broad grants. Misses include unfamiliar
BEC/phishing wording and a stipulated attachment-only threat with no available
attachment telemetry. Report these limits; do not present the development
probe's perfect score as detection accuracy. [Exact report](evidence/synthetic-evaluation-2026-10-05.json).

The email-only HTTP/dashboard target passed in one controlled run at 113.963
seconds; [benchmark details](BENCHMARK.md). Native PostgreSQL migration, user and
scheduled scans, backup and restore passed; [record](evidence/postgresql-acceptance-2026-10-05.json).
The prepared Compose smoke test still needs execution on a Docker host.
The [usability study protocol](USABILITY_STUDY.md) and anonymous sheet are ready;
participants are unavailable and NFR-04 remains unverified.

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
npm ci
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
- paged signal/incident counts, literal search, no-match evidence, linked
  details, cross-tenant reads/deletion and body/URL minimisation;
- dashboard filter independence and stale response handling on workspace change.

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
- both user and scheduled jobs execute against the controlled fixture;
- duplicate source records are not re-imported;
- each enabled scenario produces the expected finding and a benign comparison
  does not produce that finding;
- related findings form one incident and unrelated findings stay separate;
- every incident is traceable to at least one signal and rule;
- invalid lifecycle transitions are rejected and accepted transitions audited;
- template guidance is available without external AI;
- the documented development setup completes an end-to-end controlled scan.

The dashboard selected-email form performs job creation and ingestion directly.
Personal Gmail collection has mocked acceptance tests for consent/state/PKCE,
account matching, encrypted tokens, refresh, privacy, duplicates, failure and
deletion. The authorised local provider trial below supplements these tests.
Generic queued jobs still require explicit ingestion.

### Authorised local Gmail trial — 4 October 2026

The operator completed Google consent for a Web OAuth client in Testing with
`gmail.readonly`. A localhost dashboard request examined a bounded sample of 20
inbox messages from the last seven days: 20 imported, zero duplicates, two
findings and two medium-severity incidents. A repeat request examined the same
20 messages, importing zero, recognising 20 duplicates and creating zero new
findings. Both original findings matched `EMAIL-001`
(reply-to domain mismatch), with a deterministic score of 0.45 each. Their
normalised authentication evidence contained no failures. No manual malicious
or benign labels have been assigned; these are review indicators.

Read-only inspection of the local database verified the expected account,
encrypted access/refresh token material, consumed consent state, a seven-day
account expiry, and absence of full bodies, HTML, attachments and full URLs in
the stored feature objects. Trial data and the token key were held in a
user-restricted local application-data directory outside the repository and
OneDrive. No message content, addresses, identifiers, tokens or private trial
exports are included in this report.

This is evidence that consent, collection and minimisation execute against the
real provider. It does not establish precision, recall, successful live refresh
or revocation, observed expiry, or the 500-record performance target. The
reply-to rule compares full hostnames and can flag legitimate routing or
subdomain differences. Registered-domain-aware calibration with labelled benign
and malicious cases is still needed; a shared parent domain alone must not
automatically establish trust.

## Performance target

The report target is to process up to 500 prepared message records and make the
result visible within five minutes on the development computer. This is a
target verified in one controlled email-only HTTP-to-dashboard run on 5 October 2026. A valid benchmark report
must state:

- machine and operating system;
- database engine and state;
- exact input mix and number of findings;
- warm-up and run count;
- elapsed ingestion and dashboard-visible times;
- failures, retries, and duplicate counts.

The new [local benchmark](BENCHMARK.md) records three isolated 500-signal runs
with median ingestion 4.572 seconds, 300 findings, 50 incidents and 500
duplicates on repeat. Reproduce with `uv run python -m app.benchmark --runs 3`.
It supplies partial performance evidence: the mix includes all five signal
types and calls services directly. The email-only HTTP-to-dashboard timing
required by NFR-07 was verified on 5 October 2026; see the current record in `BENCHMARK.md`.

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


## October analyst-console update

See [PRODUCT_SCOPE.md](PRODUCT_SCOPE.md) for the product comparison and necessary
completion milestones. Email normalisation now retains bounded payment phrase
groups and whitelisted supplied authentication observations. `EMAIL-006` requires
both payment-change and payment-action groups (weight 0.50, confidence 0.75).
Findings remain deterministic and traceable; existing signals are not re-scored.
No database migration or new connector scope is required. Shared screenshots and
evaluation exports must use controlled data; unit tests do not establish accuracy.

## Invited onboarding validation

The app sign-in implementation adds synthetic Google identity/session tests,
including signature/claims, invite rejection, browser-bound state replay,
CSRF, stable server-assigned workspaces, account switching, sign-out and
cross-user denial. The complete backend suite passed 91 tests at 93.22% coverage
on 4 October 2026. This is implementation evidence; it does not establish live
Google app sign-in, remote deployment or usability-study success. The earlier
real Gmail trial used local-header access and cannot substitute for sign-in
validation. Record participant onboarding time/errors and the first real OIDC
callback after operator setup; see `ONBOARDING.md`.

Shared-client scope compatibility passed a further 36 focused Gmail/auth tests
and one prior-Gmail-grant sign-in test. The final frontend full run passed 43
tests and the production build; an intervening rerun exhausted the local
worker timeout during memory pressure. The session UI also guards against a
late session-check response restoring a signed-out workspace.

## Final regression checkpoint

On 5 October 2026, all 131 backend tests passed at 93.66% application coverage; Ruff lint/format passed. A clean frontend install, security audit with zero reported vulnerabilities, ESLint, all 47 tests and production build passed. These establish implementation behavior, not detection generalisation or participant success. The final template list condenses repeated finding titles without dropping evidence; 29 focused regression tests also passed.
