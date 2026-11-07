# API Reference

## 5 October completion additions

Tenant/session-scoped `GET` and `PUT /api/v1/sources/{source_id}/schedule` expose
opt-in bounded schedules; see [the exact contract](SCHEDULING.md). Scheduling is
off by default. Creating a generic job alone still does not ingest data.

`GET /api/v1/incidents/page` accepts inclusive `seen_from` and `seen_to` ISO-8601
timestamps, filtering each incident's latest evidence time. Naive timestamps
are interpreted as UTC; offset timestamps compare actual instants. An inverted
range returns 422. Counts and pagination use the same tenant/time predicates.
The console labels date inputs as local time and submits converted UTC instants.
Incident details display explicit UTC time and correlation key/window.

Scan queue/completion/failure and template/advisory refresh create audit events.
Notes remain limited to 500 characters in both API and console. Evaluation
ignores matches below the 0.10 persistent-finding floor, matching ingestion
eligibility. Existing stored evidence is never re-scored.

FastAPI publishes the live OpenAPI schema and interactive client at `/docs`.
This document explains the intended workflow and the boundaries that are easy
to miss when reading schemas alone.

## Base URLs and headers

Local API: `http://127.0.0.1:8000`

Platform routes use the `/api/v1` prefix. In default local mode they accept:

| Header | Required | Meaning |
|---|---|---|
| `Content-Type: application/json` | For JSON bodies | Request representation |
| `X-Tenant-ID` | No; default `default` | Prototype resource partition; 1–100 safe identifier characters |
| `X-API-Key` | Only when `AI_SOC_API_KEY` is configured | Shared deployment access key |

The local tenant header is not proof of user identity. With
`AI_SOC_AUTH_MODE=google`, data routes require the HttpOnly app session cookie
and derive the tenant from the user record; headers cannot select another
workspace. Mutations require `X-CSRF-Token` from the same-origin session
endpoint and reject an unexpected Origin. An expired or uninvited session
returns `401`, a missing/invalid CSRF value returns `403`, and invalid sign-in
configuration fails closed. This mode is a localhost invited pilot; see
[onboarding](ONBOARDING.md) before remote deployment.

### Sign-in

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/auth/session` | Public safe mode/setup summary; authenticated identity, workspace, CSRF value and expiry if a valid session exists |
| `POST` | `/api/v1/auth/login` | Begin identity-only Google login; browser-bound ten-minute cookie and PKCE |
| `GET` | `/api/v1/auth/callback` | Consume login attempt and redirect with a fixed success/cancel/failure marker; tokens never reflected |
| `POST` | `/api/v1/auth/logout` | Authenticated CSRF-protected session invalidation; does not revoke Gmail or delete evidence |

These entry endpoints do not use the local deployment key. Login uses
`openid email`; Gmail consent is separate and, in Google mode, restricted to
the signed-in email/workspace. Incident lifecycle audit actors are derived from
the authenticated user ID, overriding client-supplied actor text. `/health`,
OpenAPI and stateless legacy `/analyze` remain public loopback compatibility
routes; `/analyze` cannot retrieve persistent data.

## Endpoint inventory

### General and compatibility

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` or `/health/live` | Process liveness |
| `GET` | `/health/ready` | API and database readiness |
| `POST` | `/analyze` | Stateless legacy single-email analysis |
| `GET` | `/api/v1/capabilities` | Machine-readable runtime boundary |

### Accounts and sources

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/accounts` | Create a controlled account record |
| `GET` | `/api/v1/accounts` | List tenant accounts |
| `GET` | `/api/v1/accounts/{account_id}` | Get one tenant account |
| `POST` | `/api/v1/accounts/{account_id}/sources` | Register a source |
| `GET` | `/api/v1/accounts/{account_id}/sources` | List account sources |
| `GET` | `/api/v1/sources` | List sources, optionally by `account_id` |
| `PATCH` | `/api/v1/sources/{source_id}` | Set source status to `active` or `disconnected` |

### Assistant

`POST /api/v1/assistant` returns a grounded explanation for a question about an incident or
about LindaBiz; see [the assistant](ASSISTANT.md).

### Alerts

`GET`/`PUT /api/v1/alert-settings`, `GET /api/v1/alerts` and the `read` actions are
tenant/session scoped; see [alerts](ALERTS.md).

### Scan and ingestion

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/scan-jobs` | Create a `user` or `schedule`-labelled job |
| `GET` | `/api/v1/scan-jobs` | List jobs, optionally by `source_id` |
| `GET` | `/api/v1/scan-jobs/{job_id}` | Inspect one job |
| `POST` | `/api/v1/scan-jobs/{job_id}/retry` | Requeue one failed job after its source is active |
| `POST` | `/api/v1/scans` | Dashboard convenience route that creates/reuses a controlled source and queues a job |
| `GET` | `/api/v1/scans/{job_id}` | Dashboard-compatible job lookup |
| `POST` | `/api/v1/sources/{source_id}/signals` | Ingest, detect, and correlate a controlled batch |

