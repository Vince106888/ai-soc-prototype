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
- Incident queue prioritized by severity, score and recency
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

The console follows `design-system/sentinelsme/MASTER.md`. Highlights:

- **Addressable views.** Every page has a hash route (`#/overview`, `#/incidents`,
  `#/incidents/<id>`, `#/evidence`, `#/analyse`, `#/sources`, `#/coverage`,
  `#/rules`), so refresh, the back button and shared links keep their place.
- **Evidence chain.** Each incident opens with five linked steps (observed
  signals, matched rules, deterministic priority, who wrote the explanation, the
  human decision); each step opens the tab that substantiates it. The decision
  form stays beside the evidence on wide screens.
- **Queue order.** Severity, then score, then recency. Severity is a segmented
  filter; account and date filters sit under "More filters".
- **Keyboard.** `/` search, `j`/`k` move through the incident queue, `g` then
  `o`/`i`/`e`/`a`/`s`/`r`/`c` to jump between pages, `?` lists shortcuts.
- **Themes.** Light, dark and "match system", stored per browser in
  `localStorage` (a convenience only; no workspace data).
- **Small screens.** Below 1080 px the incident queue and detail become two
  steps with a "Back to queue" control; below 900 px navigation is a drawer.

Code layout: `App.tsx` composes the shell; `useWorkspace.ts` loads workspace
data and discards responses for an old tenant or filter set; `pages/`,
`shell/`, `ui/` (router, theme, hooks, modal and primitives) and `modals.tsx`
hold the parts; `styles/` holds tokens, base, components, shell and page CSS.
Use synthetic data for screenshots.

## Completion controls

Connected Gmail sources expose a collapsed Scheduled samples form with separate recurring consent and bounded settings. A worker must be running; next eligibility is not a worker-health assertion. Incident filters include latest-evidence from/until local times; API requests convert to UTC, and incident detail displays explicit UTC time and correlation context. Review notes are capped at the API limit of 500 characters.
