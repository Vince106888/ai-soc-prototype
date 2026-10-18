# Initial Threat Model

## Assets

- OAuth access and refresh tokens;
- email metadata and selected message content;
- account and posture indicators;
- findings, incidents and audit records;
- dashboard credentials and session state;
- evaluation data and screenshots.

## Trust boundaries

1. Cloud provider -> ingestion adapter.
2. Browser -> application API.
3. Application -> database.
4. Application -> optional external AI provider.
5. Uploaded email/URL content -> detection and explanation components.

## Threats and controls

| Threat | Impact | Initial control |
|---|---|---|
| Over-broad OAuth scopes | Privacy breach | Least privilege, scope review, revocation |
| Token leakage in logs or repository | Account compromise | Secret management, redaction, push protection |
| Malicious email prompt injection | Unsafe explanation | Treat content as data, bounded prompts, output validation |
| Malicious URL in dashboard | User compromise | Escape/defang display, never auto-open links |
| Cross-user data exposure | Confidentiality loss | Authorisation checks and tenant-aware identifiers |
| False positive | Alert fatigue | Benign test set, confidence, review and tuning |
| False negative | Missed threat | Explicit limitations, layered rules, scenario coverage |
| API outage/rate limit | Availability loss | Retries, backoff, capability status, fixture fallback |
| Sensitive data retention | Privacy harm | Minimisation, hashes/redaction, deletion policy |
| AI hallucinated action | Unsafe response | Approved action catalogue and human review |

## Abuse cases to test

- An attacker places instructions in an email asking the explanation model to ignore policy.
- A user submits a URL that contains script-like or deceptive content.
- A token is accidentally included in an exception or debug log.
- Two users access the same incident identifier.
- A benign newsletter triggers several phishing indicators.


## Local personal Gmail adapter

OAuth state is random, hashed, browser-cookie/tenant/account bound, single-use
and limited to ten minutes. PKCE binds code exchange; the provider profile must
match the requested email. Tokens are Fernet-encrypted with an external key.
The setup command disables access logging to exclude callback codes.
SQL parameters are hidden in database error logging.

Only fixed Google endpoints are called and redirects refused. Read-only scope
does not permit sending, deletion, quarantine or modification. Attachments are
ignored and message URLs never fetched. Provider failures use safe fixed text
and import no partial sample. Personal Gmail provides email indicators only;
MFA/login/forwarding/grant posture is not inferred.

The callback supports localhost only. Production identity, TLS, rate limits,
protected evidence storage/backups and Google verification remain requirements
before public deployment. Seven-day expiry purges when the process next runs;
provider grants require separate revocation.

## Invited app sign-in

Identity-only Google OIDC login validates the signed token against fixed Google
keys, issuer, audience, expiry, verified email and a per-attempt nonce. State,
browser binding and PKCE prevent login substitution/replay. Exact invitations
are checked before user creation and on every session request. Random workspaces
are bound to Google subjects; matching email never imports local-header data.
App session/CSRF hashes, HttpOnly cookies and mutation-origin checks protect
the browser/API boundary. Gmail callbacks also require the initiating signed-in
workspace, preventing completion after switching accounts.

Synthetic tests cover forged/expired claims, invite denial, replay, CSRF,
cross-user resource IDs, sign-out and removed invitations. Public TLS/Secure
cookies, rate limiting, identity deletion and independent target-host isolation
testing remain release requirements. Local mode retains its explicitly weaker
header boundary and must not be exposed as authenticated access.