A scan job does not fetch mail. When a batch references a queued job, ingestion
moves it through `running` to `completed` and updates its counts. Failed jobs
record a redacted error and require the explicit retry endpoint before another
ingestion attempt; completed jobs cannot be reused.

### Incidents, rules, audit, and evaluation

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/incidents` | Prioritised incident list |
| `GET` | `/api/v1/incidents/page` | Prioritised page with filtered total/count and optional open-only queue |
| `GET` | `/api/v1/incidents/{incident_id}` | Evidence, explanation, actions, and audit detail |
| `PATCH` | `/api/v1/incidents/{incident_id}/status` | Apply a valid lifecycle transition |
| `GET` | `/api/v1/rules` | List seeded/current detection rules |
| `GET` | `/api/v1/audit` | List tenant audit records; optional `incident_id` and `limit` |
| `POST` | `/api/v1/evaluation` | Evaluate labelled controlled signals without persistence |

Incident-list query parameters are `severity`, `status`, `search`, `account_id`,
`limit` (1–500), and `offset`.

The paged variant returns `{items, total, limit, offset}` and accepts the same
filters with `limit` 1–100 (default 25), nonnegative `offset`, and
`open_only=true` for `new`/`under_review` incidents. Search is a literal
case-insensitive substring of title/summary (maximum 200 characters); `%` and
`_` do not act as wildcards. Results use priority, recency and ID ordering.

### Retained evidence

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/signals` | Tenant-scoped page of retained signals, including no-match records |
| `GET` | `/api/v1/signals/{signal_id}` | Stored normalised observations, findings and linked incident summaries |

Signal-page filters: `account_id`, `source_id`, `signal_type`, `has_findings`,
literal `search` over sender/subject (maximum 200 characters), `limit` 1–100
(default 25), and nonnegative `offset`. The response is
`{items, total, limit, offset}`. List items contain account/source identifiers,
type, timestamps, sender/subject, finding count and linked incident IDs.
Detail returns existing minimised features and copied finding evidence;
reading does not re-score historical data. No full body or attachment is added.
An absent or other-tenant detail ID returns `404`. Filters cannot widen tenant
scope. Lists are ordered by local receipt time then ID, newest first.

## Controlled end-to-end example

The examples use PowerShell and the default tenant.

### Create an account

```powershell
$account = Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/api/v1/accounts `
  -ContentType application/json `
  -Body (@{
    email = 'owner@example.test'
    display_name = 'Example Owner'
    provider = 'controlled'
    profile = 'controlled'
  } | ConvertTo-Json)
```

### Register a controlled source

```powershell
$source = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/v1/accounts/$($account.id)/sources" `
  -ContentType application/json `
  -Body (@{
    source_type = 'controlled'
    name = 'README demonstration'
    external_id = 'readme-demo-v1'
    capabilities = @('email', 'forwarding', 'signin', 'mfa', 'oauth_grant')
  } | ConvertTo-Json)
```

### Create a scan record

```powershell
$job = Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8000/api/v1/scan-jobs `
  -ContentType application/json `
  -Body (@{ source_id = $source.id; trigger = 'user' } | ConvertTo-Json)
```

### Ingest a suspicious email signal

```powershell
$payload = @{
  scan_job_id = $job.id
  signals = @(
    @{
      external_id = 'message-001'
      signal_type = 'email'
      occurred_at = '2026-09-24T08:00:00Z'
      correlation_key = 'domain:unknown.test'
      features = @{
        sender = 'Support <support@example.test>'
        reply_to = 'recovery@unknown.test'
        subject = 'Urgent: verify your account'
        body = 'Your account is suspended. Click here immediately.'
        labels = @('INBOX')
        urls = @('https://bit.ly/example', 'https://secure-account.test/login')
      }
    }
  )
} | ConvertTo-Json -Depth 8

$result = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8000/api/v1/sources/$($source.id)/signals" `
  -ContentType application/json `
  -Body $payload
```

The body is used only to derive matched phrases; it is not stored. Repeating
`message-001` against the same source returns it as a duplicate rather than
creating new evidence.

### Review and transition the incident

```powershell
$incidents = Invoke-RestMethod http://127.0.0.1:8000/api/v1/incidents
$incident = Invoke-RestMethod "http://127.0.0.1:8000/api/v1/incidents/$($incidents[0].id)"

Invoke-RestMethod `
  -Method Patch `
  -Uri "http://127.0.0.1:8000/api/v1/incidents/$($incident.id)/status" `
  -ContentType application/json `
  -Body (@{
    status = 'under_review'
    actor = 'demo-analyst'
    note = 'Verified the activity against the controlled scenario.'
  } | ConvertTo-Json)
```

## Evaluation request

```json
{
  "threshold": 0.3,
  "cases": [
    {
      "case_id": "phish-001",
      "expected_suspicious": true,
      "signal": {
        "external_id": "evaluation-only-001",
        "signal_type": "email",
        "features": {
          "sender": "Support <support@example.test>",
          "reply_to": "recovery@unknown.test",
          "subject": "Urgent: verify your account",
          "body": "Click here immediately.",
          "urls": ["https://bit.ly/example"]
        }
      }
    }
  ]
}
```

