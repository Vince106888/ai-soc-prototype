# Incident alerts

Alerts tell a person that a deterministic incident reached a severity they care
about. They never create findings, change scores or take remediation steps.

## When an alert is raised

`ingest_signals` correlates findings into an incident. After the incident score
and severity are final, `app/alerts.py` raises **one alert per incident per
severity level** when the severity is at or above the workspace minimum
(`medium`, `high` (default) or `critical`). A rescan never duplicates an alert;
an incident that escalates (for example high to critical) raises one more.

The alert row stores the incident title, severity, score and rule codes only. It
never stores message subjects, senders, bodies, URLs or attachments, so it stays
inside the existing persistent data boundary. Alerts are deleted with their
incident (account deletion or retention expiry); workspace alert settings are
deleted with the workspace.

## Channels

| Channel | Behaviour | Configuration |
|---|---|---|
| In-app | Always on. Bell with unread count; feed on the Connections page. | none |
| Webhook | Opt-in per workspace. `POST` of a minimal JSON summary (`event`, `incident_id`, `severity`, `title`, `score`, `rule_codes`, `created_at`). | User-supplied `https` URL |

Email alerts are deliberately not offered: email is the evidence SentinelSME
analyses, so alerting through it would mix the monitored channel with the alert
channel. Webhook URLs must be `https` on the default port, without embedded
credentials, and every resolved address must be public. The delivery request does
not follow redirects and times out after ten seconds. The address is re-checked
at delivery time, but DNS can change between check and connect; this is basic
SSRF hardening, not a network egress policy. Webhooks are not signed, so a
receiver cannot prove who sent a request; do not treat one as an authenticated
command channel.

## Delivery

The worker delivers pending webhook alerts after collection has
committed, so a slow or failing channel never delays ingestion. Each alert gets
up to three delivery passes (one per worker poll); after that the channel is
marked `failed` and an audit record (without the target) is written. In-app
alerts are unaffected by external failures. Worker output stays aggregate-only.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` / `PUT` | `/api/v1/alert-settings` | Read or change minimum severity and webhook. `422` with a safe message for invalid settings. |
| `GET` | `/api/v1/alerts?unread=true&limit=50` | Tenant-scoped alert feed, newest first |
| `POST` | `/api/v1/alerts/read` | Mark all read |
| `POST` | `/api/v1/alerts/{id}/read` | Mark one read; `404` for another tenant's alert |

Migration `a7c9e1d3b5f2` adds `alert_settings` and `alerts`.

## Choosing manual or automatic scanning

In Email analysis > Gmail, each connected mailbox now asks how it should be
scanned. **Manual** (default) scans only when a sample is requested. **Automatic**
reveals the interval, sample size and look-back controls and the separate
recurring-collection consent; nothing is enabled until that consent is ticked.
Switching back to Manual pauses the schedule. Automatic scanning still needs the
worker (`python -m app.worker`, or the Compose `worker` service) to be running;
see [scheduling](SCHEDULING.md).

The laptop Compose deployment runs the worker automatically, so automatic scans and
webhook delivery need no extra process; see [operations](OPERATIONS.md).
