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

## Implemented API safeguards

The current controlled-input API:

- accepts only syntactically valid email addresses and HTTP(S) URLs;
- rejects email-header newlines, embedded URL credentials and unknown fields;
- bounds message fields, URL counts and declared request size;
- never fetches submitted URLs;
- avoids echoing submitted content in validation responses;
- restricts accepted host headers through `AI_SOC_ALLOWED_HOSTS`;
- returns no-store, anti-sniffing, anti-framing and no-referrer headers;
- deduplicates URL hosts before scoring.

These controls reduce risk but do not make the prototype production-ready. The
application does not yet provide authentication, per-user authorisation,
persistent encrypted storage, rate limiting, OAuth token management, or a
complete streaming request-size limit. Deploy it only with controlled data and
behind a properly configured reverse proxy.

