# Local-model explanations (optional)

LindaBiz can ask a small open-weight language model, running on the same
computer through [Ollama](https://ollama.com), to rewrite an incident's
explanation in plain language. Detection is unchanged:

- Rules still create every finding; the score, severity and recommended actions
  are computed exactly as before.
- The model receives only redacted, structured findings (rule, indicator and
  minimised observations). Email addresses and links are masked, and no account
  identifiers or message bodies are sent.
- It may choose the next step **only by number** from the deterministic,
  approved action list, so it cannot invent advice.
- Its output is validated: JSON shape, length, no links or email addresses, no
  unknown rule codes, no numbers absent from the evidence. Any failure, timeout
  or outage keeps the template explanation and is written to the audit log.
- The Ollama URL must be loopback (`127.0.0.1`, `localhost` or `::1`), so
  incident data never leaves the computer.

The model runs after evidence is committed (in the worker, or when a user
presses **Explain in plain language**), so a slow model never delays
collection. The template row is kept as the fallback and audit trail.

## Requirements

- About 3 GB of free disk space: Ollama itself plus `qwen2.5:3b` (about 1.9 GB).
  If space is tight, `qwen2.5:1.5b` (about 1 GB) also works but writes weaker text.
- 8 GB RAM is enough for the 3B model on CPU; 16 GB is comfortable.
- Expect roughly 10 to 60 seconds per explanation on a laptop CPU.

## 1. Install the model (once)

1. Download and install Ollama for Windows from https://ollama.com/download.
2. In PowerShell:

   ```powershell
   ollama pull qwen2.5:3b
   ollama run qwen2.5:3b "Reply with the word ready"
   ```

## 2. Run the evidence check (synthetic data only)

From the repository folder:

```powershell
$env:AI_SOC_EXPLAINER = 'ollama'
uv run python -m app.explain --check --runs 3
```

This builds a temporary database from the built-in synthetic scenarios,
explains every incident three times through the real code path and writes
`data/explainer-check-<date>.json` with the model version, latency per call,
valid-output rate, fallback reasons and the generated text. Keep that file:
it is the evidence for the report.

## 3. Use it in the dashboard

```powershell
$env:AI_SOC_EXPLAINER = 'ollama'
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Open an incident and select **Explain in plain language (local model)**. A
model-written explanation is labelled as such, and the footer shows
"local-model explanation". To explain open incidents automatically, run the
worker in the same shell (`uv run python -m app.worker`); it explains at most
three incidents per pass. Alternatively, run
`uv run python -m app.explain --tenant demo` once.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `AI_SOC_EXPLAINER` | `off` | `ollama` enables the adapter |
| `AI_SOC_OLLAMA_URL` | `http://127.0.0.1:11434` | Must be a loopback address |
| `AI_SOC_OLLAMA_MODEL` | `qwen2.5:3b` | Any pulled Ollama model name |
| `AI_SOC_EXPLAINER_TIMEOUT` | `120` | Seconds per call (5 to 600) |

## Limits

The model improves wording, not detection. It cannot see attachments, links or
message bodies and does not change priority. Its explanations have not been
evaluated with participants; the structured review and the participant study
in the report apply to both template and model text.

## Laptop verification — 28 October 2026

The synthetic end-to-end check completed with 4/4 validated explanations and no
fallbacks. An initial run took median 11.985 s (max 13.21 s); a repeat while
other development tasks were running took median 27.62 s (max 47.17 s). The
latest generated report is `data/explainer-check-2026-10-28.json`, intentionally
ignored by Git. Hardware/load affect timing. A browser check also produced a
labelled local-model explanation without changing the deterministic score.

For Docker, `python scripts/run.py docker --demo --model` uses the optional
`compose.ollama.yaml` profile. It has its own model volume and uses CPU inference.
Ollama shares the API network namespace and listens only on its loopback;
the worker joins the same namespace, and port 11434 is not published.
This container profile still requires runtime acceptance on a Docker host.
