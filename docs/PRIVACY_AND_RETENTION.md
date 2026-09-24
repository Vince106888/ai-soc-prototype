# Privacy and Retention

SentinelSME is designed around data minimisation. Its safe default is controlled
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
- passwords, cookies, access tokens, and refresh tokens;
- automatic account changes or destructive response actions.

Email bodies may be present in an ingestion request long enough to derive the
configured phrase matches. The stored signal contains only `matched_terms`.
URLs are parsed locally and reduced to hostnames; the service never opens them.

## Explanation boundary

The current explanation source is a local deterministic template. No incident
data is sent to an external model. A future AI adapter may receive only a
redacted structure containing incident type, matched rules, score, and selected
evidence. It must exclude message bodies, attachments, tokens, and direct user
identifiers, validate structured output, and fall back safely.

## Access boundary

All `/api/v1` resources are scoped by `X-Tenant-ID`. When `AI_SOC_API_KEY` is
set, a matching `X-API-Key` is also required. These are useful prototype
controls, but they are not sufficient for production:

- the tenant identifier is asserted by the caller rather than derived from an
  authenticated identity;
- the API key is shared rather than user-specific;
- there are no roles, sessions, password controls, or identity-provider claims;
- there is no application-level field encryption in the current store.

Do not expose the API to untrusted networks until real authentication,
authorisation, TLS termination, rate limiting, secret rotation, and security
logging are deployed and tested.

## Retention status

Automated retention and deletion are not implemented. Data remains in the
configured database until the operator removes it. Consequently:

1. Use a disposable database for demonstrations and automated tests.
2. Define an owner and deletion date for every real evaluation dataset.
3. Back up only the minimum evidence required by the research protocol.
4. Protect backups to the same standard as the active database.
5. Record deletion or anonymisation as evaluation evidence.
6. Do not repurpose stored signals for unrelated analysis.

Before a live pilot, implement and test policy-driven deletion for signals,
findings, incidents, explanations, recommendations, scan jobs, and audit data.
Decide separately whether a minimal non-sensitive audit receipt must survive
evidence deletion.

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

Gmail or Workspace integration must not be marked implemented until all of the
following exist:

- least-privilege OAuth scope inventory and consent copy;
- encrypted token storage with keys outside source code and the database;
- revocation/disconnection flow;
- expiry, refresh, retry, and failure handling;
- account-type capability detection;
- retention/deletion implementation;
- tests proving token and tenant isolation;
- updated threat model and operator runbook.
