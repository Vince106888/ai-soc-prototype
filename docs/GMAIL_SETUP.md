# Local Gmail trial

The project now implements a read-only personal Gmail connector in the existing
FastAPI process. You supply your own Google Web OAuth client and approve Google
consent. There is no scheduled worker, message delivery policy, or remediation.

For invited app users, configure the separate identity-only sign-in callback
once using [ONBOARDING.md](ONBOARDING.md). Participants sign in and connect their
own Gmail without handling deployment credentials. The default local mode
continues to use caller-selected workspace partitions.

## Configure your existing Google project

1. Enable **Gmail API** in your Google Cloud project.
2. Configure the OAuth consent screen. For an External app in Testing, add your
   Gmail address as a test user. Gmail permissions are restricted scopes;
   Google verification is needed before a public rollout. Testing refresh tokens
   can expire after seven days.
3. Use a **Web application** OAuth client. Add this exact authorised redirect URI:
   `http://127.0.0.1:5173/api/v1/gmail/callback`.
4. Request only `https://www.googleapis.com/auth/gmail.readonly`. This scope lets
   the app read mail, not send, delete, quarantine, or modify it. Google does not
   offer a per-message OAuth permission; this app limits its requests to the
   inbox sample you explicitly trigger.

Official references: [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
and [Web OAuth consent](https://developers.google.com/identity/protocols/oauth2/web-server).

## Enter credentials privately

In a PowerShell terminal at the repository root, run:

```powershell
. .\scripts\configure-gmail.ps1 -StartApi
```

If you downloaded the Web client JSON, you can load it directly without typing
the secret. Keep the file outside the project and substitute its actual path:

```powershell
. .\scripts\configure-gmail.ps1 -CredentialsFile "$env:USERPROFILE\Downloads\your-client.json" -StartApi
```

The file is parsed locally, validated as a Web client with the matching callback,
and its values passed only to the API environment. They are never printed.
`-Background` with `-StartApi` starts a hidden API process with access logging
disabled and operational logs in the protected local trial directory. Without
`-Background`, keep the foreground terminal open. Retain downloaded credentials
privately or remove them yourself after arranging a secure way to restart.

Without `-CredentialsFile`, the script asks for your OAuth client ID and reads
the client secret with hidden input. In either mode, the secret is passed through
the configuring process's environment to the child API process. The script
generates an encryption key outside the repository under
`%LOCALAPPDATA%\LindaBiz\token.key`, restricted to your Windows user. Do not
share the key or secret. Keep the key for as long as encrypted consent exists;
replacing it requires reconnecting Gmail.
It also selects `%LOCALAPPDATA%\LindaBiz\trial.db` for the real-mail trial,
outside the project and its OneDrive folder. The existing controlled demo
database stays separate. The trial workspace starts empty on first use. The
directory's Windows permissions are restricted to your user; the database
itself is not encrypted by the token key.
The `-StartApi` option replaces the API listening on port 8000 only if it is
this project's virtual-environment Uvicorn process, then starts the configured
API. It refuses to stop an unrelated application. For foreground mode, keep
the terminal open; Ctrl+C stops the API. Omit `-StartApi` to configure only.

Start the dashboard in another terminal with `npm --prefix frontend run dev`.
Open `http://127.0.0.1:5173`, choose your workspace, then **Email analysis**.
Enter your Gmail address, review the consent and seven-day retention statement,
and choose **Continue with Google**. Complete sign-in and consent yourself.

The API startup command disables access logs because OAuth callback URLs contain
a short-lived authorisation code. Do not enable proxy or Vite request logging
that captures callback query strings. The application never logs provider bodies
or tokens. Configuration values are never returned to the browser.

## Run the first sample

Use the default **20 messages from the last 7 days**. Limits are 1–50 messages
and 1–30 days. The Gmail query is `in:inbox newer_than:Nd`; spam, trash, sent mail,
and attachments are not scanned. A larger inbox can contain unexamined messages,
so this result is always labelled a bounded sample.

Each Google response is capped at 2 MB after decompression. Collection stops
after a 120-second budget, checked between requests and before ingestion; an
in-flight request uses a 20-second timeout per network operation, so this is not
a strict total wall-clock deadline. Oversized or incomplete
samples fail with no partial message batch imported. Retry with fewer messages.

Message text is temporarily parsed locally for rule phrases and link hostnames.
HTML is never rendered, links are never fetched, and attachments are not
downloaded. Stored evidence may include sender/reply-to addresses, subject,
timestamps, matched phrases, link hosts, and provider authentication failures.
Only system Gmail labels are retained. Provider authentication headers are
observations, not an independent cryptographic verification.

Personal Gmail does **not** supply MFA configuration, sign-in history, account
forwarding posture, or OAuth grant inventory through this mail scope. Those
detectors continue to accept controlled data only.

## Retention and disconnect

The first Gmail connection sets a seven-day expiry for **all local data belonging
to that registered account**, including selected messages. Reconnecting does not
extend it. Expired trial datasets are purged at startup and before the next
platform API request; a stopped app cannot physically purge files until it runs.
Expiry removes local credentials as well. Remove the provider grant in your
Google account if consent should be revoked there too.
Unfinished consent attempts expire after ten minutes and are purged at startup
or on the next platform request.

**Accounts & sources → Disconnect** attempts Google revocation and removes local
tokens even if Google is unreachable. A failed revocation is explicitly reported.
**Delete local account data** removes sources, tokens, signals, findings,
incidents, guidance, jobs, and account-specific audit details. A minimal receipt
remains with no account or message identifier. Deletion does not delete Gmail
messages and does not guarantee provider revocation; disconnect first.

## What remains

The integration is covered by mocked provider acceptance tests and an authorised
local consent-and-scan trial on 4 October 2026. The first sample examined and
imported 20 messages, producing two reply-to mismatch findings for human review.
This validates the integration and storage boundary; it does not establish
threat-detection accuracy. See `EVALUATION.md` for its limits and the required
reply-to rule calibration. Other installations still need their own setup.
Public deployment still needs authenticated server-derived
identity, TLS, rate limits, protected storage/backups, verified consent, and
operational security review. This connector deliberately accepts localhost
callback URLs only. Encrypted tokens do not encrypt the full evidence database.
