# Operations Guide

This runbook covers the current local/research deployment. It does not claim
production readiness.

## Runtime layout

![Target one-host deployment and OAuth flow](assets/deployment-oauth.png)

The report diagram shows the target boundary. Today, run these components:

```text
Browser -> Vite dashboard (development) -> FastAPI -> SQLite/PostgreSQL
                                      \-> deterministic processing in-process
```

The personal Gmail adapter executes bounded on-demand inbox collection inside
FastAPI and encrypts consent tokens. Operator credentials and live validation
are required; see [Gmail setup](GMAIL_SETUP.md). Workspace admin collection and external LLM remain absent. An opt-in polling
worker executes bounded schedules; see [scheduling](SCHEDULING.md). Generic jobs
are consumed through explicit controlled ingestion.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `AI_SOC_DATABASE_URL` | `sqlite:///data/sentinelsme.db` | SQLAlchemy database URL |
| `AI_SOC_ALLOWED_HOSTS` | `localhost,127.0.0.1,testserver` | Comma-separated accepted Host headers |
| `AI_SOC_API_KEY` | unset | Shared `X-API-Key` for local data routes; not used in Google mode |
| `AI_SOC_AUTH_MODE` | `local` | `google` enables invited app sessions; invalid values fail closed |
| `AI_SOC_INVITED_EMAILS` | unset | Comma-separated exact Google email invitation list |
| `AI_SOC_GOOGLE_LOGIN_REDIRECT_URI` | Gmail origin + `/api/v1/auth/callback` | Registered localhost app sign-in callback; same origin as Gmail |
| `VITE_API_BASE_URL` | empty | Browser API origin; empty uses Vite proxy/same origin |
| `AI_SOC_GOOGLE_CLIENT_ID` | unset | Local Gmail Web OAuth client ID |
| `AI_SOC_GOOGLE_CLIENT_SECRET` | unset | Server-only OAuth secret; use hidden local input |
| `AI_SOC_GOOGLE_REDIRECT_URI` | `http://127.0.0.1:5173/api/v1/gmail/callback` | Must match the registered localhost callback |
| `AI_SOC_TOKEN_KEY_FILE` | unset | External file containing the Fernet key |
| `AI_SOC_TOKEN_KEY` | unset | Alternative direct key, primarily for isolated tests |

Do not place secrets in committed `.env` files. The dashboard keeps a configured
API key in the browser session only; that still exposes it to anyone who can
inspect that browser session and is not a production authentication design.
Google mode replaces the user-facing shared key and tenant entry with verified
app identity and server-assigned workspaces. It reuses the server Google client
and external encryption key; participants do no Cloud Console setup. See
[operator onboarding](ONBOARDING.md) for callbacks, invitations, startup and
the necessary remote/public release gates. Run both UI and API through exactly
the configured origin, usually `http://127.0.0.1:5173`, rather than switching
between `localhost` and `127.0.0.1`.

## Local startup

API:

```bash
uv sync --dev --frozen
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --no-access-log
```

Dashboard:

```bash
cd frontend
npm ci
npm run dev
```

The dashboard is served at `http://127.0.0.1:5173`; the API and OpenAPI UI are
at `http://127.0.0.1:8000` and `http://127.0.0.1:8000/docs`.

