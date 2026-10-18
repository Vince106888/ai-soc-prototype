# User onboarding and sign-in

## Recommended rollout

Start with invited personal-Gmail users. The operator configures one Google
project and Web OAuth client; users never handle a client secret, encryption
key, or tenant ID. Keep the modular monolith and deterministic detection path.
Public self-service registration is a later release gate.

The implemented pilot is localhost only. Other people can use it on this
machine, or run a separately configured local installation. A localhost link
does not let somebody on another computer reach this installation.

## User journey

1. Open SentinelSME and choose **Sign in with Google**.
2. Use an account on the operator's invitation list. Google verifies the email;
   the server assigns a new private workspace on first sign-in.
3. Choose **Gmail sample** to connect the same Gmail account with separate
   read-only consent, or **Selected message** to analyse authorised data.
4. Acknowledge the seven-day evidence retention and request a bounded sample.
5. Review evidence and incidents. Use **Settings → Sign out** to close the
   session. Use **Accounts & sources** to disconnect Gmail or delete its local
   evidence; signing out does neither automatically.

Sign-in requests `openid email`; it does not request Gmail permission. There
are no application passwords, password-reset emails, organisation roles, or
automatic invitation messages. An invitation is an exact email entry in the
operator's configuration, checked again on every authenticated request.

## Operator setup, once per installation

The existing Gmail Web client can be reused. Add this authorised redirect URI
alongside the existing Gmail URI, preserving the working Gmail callback:

```text
http://127.0.0.1:5173/api/v1/auth/callback
http://127.0.0.1:5173/api/v1/gmail/callback
```

Include `openid` and the email identity scope in the Google consent-screen
data-access configuration, alongside `gmail.readonly`. Keep Gmail read-only;
do not add sending, modification, contacts, or administrative permissions.
The Gmail token validator permits identity scopes alongside `gmail.readonly`
when Google combines grants for this shared client. It still requires Gmail
read-only and rejects every other mailbox/provider permission.
Keep the app in Testing for this pilot. Each participant must be both a Google
test user and a SentinelSME invitee. These are separate checks.

Reuse the privately saved Web client JSON after saving the callback. The client
ID and secret stay the same; older downloads may not list the added callback.
In PowerShell at the project root, run the following with your actual file path
and invited account addresses. Do not paste the secret into chat or source:

```powershell
. .\scripts\configure-gmail.ps1 `
  -CredentialsFile 'C:\path\to\downloaded-web-client.json' `
  -EnableSignIn -InvitedEmails 'participant@gmail.com' `
  -StartApi -Background
```

The script validates the Web client and existing Gmail callback, keeps credentials in
the process environment, restricts private local storage under
`%LOCALAPPDATA%\SentinelSME`, and starts the loopback API without access logs.
Startup applies the new Alembic migration. Refresh the dashboard afterwards.
No Google configuration changes are performed by the script. Register the
sign-in callback in Google before enabling this mode; the script cannot verify
that remote setting from an older downloaded file.

For several invitees, use `-InvitedEmails 'first@gmail.com','second@gmail.com'`.
Removing an address and restarting disables that person's access, including
existing sessions. It does not purge evidence or revoke Google grants. Restart
with the complete invitation list to avoid unintentionally excluding others.

Existing local-header workspaces are not adopted by matching an email address.
First Google sign-in creates a fresh workspace, so reconnect and consent there
explicitly. This prevents taking ownership of someone else's earlier trial.

## Local demonstration mode

`AI_SOC_AUTH_MODE=local` is the default. The welcome page has **Start a local
demo** and an advanced option to open an existing workspace with its optional
shared deployment key. The dashboard retains local workspace settings.
This mode provides caller-selected partitions, not authenticated isolation.
Keep it on trusted loopback and use controlled examples.

The Gmail setup script without `-EnableSignIn` explicitly selects local mode.
Choose the mode deliberately. An unrecognised auth-mode value fails closed;
it does not fall back to header access. Google service failure never changes
the selected mode. Controlled analysis works without Gmail; in Google mode,
an existing valid app session can continue reading its workspace during a
provider outage, subject to expiry.

## Implemented access protections

- Google-signed RS256 identity tokens validated against fixed Google public
  keys, issuer, client audience, expiry, verified email, subject and nonce.
- Single-use ten-minute login attempts, browser-cookie binding and PKCE;
  temporary verifier and nonce encrypted with the existing external key.
- Random opaque eight-hour app sessions. Database records retain session and
  CSRF hashes; Google sign-in access/ID tokens are discarded after validation.
  A prior read-only Gmail grant returned on the same client is permitted and
  discarded with the login token; no mailbox data is read during sign-in.
- HttpOnly, SameSite=Lax cookies on the loopback origin; CSRF header and origin
  checks on authenticated mutations. The CSRF value is returned by the
  same-origin session endpoint and kept in React memory, not browser storage.
- Server-derived tenant on all platform and Gmail data routes. Tenant headers
  and deployment keys cannot override a signed-in user's workspace. Resource
  IDs outside that workspace return `404`.
- Gmail consent/callback bound to the signed-in workspace and email. Switching
  accounts or signing out while Gmail consent is pending blocks completion.
- Sign-out invalidates the server session. UI hides private views on API `401`,
  expiry and failed session checks, and checks the session again on window focus.

App identities retain a Google subject and verified email until the operator
removes the identity. Their lifetime is separate from seven-day Gmail evidence
expiry. Expired sessions and login attempts are removed at startup and before
new login attempts; expired rows cannot authenticate between cleanups. Protect
the database and backups. Operator deletion of an identity must also remove
its sessions and follow the evidence/Google revocation policy.

## Necessary work before remote/public onboarding

The current callback validator deliberately rejects public URLs. Do not expose
the local server or send its localhost link as a remote invitation. A hosted
release requires an explicit HTTPS public-origin configuration, registered
production callbacks, Secure cookies, reviewed proxy/CORS handling and a
verified deployment. Complete Google OAuth production verification for the
chosen audience and restricted Gmail scope; confirm Google's applicable
assessment requirements for the actual data handling and deployment.

Also required: per-user/IP abuse limits, identity removal and recovery
operations, protected production database/backups, retention for identities
and general evidence, security logging without tokens/content, target-host
isolation testing, and a pilot usability study. Add organisation roles only
when multiple people need to share a workspace. A public sign-up button alone
does not implement these contracts.

## Verification status

Synthetic provider tests cover identity validation, scope rejection, expiry,
state replay, invitations, stable workspaces, CSRF, sign-out and cross-user
resource denial. Frontend tests cover server-first entry, errors, sign-out,
session expiry and the local fallback. These do not prove live Google sign-in
or remote hosting. Record the first real sign-in separately after registering
the callback. The earlier authorised Gmail trial is mailbox integration
evidence, not app sign-in or detection-accuracy validation.
