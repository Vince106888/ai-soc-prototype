# SentinelSME security console

The frontend is a responsive React and TypeScript operations console for the SentinelSME API. It gives a small-business responder a risk-prioritized queue, an explainable incident record, explicit lifecycle controls, and a view of protected accounts and enabled capabilities.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Vite serves the console at `http://localhost:5173` and proxies `/api` to `http://127.0.0.1:8000`. Copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` when the API is hosted elsewhere.

On first use, enter the workspace ID and API key in the secure connection screen. Both values are stored in `sessionStorage` only and are sent as `X-Tenant-ID` and `X-API-Key`. They are never compiled into the application or persisted to local storage.

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
- Account, connected-source, and capability-aware coverage views
- User-triggered controlled scan jobs against an existing source
- Loading, empty, partial-data, network-error, and disconnected states
- Keyboard-visible focus, semantic controls, accessible dialogs, reduced-motion handling, and responsive layouts

The client accepts either plain JSON arrays or `{ "items": [...] }` list envelopes. Optional account/source creation and signal-ingestion methods are typed in `src/api.ts` for future import workflows; the UI does not silently create or ingest data.