## Health and capability checks

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:8000/health/ready
Invoke-RestMethod http://127.0.0.1:8000/api/v1/capabilities
```

If `AI_SOC_API_KEY` is enabled, pass `-Headers @{ 'X-API-Key' = '...' }` to the
capability call. A healthy process does not prove that an external connector is
available; inspect the capability response before enabling UI paths.

## Database operations

The SQLite default is suitable for a single local demo. Stop the API before
copying the database for backup or moving it between machines. Protect a backup
as sensitive evidence even though message bodies and attachments are excluded.

For PostgreSQL, use a least-privilege application role, TLS, encrypted storage,
private network access, and a separately managed backup policy. The checked-in
Alembic migration owns schema creation; deployment-specific backup and restore
testing is still required.

## Container startup

Copy `.env.example` to `.env`, replace both example secrets, and run:

```bash
docker compose up --build
```

The multi-stage image builds the React console, installs the locked Python
runtime, applies Alembic migrations, and serves the console and API on localhost
port `8000`. Compose starts a separate opt-in scan worker after API readiness. PostgreSQL is private to the Compose network and stores data in the
named `sentinelsme-data` volume.

Local Gmail trial expiry is enforced at startup/platform requests; general production retention remains pending. Plan and document deletion before using
real data; see `PRIVACY_AND_RETENTION.md`.

## Operational states

Scan jobs use `queued`, `running`, `completed`, or `failed`. Controlled ingestion
with a matching job moves it to running and then completed and updates import,
duplicate, and finding counts. With no worker, an unconsumed queued job remains
queued. A failed controlled ingestion marks its matching job `failed`; after
correcting the source or payload, explicitly queue it again with
`POST /api/v1/scan-jobs/{job_id}/retry`.

Sources use `active` or `disconnected`. A disconnected source cannot start a new
job or ingest signals. Re-activating a record changes local eligibility only; it
does not establish a remote provider connection.

## Monitoring and troubleshooting

| Symptom | Check |
|---|---|
| `400` from every request | Host header is absent from `AI_SOC_ALLOWED_HOSTS` |
| `401` under `/api/v1` | `AI_SOC_API_KEY` is set and `X-API-Key` is missing/wrong |
| Resource appears missing | Request uses a different `X-Tenant-ID` |
| `409` creating/ingesting | Duplicate stable identifier, disconnected source, mismatched scan/source, or invalid transition |
| Job stays queued | No worker exists; submit controlled signals with its job ID |
| No incident appears | No enabled rule met the 0.10 finding threshold |
| Repeated signal adds nothing | Same source and external ID is intentionally idempotent |
| No AI prose | Expected; current explanation source is `template` |

Failed external calls must never be represented as a clean scan when live
connectors are added. Bound and sanitise stored error text.

## Isolated local benchmark

Run `uv run python -m app.benchmark --runs 3` from the repository root. It creates
fresh temporary SQLite databases, restores the original database configuration
and emits counts/timings as JSON. It does not populate the running workspace.
See [recorded results](BENCHMARK.md) for the input mix and measurement boundary.
Use the dashboard evidence workspace to inspect retained samples; no-match
records are searchable and do not imply safety.

## Production-readiness gate

Before production live-mail deployment or internet exposure, add and verify:

- real user authentication and server-derived tenant identity;
- role-based authorisation;
- TLS termination, secure proxy headers, and request/rate limits;
- reviewed database migrations and rollback procedure;
- encryption and rotation for provider token material;
- least-privilege OAuth consent, disconnect, expiry, and revocation;
- scheduled-worker ownership, retry policy, and dead-letter handling;
- automated retention/deletion and backup restoration testing;
- metrics, structured redacted logs, alerting, and incident response;
- dependency, secret, and container scanning;
- representative security, load, and usability evidence.

Until then, bind services to localhost or a controlled lab network and use only
synthetic or explicitly authorised data.


## October analyst-console update

See [PRODUCT_SCOPE.md](PRODUCT_SCOPE.md) for the product comparison and necessary
completion milestones. Email normalisation now retains bounded payment phrase
groups and whitelisted supplied authentication observations. `EMAIL-006` requires
both payment-change and payment-action groups (weight 0.50, confidence 0.75).
Findings remain deterministic and traceable; existing signals are not re-scored.
No database migration or new connector scope is required. Shared screenshots and
evaluation exports must use controlled data; unit tests do not establish accuracy.


The Windows Gmail helper applies an access DACL using the .NET ACL API for the
current PowerShell edition, without requiring an audit-policy privilege. Both the
private directory and token-key DACL are protected and restricted to the current
user. Credentials stay in process environment; a local configuration is not proof
of mailbox consent or successful collection. Restart using the existing local
credential file without printing its contents.

## Controlled acceptance and deployment record — 5 October

Native PostgreSQL 17.6 migration, user/scheduled scans, custom-format backup and restore passed on this Windows development computer. The temporary localhost server was stopped afterwards. See `evidence/postgresql-acceptance-2026-10-05.json`. Docker was unavailable, so Compose runtime verification remains pending.

Compose now starts the API/dashboard, database and polling worker. It publishes the API only on `127.0.0.1:8000`. Both app processes load the same protected server environment. Gmail requires the token-key file to be mounted read-only at its container path; the Windows setup file path is not automatically available inside a container. Set Gmail and login callbacks to the actual localhost port/origin and register both with Google. Controlled operation requires no Google variables.

After building/starting the stack, execute `docker compose exec -T api python -m app.demo --tenant container-acceptance`, then `docker compose exec -T api python -m app.worker --once --enable-demo --tenant container-acceptance`. The CI smoke uses `scripts/verify_container.py` to check served dashboard, readiness, actual completed user/scheduled jobs, duplicates and incidents. The database volume remains sensitive; backup/delete using the documented operator policy.

Start a local opt-in worker in the same configured terminal with `uv run python -m app.worker`. A stopped worker means no recurring collection; see `SCHEDULING.md`.
