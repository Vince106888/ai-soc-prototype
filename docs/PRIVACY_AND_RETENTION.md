# Privacy and Retention

Alerts store incident title, severity, score and rule codes only and are deleted with the
incident; webhook alerts send the same minimal summary, never message content
(see [alerts](ALERTS.md)).

Scheduled collection requires separate acknowledgement, defaults to disabled
and keeps the same minimal evidence boundary. Worker/API must share the protected
token key. Sign-out leaves a separately authorised schedule in effect; pause,
disconnect, invitation withdrawal and account deletion stop future collection.
Deletion/expiry also removes schedule/job audit references. An in-flight read may
finish, but ingestion requires the source still to be active. See [scheduling](SCHEDULING.md).

LindaBiz is designed around data minimisation. Its safe default is controlled
synthetic data, not live mail. A deployment must have an explicit lawful basis,
user or administrator authorisation, and a documented retention period before
processing real organisational data.

## Data boundary

### Accepted for controlled analysis

- mailbox addresses, display names, subject lines, labels, and timestamps;
- link hostnames;
- forwarding target and approval flags;
- sign-in location/risk flags and bounded source IP text;
- MFA enabled status and method count;
- OAuth application identity, verification/breadth flags, and broad scope
  categories;
- operator-supplied account/source metadata and lifecycle notes.

### Persisted

- normalised features needed by enabled rules;
- stable source/external identifiers and fingerprints for idempotency;
- rule matches, evidence, weights, confidence, and incident scores;
- template explanations, advisory recommendations, and audit history;
- scan status, counts, bounded errors, and timestamps.

### Rejected or deliberately absent

- attachments and attachment content;
- raw email messages;
- complete message bodies in persistent ingestion;
- URL page content or results from visiting submitted links;
- passwords and arbitrary submitted credentials; Gmail tokens enter through OAuth only and are stored encrypted;
- automatic account changes or destructive response actions.

Email bodies may be present in an ingestion request long enough to derive the
configured phrase matches. The stored signal contains `matched_terms`, `payment_change_terms` and `payment_action_terms`; bank account numbers and the full body are excluded. Known supplied authentication results are whitelisted as observations.
URLs are parsed locally and reduced to hostnames; the service never opens them.

The evidence workspace exposes these existing minimised fields, including
no-match signals, through tenant-scoped paged reads. Search uses only retained
sender/subject metadata. Detail links existing findings and incidents without
creating a second mailbox archive or re-scoring old inputs. These fields can
still be private; use controlled examples for shared screenshots. Other-tenant
detail identifiers return `404` and cross-tenant filters cannot reveal records.

## Explanation boundary

The current explanation source is a local deterministic template. No incident
data is sent to an external model. A future AI adapter may receive only a
redacted structure containing incident type, matched rules, score, and selected
evidence. It must exclude message bodies, attachments, tokens, and direct user
identifiers, validate structured output, and fall back safely.

## Access boundary

In default local mode, data routes use caller-supplied `X-Tenant-ID` and an
optional shared `X-API-Key`; these provide no authenticated user isolation.
Opt-in Google mode derives the workspace from a verified identity and opaque
server session, checks invitations on every request and requires CSRF for
mutations. Login uses `openid email`, separate from optional Gmail consent.
Google subject and verified email are persisted as app identity; login access
and ID tokens are discarded. Session and CSRF secrets are stored as hashes;
temporary login verifier/nonce and Gmail tokens are encrypted. App cookies are
HttpOnly/SameSite=Lax on loopback and must become Secure for an HTTPS release.

Identity records outlive seven-day mailbox evidence unless removed by the
operator. Sign-out invalidates its session but does not delete identity,
evidence, other sessions or the Google grant. Expired login/session rows are
cleaned at startup/new login. General identity/backup retention, self-service
identity deletion, organisation roles and public hosting remain pending; see
[onboarding](ONBOARDING.md). Normalised evidence and backups need separate
storage protection.

Do not expose the API to untrusted networks until real authentication,
authorisation, TLS termination, rate limiting, secret rotation, and security
logging are deployed and tested.

## Retention status

