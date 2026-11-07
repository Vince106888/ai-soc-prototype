# Scheduled scans and controlled fallback

Schedules are opt-in; deploying a worker never enables any Gmail schedule.
The API and worker must use the same database, provider settings, invitation
list and token key. In the terminal configured by `configure-gmail.ps1`, run:

```powershell
uv run python -m app.worker
```

The worker polls every 30 seconds, handles at most ten due sources per pass,
and uses an atomic ten-minute lease per source. A crashed worker's lease expires;
the next worker marks the abandoned job failed and starts a fresh scheduled job.
Source/external identifiers make repeated imports idempotent. This is one small
polling worker, not a distributed task broker or real-time mail gateway.

Each mailbox first asks for a scan mode: Manual (default) or Automatic. Choosing
Automatic reveals the controls and consent below; Manual pauses any schedule.

In Email analysis > Gmail, expand Scheduled samples for the connected source.
Separately acknowledge recurring collection and choose an interval of 15–1,440
minutes, 1–50 messages per run and a look-back of 1–30 days. The first run is
eligible after the chosen interval. Pause works without granting new consent.
The displayed next time is eligibility, not proof that a worker is healthy.
Job history shows actual execution and safe failure status.

Failed executions retry as new jobs after 30 and 60 minutes. A third consecutive
failure pauses the schedule (no fourth automatic attempt). An operator can
review the cause and explicitly re-enable it. HTTP requests retain the Gmail
adapter's bounded timeouts/sample budget; the worker never logs exception bodies.
Re-collection after failure is bounded, rather than retaining raw messages or
resuming from persisted body/attachment buffers.

Disconnect pauses future runs; deleting/expiring the account removes its
schedule, tokens and evidence. An already-started provider request may finish,
but ingestion checks the active source before committing. In invited Google
mode, withdrawing an account's invitation also stops scheduled Gmail collection.
Schedules may run after browser sign-out because they were separately authorised;
the explicit pause/disconnect/deletion controls revoke that recurring choice.

## No-Google acceptance demo

Only the built-in controlled fixture can be scheduled without Gmail. This mode
is an explicit operator CLI choice, not a public arbitrary-file ingestion API:

```powershell
uv run python -m app.demo --tenant demo
uv run python -m app.worker --once --enable-demo --tenant demo
```

The demo command executes a user scan; the worker executes a scheduled scan
immediately and recognises the same fixture IDs as duplicates. Omitting `--once`
keeps the worker polling. `--enable-demo` never enables Gmail. All five signal
types remain demonstrable without Google or AI services.

## HTTP contract

`GET /api/v1/sources/{id}/schedule` returns null if no schedule exists.
`PUT` takes `enabled`, `acknowledged`, `interval_minutes`, `maximum_messages`
and `recent_days`. Both routes use the source's tenant/session boundary. Public
updates accept Gmail only; inactive/unacknowledged enablement is rejected.
The response contains settings, next eligibility, consecutive failure count,
last job reference and update time. Lease IDs remain internal.

Migration `9d213bf807a2` adds `scan_schedules`. Each row is keyed to its source,
scoped by tenant and references its last scan job. Schedules contain no mailbox
bodies, attachments, passwords or provider token material. Audit records capture
enable/pause and job queue/completion/failure; incident guidance refreshes are
audited separately. Account deletion removes these operational references too.

Compose starts API/dashboard, PostgreSQL and the worker on one host. Only the
API's localhost port is published. Use the same protected server environment
for API and worker; see [operations](OPERATIONS.md).
