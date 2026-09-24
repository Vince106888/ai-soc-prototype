# API Reference

FastAPI publishes the live OpenAPI schema and interactive client at `/docs`.
This document explains the intended workflow and the boundaries that are easy
to miss when reading schemas alone.

## Base URLs and headers

Local API: `http://127.0.0.1:8000`

Platform routes use the `/api/v1` prefix and accept:

| Header | Required | Meaning |
|---|---|---|
| `Content-Type: application/json` | For JSON bodies | Request representation |
| `X-Tenant-ID` | No; default `default` | Prototype resource partition; 1–100 safe identifier characters |
| `X-API-Key` | Only when `AI_SOC_API_KEY` is configured | Shared deployment access key |

The tenant header is not proof of user identity. Put the API behind real
authentication before exposing it to untrusted users.

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
| `GET` | `/api/v1/incidents/{incident_id}` | Evidence, explanation, actions, and audit detail |
| `PATCH` | `/api/v1/incidents/{incident_id}/status` | Apply a valid lifecycle transition |
| `GET` | `/api/v1/rules` | List seeded/current detection rules |
| `GET` | `/api/v1/audit` | List tenant audit records; optional `incident_id` and `limit` |
| `POST` | `/api/v1/evaluation` | Evaluate labelled controlled signals without persistence |

Incident-list query parameters are `severity`, `status`, `search`, `account_id`,
`limit` (1–500), and `offset`.

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
