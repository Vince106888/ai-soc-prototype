# AI-SOC Prototype

[![CI](https://github.com/Vince106888/ai-soc-prototype/actions/workflows/ci.yml/badge.svg)](https://github.com/Vince106888/ai-soc-prototype/actions/workflows/ci.yml)

A defensive research prototype that analyses controlled email data, identifies
transparent phishing indicators, and returns evidence-backed risk guidance.
It is intended for small organisations that use cloud email but do not have a
dedicated security analyst.

> **Implementation status:** this repository currently contains a hardened,
> deterministic email-analysis API. Persistence, incident correlation, the web
> dashboard, OAuth ingestion, and optional AI explanations remain roadmap work.

## What works today

- `POST /analyze` accepts one controlled email fixture.
- Strict schemas reject malformed email addresses, non-HTTP(S) URLs, embedded
  URL credentials, unknown fields, and excessive field/list sizes.
- Four deterministic rules produce human-readable evidence.
- Duplicate URL hosts cannot inflate a message's risk score.
- Scores are capped at 100 and mapped to documented severity bands.
- Response guidance comes from static approved text; no model makes security
  decisions and no submitted URL is fetched.
- Validation errors do not echo submitted message content.
- Request-size, trusted-host, no-cache, anti-sniffing, framing, and referrer
  protections are enabled.
- Unit and API tests run with coverage and lint checks in CI.

## Analysis flow

```text
Controlled JSON fixture
        |
        v
Strict MessageInput validation
        |
        v
Email rules + local URL parsing (no network requests)
        |
        v
Evidence-backed findings
        |
        v
Additive score -> severity -> approved guidance
        |
        v
Structured AnalysisResult JSON
```

## Detection rules

| Rule | Indicator | Weight |
|---|---|---:|
| `EMAIL-001` | Sender and reply-to domains differ | 25 |
| `EMAIL-002` | Urgent or credential-seeking language | 20 |
| `URL-001` | A known URL-shortening hostname is used | 20 |
| `URL-002` | A hostname contains a credential-themed label | 25 |

Severity bands are `low` (0–24), `medium` (25–54), `high` (55–79), and
`critical` (80–100). These heuristics and provisional weights require
calibration against the planned labelled evaluation set.

## Requirements

- Python 3.13
- [uv](https://docs.astral.sh/uv/)

Do not use real credentials, tokens, private email, or unauthorised third-party
data. The included fixture is synthetic.

## Quick start

```bash
git clone https://github.com/Vince106888/ai-soc-prototype.git
cd ai-soc-prototype
uv sync --dev --frozen
uv run uvicorn app.main:app --reload
```

Open [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) for the interactive
OpenAPI interface, or submit the supplied fixture from PowerShell:

```powershell
$body = Get-Content -Raw fixtures/suspicious_email.json
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/analyze `
  -ContentType application/json `
  -Body $body
```

Expected result: score `90`, severity `critical`, and findings `EMAIL-001`,
`EMAIL-002`, `URL-001`, and `URL-002`.

## API contract

### `GET /health`

Returns a minimal process-health response:

```json
{"status": "ok"}
```

### `POST /analyze`

Example request:

```json
{
  "sender": "Support <support@example.com>",
  "display_name": "Account Support",
  "reply_to": "recovery@unknown.test",
  "subject": "Urgent: verify your account",
  "body": "Your account is suspended. Click here immediately.",
  "urls": [
    "https://bit.ly/example",
    "https://secure-account.test/login"
  ]
}
```

Invalid requests return a stable error envelope without copying the submitted
body into the response:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request did not match the documented message schema.",
    "details": [
      {
        "location": "body.sender",
        "message": "Value error, must contain a valid email address",
        "type": "value_error"
      }
    ]
  }
}
```

## Configuration

The API accepts requests for `localhost`, `127.0.0.1`, and FastAPI's test host by
default. Set a comma-separated allow-list before deployment:

```powershell
$env:AI_SOC_ALLOWED_HOSTS = "soc.example.org,localhost,127.0.0.1"
```

The current maximum declared request size is 1,000,000 bytes. Individual model
fields have stricter limits, including a 100,000-character body and at most 50
URLs.

## Development checks

```bash
uv sync --dev --frozen
uv run ruff check .
uv run pytest --cov=app --cov-report=term-missing
```

CI runs the same lint and coverage-gated test commands on Python 3.13. When
dependencies intentionally change, run `uv lock` and commit the updated lockfile.

## Repository map

```text
.github/       issue templates, Dependabot, and CI
app/           FastAPI endpoints, schemas, and detection logic
docs/          architecture, threat model, roadmap, and research traceability
fixtures/      controlled synthetic demonstration inputs
tests/         unit and API integration tests
pyproject.toml package metadata and tool configuration
uv.lock        reproducible dependency resolution
```

Read [docs/CODEBASE_GUIDE.md](docs/CODEBASE_GUIDE.md) for a detailed walkthrough.

## Scope and limitations

This prototype is not a complete SOC, SIEM, malware sandbox, or autonomous
response system. A triggered rule is an indicator for human review, not proof of
malice. The current service has no user accounts, persistent storage, live cloud
connection, background monitoring, or incident lifecycle.

For planned work, see [docs/ROADMAP.md](docs/ROADMAP.md),
[docs/IMPLEMENTATION_BACKLOG.md](docs/IMPLEMENTATION_BACKLOG.md), and the
[GitHub issue tracker](https://github.com/Vince106888/ai-soc-prototype/issues).
Security and safe-data requirements are documented in [SECURITY.md](SECURITY.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
Changes should reference an issue, include normal and failure-path tests, and
record any security, privacy, or research-evidence impact.
