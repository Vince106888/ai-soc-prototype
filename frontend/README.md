# SentinelSME security console

The frontend is a responsive React and TypeScript operations console for the SentinelSME API. It gives a small-business responder a risk-prioritized queue, an explainable incident record, explicit lifecycle controls, and a view of protected accounts and enabled capabilities.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```bash
npm ci
npm run dev
```

Vite serves the console at `http://localhost:5173` and proxies `/api` to `http://127.0.0.1:8000`. In production, serve the compiled dashboard and API from the same origin (the root Dockerfile does this). `VITE_API_BASE_URL` may point at another same-origin base path; cross-origin hosting needs an explicitly reviewed CORS policy at the API gateway.

The welcome screen checks `/api/v1/auth/session` before rendering workspace
data. In Google mode, invited users sign in and receive their assigned
workspace automatically; Gmail consent is separate and the address is
prefilled. HttpOnly cookies carry the app session, while its CSRF value stays
in React memory. Sign-out/API expiry removes private views.

In local mode, choose **Start a local demo** or open an existing workspace with
its optional deployment key. Local values use `sessionStorage` and the original
headers; this mode does not authenticate users. Use the exact registered
loopback origin for Google mode; see [onboarding](../docs/ONBOARDING.md).

## Available commands

```bash
npm run build  # type-check and production bundle
npm run lint   # ESLint
npm test       # Vitest contract and prioritization tests
```

## What is implemented

- Overview with critical, active, under-review, and resolved indicators
- Incident queue prioritized by severity and recency
- Server-side severity, status, and text search filters
- Incident detail explaining what happened, why it matters, severity, and the next action
- Evidence table, response recommendations, and an audit timeline
- Auditable, transition-safe incident lifecycle controls (`new`, `under_review`, `resolved`, and `false_positive`) with an optional handoff note
- Telemetry coverage derived from active sources and their capabilities, kept distinct from engine support
- Explicit no-monitoring and controlled-data-only states when no live connector is active
- Controlled account/source setup with an explicit authorization acknowledgement
- Source activation and disconnection controls
- Selected-email ingestion into persistent scan jobs and incidents
- Tenant-scoped analysis history with counts and redacted failure detail
- Counted server pagination and account filters for incident results
- Searchable retained evidence, including no-match signals, and linked incidents
- Read-only current rule catalogue with configuration, versions and weights
- Loading, empty, partial-data, network-error, and disconnected states
- Keyboard-visible focus, semantic controls, accessible dialogs, reduced-motion handling, and responsive layouts

Incident and evidence workspaces consume `{items, total, limit, offset}` pages.
Source setup records metadata and allowed normalised signal types; Gmail consent
is a separate flow. Selected-email analysis performs ingestion directly and
clears the temporary body after success. A generic queued job alone does not
establish that collection executed.

## Email investigation update

Email analysis now submits selected messages directly into the persistent
pipeline and supports read-only Gmail consent/sample scans. Gmail needs operator
credentials; see [setup](../docs/GMAIL_SETUP.md). Workspace totals/seven-day
activity are independent of list filters and come from retained records. Detail
shows observed signals, readable evidence and copied weight/confidence rather
than additive points. Accounts show processed counts, expiry and local deletion.
Gmail supplies email signals only; collection runs on demand.


## Analyst interface

`console.css` implements the reviewed design in `design-system/sentinelsme/MASTER.md`.
Incident details have keyboard-accessible Overview, Evidence and Activity tabs.
The Email analysis screen separates selected messages from Gmail consent/sampling;
Protection coverage documents current limits and missing provider integrations.
Scores set priority, and detection/response remain server-side and advisory.
Use synthetic data for screenshots. The `ui-review` local tenant is a controlled
visual demonstration, not a production account or an accuracy dataset.

## Completion controls

Connected Gmail sources expose a collapsed Scheduled samples form with separate recurring consent and bounded settings. A worker must be running; next eligibility is not a worker-health assertion. Incident filters include latest-evidence from/until local times; API requests convert to UTC, and incident detail displays explicit UTC time and correlation context. Review notes are capped at the API limit of 500 characters.

## Browser interaction and responsive checks

The blue product foundation is in `src/product.css`; the existing operational
styles supply component structure. Use `npm run test:browser` after installing
the development dependencies and `npx playwright install chromium`. On Windows,
`$env:PLAYWRIGHT_CHANNEL="msedge"` reuses installed Edge without downloading a
browser. Tests start a loopback Vite server on port 8010, create isolated browser
contexts, and fulfil API requests with explicitly synthetic responses. They do
not use your logged-in browser, Google credentials or mailbox data.

Checks cover 375/768/1024/1440px layouts, navigation, metric filters, search,
incident tabs, account dialogs, Gmail acknowledgement, and blue hover feedback.
Screenshots are generated under ignored `data/ui-review/`; test traces and
reports are ignored too. The same browser suite runs with Chromium in CI.
