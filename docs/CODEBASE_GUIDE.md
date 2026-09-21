# Codebase Guide

This guide describes what each folder does and how a request moves through the
current AI-SOC prototype. The implemented application is a small deterministic
vertical slice; several components in the architecture documents are planned
but do not exist yet.

## Repository layout

```text
ai-soc-prototype/
|-- .github/                 GitHub automation and contribution templates
|   |-- ISSUE_TEMPLATE/      Structured bug and feature request forms
|   `-- workflows/ci.yml     Runs lint and coverage-gated tests on Python 3.13
|-- app/                     Executable FastAPI application
|   |-- __init__.py          Marks app as an importable Python package
|   |-- main.py              Creates the API and declares HTTP endpoints
|   |-- models.py            Defines request, finding, and response schemas
|   `-- detection.py         Runs rules, scoring, and response guidance
|-- docs/                    Scope, architecture, security, and delivery plans
|-- fixtures/                Controlled synthetic inputs used for demonstrations
|-- tests/                   Automated tests for implemented behaviour
|-- pyproject.toml           Python package, dependencies, and tool configuration
|-- uv.lock                  Exact resolved dependency versions for reproducibility
|-- requirements.txt         Pinned dependencies for non-uv installations
|-- README.md                Quick setup and usage instructions
|-- CONTRIBUTING.md          Rules for branches, tests, and pull requests
`-- SECURITY.md              Safe-data and vulnerability-reporting policy
```

## Application code

### `app/main.py`

This is the HTTP boundary. It creates the FastAPI application and currently
exposes two endpoints:

- `GET /health` returns `{ "status": "ok" }` to show that the process is alive.
- `POST /analyze` accepts a `MessageInput`, calls `analyze_message`, and returns
  an `AnalysisResult`.

FastAPI automatically exposes interactive API documentation at `/docs`. The API
also enforces an allowed-host list, rejects oversized declared requests, returns
redacted validation errors, and adds defensive response headers.

### `app/models.py`

This module defines the data passed between components:

- `MessageInput` contains the sender, reply-to address, subject, body, and URLs.
- `Finding` records the triggered rule, human-readable evidence, and score weight.
- `AnalysisResult` contains the final score, severity, findings, explanation, and
  recommended actions.

The models reject undocumented fields, malformed mailbox syntax, header
newlines, non-HTTP(S) URLs, URL credentials, excessive message content, and more
than 50 URLs. This validation is structural; it does not contact mail servers or
visit URLs.

These are early contracts. They do not yet include source IDs, timestamps,
confidence, urgency, incident IDs, or schema versions.

### `app/detection.py`

`analyze_message` implements the complete current analysis pipeline:

1. Extract sender and reply-to domains.
2. Add `EMAIL-001` if those domains differ.
3. Search the subject and body for configured urgency or credential phrases and
   add `EMAIL-002` when at least one is found.
4. Parse each supplied URL without opening it and deduplicate its hostname.
5. Add `URL-001` for known URL shorteners.
6. Add `URL-002` for credential-themed hostname labels.
7. Add finding weights, cap the score at 100, and map it to a severity.
8. Return static safe guidance based on whether any findings exist.

The current severity thresholds are:

| Score | Severity |
|---:|---|
| 0-24 | Low |
| 25-54 | Medium |
| 55-79 | High |
| 80-100 | Critical |

The rules are heuristics, not proof that an email is malicious. The weights and
thresholds still require calibration against a labelled scenario set.

## Example request flow

```text
fixtures/suspicious_email.json
        |
        v
POST /analyze
        |
        v
MessageInput validation
        |
        v
analyze_message()
        |
        +--> email rules
        +--> URL rules
        +--> additive scoring
        +--> severity mapping
        `--> static guidance
        |
        v
AnalysisResult JSON response
```

The supplied suspicious fixture triggers four findings with a total score of
90 and therefore receives `critical` severity.

## Tests and fixtures

`fixtures/suspicious_email.json` is synthetic and safe to keep in source
control. It provides a repeatable demonstration input without using private
email or OAuth credentials.

`tests/test_detection.py` covers benign and suspicious messages, exact reference
findings, address/URL validation, URL deduplication, shortener matching, phrase
boundaries, and every severity boundary.

`tests/test_api.py` covers both public endpoints, defensive response headers,
the stable redacted validation-error envelope, request-size rejection, and host
header rejection. Coverage is measured in CI and must remain at or above 90%.

The test suite does not yet cover correlation, persistence, authentication,
live cloud integration, or false-positive metrics because those components have
not been implemented.

## Planned but not implemented

The architecture and roadmap also describe the following future components:

- versioned ingestion and normalisation;
- persistent findings, incidents, and audit events;
- correlation and incident lifecycle states;
- authenticated browser dashboard;
- controlled Gmail/Google Workspace integration;
- separate confidence and urgency calculations;
- bounded template/AI explanation service;
- labelled evaluation scenarios and metric generation;
- retention, deletion, and privacy enforcement.

See `IMPLEMENTATION_BACKLOG.md` and the GitHub issues for the intended delivery
order. Documentation diagrams should therefore be read as target architecture,
not as evidence that every component already exists.
