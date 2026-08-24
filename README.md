# AI-SOC Prototype

Standalone implementation repository for the CNS 4101 proposed AI-assisted cybersecurity monitoring and alerting system.

The project charter, roadmap, threat model, architecture decisions and requirements traceability live under [`docs/`](docs/). The GitHub issue tracker is the operational backlog.

Initial vertical slice for controlled email-fixture analysis.

## Run

```bash
uv sync --dev
uv run uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` and submit a fixture to `POST /analyze`.

## Test

```bash
uv run pytest -q
uv run ruff check .
```

This first slice deliberately uses controlled input. OAuth and live Gmail integration come after the deterministic pipeline is verified.
