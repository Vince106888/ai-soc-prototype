# Repository Instructions

These instructions apply to the entire repository.

## Product boundary

SentinelSME is a defensive research prototype. Keep detection deterministic and
evidence-backed. AI may explain structured findings, but it must not create
findings, change scores, infer unavailable telemetry, or perform remediation.

Only use synthetic, controlled, or explicitly authorised data. Never commit or
log credentials, OAuth tokens, private mailbox content, raw production events,
or screenshots containing sensitive data. Do not add URL fetching, malware
execution, credential collection, unauthorised scanning, or offensive features.

## Architectural invariants

- Preserve the chain `signal -> rule -> finding -> incident -> explanation -> recommendation/audit`.
- Normalise and minimise inputs before persistence. Full message bodies and
  attachments are outside the persistent data boundary.
- Keep rule evidence, weight, confidence, score, and explanation source
  traceable.
- Keep scoring deterministic. Persistent incidents use
  `1 - product(1 - weight)` and the documented severity bands.
- Scope every platform resource by tenant. Do not treat `X-Tenant-ID` as a
  production authentication system.
- Use idempotent source/external identifiers and reject invalid lifecycle
  transitions.
- Keep controlled ingestion fully usable when Google or AI services are absent.

## Change workflow

Before coding, read `README.md`, `docs/CAPABILITY_MATRIX.md`, and the focused
document for the area being changed. Avoid claiming a target-design component
is implemented until an executable path and tests exist.

Run the relevant checks before committing:

```bash
uv sync --dev --frozen
uv run ruff check .
uv run pytest --cov=app --cov-report=term-missing

cd frontend
npm ci
npm run lint
npm test
npm run build
```

Update API, rule, data-model, privacy, operations, evaluation, traceability, and
capability documentation whenever the corresponding contract changes. Include
normal, boundary, failure, tenant-isolation, and privacy tests where relevant.

Do not edit or discard unrelated work in a dirty worktree. Stage only the files
owned by the change. Keep generated databases, coverage output, dependency
folders, local environment files, and real evaluation exports out of commits.
