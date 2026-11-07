# Public deployment and release runbook

The public package supports Google self-registration into one private workspace
per user. It runs independently of the local demonstration stack. Domain,
provider, DNS and live Google credentials have not yet been selected; the local
TLS acceptance stack uses synthetic credentials and a private CA.

## Prepare a server

Use a maintained Linux VPS with Docker Engine and Compose v2, persistent SSD
storage, SSH access and outbound HTTPS. Start with 2 vCPU / 4 GB RAM for the
rule-based product; optional CPU model inference needs additional RAM and CPU.
Size from measured workload before accepting many users. Allow inbound TCP
80/443 and restrict SSH to operator access. Never expose PostgreSQL, the API,
the gateway or Ollama directly. Configure host security updates, monitoring and
disk alerts through the chosen provider.

Point a DNS hostname to the server. Register a Google Web OAuth client with
`https://YOUR_HOST/api/v1/auth/callback`; download the updated client JSON to
private operator storage. Configure Google's public consent/branding and
publish the actual privacy/terms URLs and support contact. Test with an account
outside the development team before announcing availability.

## Initialize and start

From this checkout on the server, with Python 3 available:

```bash
python scripts/production.py init --origin https://YOUR_HOST --google-client-file /private/google-web-client.json --contact operator@example.com
python scripts/production.py validate
python scripts/production.py up
python scripts/production.py status
```

Initialization creates `~/.config/lindabiz/production/` and refuses to
overwrite it. Keep this directory private. It contains the environment file,
separate database administrator/application secrets, provider secret and token
encryption key. Preserve these independently of database backups. Do not commit
them or put them in shared/synchronised directories. Windows ACLs must protect
the parent directory when preparing credentials on Windows.

Only Caddy publishes ports. It obtains HTTPS certificates for the chosen domain;
Nginx bounds requests and rate limits, while the application enforces persistent
per-user budgets. API and worker run as UID 10001 with read-only roots and no
Linux capabilities. The database application role cannot create databases,
create roles or act as superuser. No development API key or tenant header grants
public access. Startup fails when required production settings are invalid.

Gmail is disabled by default. Google sign-in is independent of mailbox access.
Do not enable `AI_SOC_GMAIL_ENABLED=true` until the deployed app meets Google's
restricted Gmail-scope verification requirements. Register the separate
`https://YOUR_HOST/api/v1/gmail/callback` before enabling it. Selected-email
analysis remains available without Gmail. No public Gmail approval is implied
by passing local tests.

Optional local AI: set `AI_SOC_EXPLAINER=ollama` in the private deployment file,
then run `up`. This builds the pinned CPU-only Ollama release and downloads
`qwen2.5:3b`. Inference uses a separate leased worker, not the collection loop
or HTTP request. The bounded queue accepts two pending requests per workspace
and eight globally. Rule-based explanations remain immediately available.
The model has no public listening port and receives redacted structured findings.

## Backups, deletion and recovery

```bash
python scripts/production.py backup
python scripts/production.py verify-backup --archive /private/path/to/archive.dump
```

The backup directory defaults to the private deployment directory's `backups/`.
Verification checks its SHA-256 sidecar, restores into a new random database as
the application role, checks schema/counts and drops only that temporary target.
It never overwrites the running database. Only restore trusted archives.

Schedule the backup command daily using the server's systemd timer or provider
scheduler. Copy encrypted backups off the server using the selected provider's
private storage. Define and test retention, encryption, alerts and restore-time
targets before public launch; an offsite destination is not configured here.
Keep at most the retention period you disclose to users. Database dumps contain
private indicators and encrypted provider credentials.

Account deletion writes a durable opaque workspace receipt to the separate
`public-deletion-ledger` volume before deleting database records and revoking all
sessions. Preserve and replicate the current ledger independently of database
backup rotation. **A recovery is unsafe without the current deletion ledger.**
The API replays receipts before becoming ready, preventing an older backup from
resurrecting deleted accounts. Receipts contain only opaque workspace IDs,
not email addresses, Google subjects or content. Retain receipts as long as any
recoverable backup can contain those workspaces.

For disaster recovery, stop API, worker and model workers and keep the edge
closed. Preserve the current database volume; restore a verified archive into a
fresh deployment/database, with the matching encryption key and current deletion
ledger. Start the API, allow migration and deletion reconciliation, validate
counts/isolation, then start workers and reopen traffic. Never restore over live
writes. Losing the token encryption key requires new provider consent.

Before an upgrade: create and verify a backup, record the current image digest,
retain its source/lockfiles, and build the new release. Start the new API to run
migrations, then workers, and check readiness and sign-in. A database migration
may make an older image incompatible: rollback uses the preserved database
and matching image in isolation, with the current deletion ledger replayed.

## Acceptance and lecturer handover

Run the normal Python/frontend checks from AGENTS.md. For a controlled public
TLS check, initialize a separate `--test-local` deployment with a `.test` hostname
on port 8443 and a synthetic Google client JSON. It binds only loopback.

```bash
python -m scripts.verify_public --directory /private/public-acceptance
```

The check verifies its private CA and hostname without changing OS trust. It
checks the dashboard, readiness, headers, redirects, public sign-up settings and
rejection of forged unauthenticated workspace headers. Signed synthetic Google
identities test registration, CSRF, tenant isolation, rate limits and deletion
in the automated suite; these do not replace live Google acceptance.

Before sending a lecturer the final link: verify the public certificate, sign up
with a new Google account, analyse an authorised selected message, trace each
indicator and review decision, verify another account cannot see the case, sign
out and sign back in, and test deletion using a disposable account. Show the
coverage limits and distinguish deterministic findings from optional AI wording.
Keep a controlled sample ready for presentation, clearly labelled as synthetic.
Lecturers should need the URL and their Google account, not terminal commands,
workspace IDs, deployment keys or installed software.

Evidence: `docs/evidence/public-deployment-acceptance-2026-10-28.json` records the
controlled TLS result. It does not establish live DNS, ACME, public Google
approval, representative detection accuracy, or an offsite recovery test.
