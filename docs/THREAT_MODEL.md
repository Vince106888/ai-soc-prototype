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

