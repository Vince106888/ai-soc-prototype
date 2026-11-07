# Ask LindaBiz (explanation assistant)

A floating **Ask LindaBiz** button opens a small chat panel on every signed-in page. When an
incident is open on the Incidents page the panel is about that incident; otherwise it answers
general questions. Switching incident starts a fresh conversation.

## What it is, and is not

It is a **grounded explainer, not a language model**. Each answer is assembled by
`app/assistant.py` from data the platform already stores for the workspace: the incident's
findings, its deterministic explanation and reasons, the recommendations and the rule catalogue.
That keeps it inside the product boundary in `AGENTS.md`:

- it does not create findings, change scores or infer telemetry that was not collected;
- it never performs remediation. Requests such as "delete this email" or "block the sender"
  are declined with a pointer to doing it in your mail provider;
- it will not certify that a message is safe, and says so when asked;
- it uses no external service and no model, so no incident data leaves the server.

Topics: what happened, why it was flagged, the score and its bands, recommended next steps, when
a warning could be legitimate, a specific rule (for example `EMAIL-002`), what is stored, how
manual and automatic scans work, and how alerts work. Anything else gets a short list of what
it can answer.

## Privacy

Questions and answers are not stored. The audit log records only `assistant_asked`, the topic and
the incident reference, never the question text. The conversation lives in the browser tab only.

## API

`POST /api/v1/assistant` with `{ "question": "...", "incident_id": "..." }` (question 2 to 500
characters, `incident_id` optional). Tenant and session scoped like every other route: an
incident from another workspace returns `404`. The reply has `answer`, `topic`, `references`
(rule codes the answer is based on), `suggestions` and `source: "grounded"`.

## Adding model-written wording later

A free-form language model is deliberately not used. Incident wording can already be rewritten
by the optional local model through **Explain in plain language**, which validates the output
against the structured findings (see [local model](LOCAL_MODEL.md)). A conversational model would
need the same validation before it could be exposed here.
