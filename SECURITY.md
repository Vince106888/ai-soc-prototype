# Security Policy

## Scope

This repository contains a defensive research prototype. Do not submit real credentials, OAuth tokens, private email, malware, or unauthorised third-party data.

## Reporting

Do not disclose sensitive vulnerabilities in public issues. Contact the repository owner privately through the GitHub security contact or repository owner account with reproduction steps, impact and proposed mitigation.

## Development rules

- use controlled fixtures by default;
- never commit secrets or live account data;
- minimise and redact message content;
- treat URLs and email content as untrusted input;
- document security and privacy impact in pull requests.

## Implemented safeguards

The controlled-input API:

- accepts only syntactically valid email addresses and HTTP(S) URLs;
- rejects email-header newlines, embedded URL credentials and unknown fields;
- bounds message fields, URL counts and declared request size;
- never fetches submitted URLs;
- avoids echoing submitted content in validation responses;
- restricts accepted host headers through `AI_SOC_ALLOWED_HOSTS`;
- returns no-store, anti-sniffing, anti-framing and no-referrer headers;
- deduplicates URL hosts before scoring.

The persistent `/api/v1` platform also:

- rejects attachment and raw-message fields;
- minimises email bodies to matched phrases and URLs to hostnames before storage;
- scopes accounts, sources, jobs, signals, incidents and audit entries by tenant;
- supports an optional deployment API key with constant-time comparison;
- rejects invalid incident transitions and audits accepted changes;
- prevents duplicate source records from creating duplicate signals/findings;
- uses local template guidance, so incident data is not sent to an external model.

These controls reduce risk but do not make the prototype production-ready. The
tenant header is caller-supplied and the optional API key is shared; there is no
production identity provider, role model, database field encryption, rate
limiting, OAuth token management, or automated retention. Deploy it only with
controlled data and behind a properly configured reverse proxy. See
`docs/PRIVACY_AND_RETENTION.md` and `docs/OPERATIONS.md`.

