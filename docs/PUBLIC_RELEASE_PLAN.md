# Public release implementation plan

Confirmed scope: public Google sign-up, one server-owned private workspace per
user, deployable on a VPS/domain selected later. No shared organisations,
password authentication, billing, automatic remediation or expanded Gmail scopes.

## Preserve and verify the product logic

- Rules alone create findings; models may only explain redacted structured evidence.
- Preserve copied weights/confidence, bounded scoring and severity bands.
- Preserve account/tenant correlation boundaries, lifecycle validation and idempotency.
- Review concurrent ingestion and worker failure/lease recovery on PostgreSQL.
- Bodies/attachments remain transient/rejected; submitted links are never fetched.

## Public identity and data lifecycle

- Add explicit production configuration with a canonical HTTPS origin and startup validation.
- Allow verified Google self-registration into fresh server-assigned workspaces.
- Keep invitation-only and local development modes separate; no local fallback in production.
- Secure cookies, same-origin CSRF, session invalidation and account deletion.
- Configured evidence retention, continuing mailbox connections, separate provider consent.
- Enforce resource and abuse limits; never log OAuth query parameters, secrets or bodies.

## Deployment package

- HTTPS edge, bounded reverse proxy, no public API/database/model ports.
- Separate PostgreSQL administrator/application roles and file-mounted secrets.
- Non-root application/model processes, read-only roots, resource/log bounds.
- Migrations, health/readiness, persistent volumes, backup/restore and upgrade procedures.
- Optional CPU-only loopback Ollama with cloud features disabled.
- Operator initialization and validation without requiring a chosen live domain today.
- Automated controlled acceptance for auth/isolation, proxy/TLS, worker and recovery.

## Release evidence and external completion

Keep executable/tested/incomplete states explicit in the capability matrix and runbook.
The current private Compose workflow, polling worker, HTTP smoke, restart
persistence and PostgreSQL restore have passed. Public acceptance is a separate
gate. A chosen domain/VPS, live Google client/callback registration, DNS/ACME and
live consent are not yet available and cannot be claimed verified.

Gmail public availability also depends on Google's restricted-scope verification
and any applicable assessment for the actual deployment; operator configuration
alone is not approval. Google sign-in remains separate from optional Gmail access.

Primary references:
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- https://nginx.org/en/docs/http/ngx_http_limit_req_module.html

## Recovered implementation checkpoint: 28 October

The code survived the laptop shutdown. Docker restarted and existing volumes
were retained. Public TLS acceptance passed through Caddy/Nginx with verified
private CA/hostname, synthetic app sessions, ingestion, duplicates, minimisation,
review actor integrity, tenant isolation, workspace deletion/session revocation,
and non-empty restore under the restricted application DB role. The private
preview responds on port 8001. No production authentication bypass was added.

Full backend verification: 234 passed, 91.73% coverage, plus the additional
public HTTP-202/background-worker/deletion route test passed. Frontend: 58 passed,
lint/build passed. CI includes a repeatable public acceptance job; no remote CI
execution is claimed. Runbook: PUBLIC_DEPLOYMENT.md. Lecturer journey:
LECTURER_WALKTHROUGH.md. Public Google signup, retention/deletion, secure
configuration and bounded isolated AI jobs are implemented. Live domain/VPS,
Google OAuth acceptance/required Gmail approval, provider monitoring and offsite
backup configuration remain external launch requirements.