Evaluation normalises and scores cases but does not create signals or incidents.

## Errors and safety limits

| Status | Typical meaning |
|---:|---|
| `400` | Invalid host or tenant header |
| `401` | Missing/incorrect API key when configured |
| `404` | Resource absent from the current tenant |
| `409` | Duplicate record, disconnected source, mismatched job/source, or invalid lifecycle transition |
| `413` | Body exceeds 1,000,000 bytes |
| `422` | Request does not match the strict schema |

Validation errors identify locations but do not copy submitted message content.
Responses carry `Cache-Control: no-store`, `Referrer-Policy: no-referrer`,
`X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY`.

## Dashboard and Gmail additions

The tenant-scoped GET /api/v1/overview route returns workspace incident totals,
source signal counts/latest receipt times, and seven-day retained activity.
Filters on the incident list do not change these totals.

DELETE /api/v1/accounts/{account_id} permanently deletes the local account chain:
sources, tokens, signals, findings, incidents, guidance, jobs and related audit
details. It does not delete Gmail messages or guarantee provider revocation.

| Method | Route | Contract |
|---|---|---|
| GET | /api/v1/gmail/configuration | Safe readiness/limits; no secret values |
| POST | /api/v1/gmail/consent | email and acknowledged=true; Google URL plus HttpOnly browser cookie |
| GET | /api/v1/gmail/callback | Public single-use state/cookie-bound callback; fixed redirect result |
| POST | /api/v1/gmail/scan | source_id, maximum_messages (1–50; default 20), recent_days (1–30; default 7), acknowledged=true |
| POST | /api/v1/gmail/sources/{source_id}/disconnect | Revoke consent remotely when possible; always remove local tokens and report outcome |

Scan results contain status/job ID, examined/imported/duplicate/finding counts,
incident IDs and sample_limited=true. The sample is collected before ingestion;
a provider failure records a failed job with no partial imported batch.
Generic source creation accepts controlled sources; Gmail sources require OAuth.
Generic source status changes cannot replace provider connect/disconnect.
Manual signal ingestion accepts controlled sources only, preserving Gmail
provenance. Gmail collection enforces a 2 MB response limit and a 120-second
budget between requests; unfinished batches are not imported.
The selected-email dashboard form performs existing job and ingestion calls.
See [Gmail setup](GMAIL_SETUP.md).


## October analyst-console update

See [PRODUCT_SCOPE.md](PRODUCT_SCOPE.md) for the product comparison and necessary
completion milestones. Email normalisation now retains bounded payment phrase
groups and whitelisted supplied authentication observations. `EMAIL-006` requires
both payment-change and payment-action groups (weight 0.50, confidence 0.75).
Findings remain deterministic and traceable; existing signals are not re-scored.
No database migration or new connector scope is required. Shared screenshots and
evaluation exports must use controlled data; unit tests do not establish accuracy.


## 17 October additions

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/trusted-senders` | List the workspace's trusted addresses and domains |
| `POST` | `/api/v1/trusted-senders` | Add `{kind: "address"|"domain", value, note}`; idempotent; 422 for invalid values or shared-provider domains |
| `DELETE` | `/api/v1/trusted-senders/{id}` | Remove one entry; 404 outside the tenant |
| `POST` | `/api/v1/accounts/{id}/posture-check` | Self-reported `{mfa, forwarding, forwarding_domain, apps[]}`; "unsure" answers are skipped; returns submitted/skipped and the ingestion result |

`PATCH /api/v1/incidents/{id}/status` accepts `trust_sender: "none"|"address"|"domain"`
only with `status: "false_positive"`; the entry is validated before the status
changes and applies to new evidence only. Incident explanations add `reasons[]`
(`rule_code`, `indicator`, `why`, `legitimate_if`), `warning_signs`,
`warning_level` (`few`/`some`/`many`) and `warning_note`; older stored
explanations return empty defaults.

## Public identity and asynchronous explanations

Production requires a server-side Google app session. Tenant headers and shared
API keys grant no public access. Public registration assigns a private workspace.
Unsafe requests require the session CSRF token and the exact configured Origin.
Per-user read/write/collection/explanation budgets return 429 with Retry-After.
DELETE /api/v1/auth/account accepts only {"confirmation":"DELETE"}; it revokes
all sessions and removes the workspace. The durable deletion ledger is replayed
before readiness after a database restore.

Production POST /api/v1/incidents/{id}/explanation returns 202 with an
explanation_job status (queued/running/succeeded/failed). Poll incident detail;
rule guidance remains available immediately. Jobs are bounded and leased, keyed
to a template revision; stale model responses are discarded. The isolated model
worker does not collect telemetry or change scoring. Development retains the
synchronous explanation contract.

Sign-in callback failures include an allow-listed `reason` alongside `signin=failed`; the response and operational log contain no provider payload or credential material. See ONBOARDING.md for codes and recovery.