Personal Gmail trial accounts expire seven days after first connection. The
complete local account chain and tokens are purged at startup and before API
requests; no timer runs while the app is stopped. Reconnect does not extend the
expiry. Selected data on the same account is included. Manual account deletion
is available. Disconnect first for Google revocation; local deletion/expiry does
not revoke the provider grant. General non-trial retention remains operator-managed. Consequently:

1. Use a disposable database for demonstrations and automated tests.
2. Define an owner and deletion date for every real evaluation dataset.
3. Back up only the minimum evidence required by the research protocol.
4. Protect backups to the same standard as the active database.
5. Record deletion or anonymisation as evaluation evidence.
6. Do not repurpose stored signals for unrelated analysis.

The local seven-day trial deletes signals, findings, incidents, explanations,
recommendations, jobs, consent, and related audit data, preserving an anonymous
receipt. A broader organisational pilot still needs configurable retention,
backup deletion/restoration, and operational policy tests.

## Logging and screenshots

- Never log request bodies, token values, secrets, or raw provider responses.
- Keep operational errors bounded and review them for leaked identifiers.
- Use controlled accounts in demonstrations.
- Redact addresses, identifiers, link hosts, notes, and browser chrome before
  publishing screenshots.
- Do not use manually redacted screenshots as the only evaluation evidence;
  retain reproducible controlled scenarios.

## Incident response for data exposure

If sensitive material is committed or logged, stop using the affected secret,
revoke or rotate it at the provider, restrict access to the exposed artifact,
preserve only the minimum evidence needed to investigate, and follow the
private reporting process in `SECURITY.md`. Removing a value from Git history
does not revoke it.

## Live-integration gate

The personal Gmail adapter implements the following controls with mocked provider
tests. An authorised local consent/scan trial on 4 October 2026 verified token
encryption, seven-day expiry metadata and normalised storage without full bodies
or attachments; see `EVALUATION.md`. Live expiry/revocation observations and
public deployment hardening remain pending:

- least-privilege OAuth scope inventory and consent copy;
- encrypted token storage with keys outside source code and the database;
- revocation/disconnection flow;
- expiry, refresh, retry, and failure handling;
- account-type capability detection;
- retention/deletion implementation;
- tests proving token and tenant isolation;
- updated threat model and operator runbook.

Personal Gmail requests read-only mail permission; the scope grants broad read
access while the adapter limits requests to a triggered inbox sample. Custom
labels are dropped, HTML is not rendered, bodies are reduced to matched phrases,
URLs to hosts, and no external AI sees content. Seven-day account expiry also
removes local consent. The evidence database and backups are not encrypted by
the token cipher; protect storage separately.

The analyst-console update retains only catalogue-matched payment-change/action
phrases and whitelisted supplied SPF/DKIM/DMARC outcomes. Unrecognised authentication
values, full text, payment-account numbers and arbitrary text are not copied into
these features. Supplied header outcomes are observations, not independent sender
verification. Trusted-domain input is explicitly declared, bounded and normalised;
it does not establish a trustworthy sender or expand the Gmail permission scope.


## Trusted senders, sender history and posture answers

Sender history stores no readable address: only an account-salted SHA-256
digest, a first-seen time and a count, removed with the account and its trial
expiry. Trusted-sender entries are deliberate user configuration; audit records
reference them by ID, not by address. Posture self-check answers become ordinary
minimised signals (MFA flag, forwarding domain, app name and two flags) under a
source named "self-reported"; nothing is read from the provider.

## Public deployment contract

Production uses configured evidence retention (30 days by default), measured
from case creation. Expiry deletes whole cases so retained scores never silently
change. Connections and encrypted provider consent remain until disconnected or
deleted. Sender-history retention bounds first-contact knowledge; it does not
establish that a sender has never contacted the user historically.

Users can delete their app identity and complete private workspace; all sessions
are revoked. Durable deletion receipts contain only opaque workspace IDs and
are replayed before a restored database becomes ready. Backups are private and
may retain older evidence until operator expiry; preserve the current deletion
ledger independently and never serve a restore without it. Account deletion
does not claim to revoke Google grants; disconnect first or use Google settings.
Public /privacy and /terms explain the actual product boundary and operator contact.
