# Non-specialist usability study — ready to run

Status on 5 October 2026: not conducted. The operator confirmed participants are
not yet available. No task times, participants, feedback or success rate have
been invented. This protocol implements the corrected Chapter 4 NFR-04 target.

## Preparation

Obtain the university's required research permission and informed consent before
recruitment. Use at least five consenting adult non-specialists as a small pilot;
report the actual sample and limitations. A five-person convenience sample is
not statistically representative. Do not use participants' real mailboxes.

Use a fresh controlled database and a workspace containing the built-in demo:

```powershell
$env:AI_SOC_DATABASE_URL = 'sqlite:///data/usability-controlled.db'
uv run python -m app.demo --tenant usability
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Build the dashboard first with `npm ci` and `npm run build` in `frontend`.
Open `http://127.0.0.1:8000`, then the existing local workspace `usability`.
Before each participant, return to Overview, clear filters, close incident
details and ensure all demo incidents are `new`. Use a new database per session
if decisions were changed. Record the same release/source checksum, browser,
viewport, computer, fixture checksum and starting state for all sessions.

Exclude onboarding from the three-minute task timer and report it separately.
If evaluating invited Google onboarding too, use a separate consented study and
record setup/sign-in duration separately; do not broaden Gmail access for this
study. No screenshot or recording is required.

## Participant instructions

“This is a prototype using invented security events. We are testing the
interface, not you. You may stop at any time. Starting from this overview,
identify the incident you would review first, explain why it was raised, and
show the next step the system recommends. Please complete all three tasks
within three minutes. You may explore the interface. The facilitator will not
guide you during the timed tasks.”

Start the timer after reading the instructions. Stop when all three tasks are
completed or at 180 seconds. Count assistance or requests for task clarification
as unaided-task failure; still allow the participant to finish and record the
observation. Record any interruption separately and exclude only with a stated,
predefined reason. Do not provide hints such as naming a tab or menu item.

## Scoring key — facilitator only

1. Highest priority: the critical lookalike/phishing email incident in the demo.
   It has multiple email/link/authentication findings. The other demo incidents
   are high priority. Verify the seeded scores before the first session.
2. Reason: participant accurately identifies at least one displayed matched
   finding and its supporting observation; “AI says it is bad” is insufficient.
   They need not recite the scoring formula or every finding.
3. Next step: participant locates and accurately describes the displayed human
   verification guidance. No real remediation is performed.

A participant passes only if all three tasks are correct, unaided, within
180 seconds. Calculate `100 × passing participants / valid participants`.
Report all task results and clarification requests, rather than only the final
percentage. The target is at least 80%; with five participants, at least four
must pass. Report a failed target honestly and correct the observed interface
issues before a separately identified follow-up study.

## Anonymous recording and feedback

Copy [the blank result sheet](study/anonymous-results.csv) into a protected study
location outside the repository/OneDrive. Use codes P01, P02, etc., with no names,
emails, employee details or mailbox content. Keep consent separately according
to the university requirements. Do not commit real results or recordings.

After timing, ask: “What was hardest to find?”, “What wording was unclear?”, and
“What would make the next step easier to understand?” Record anonymous concise
notes. Report recruitment, exclusions, demographics only when justified and
consented, individual task outcomes, total success rate and study limitations.

Chapter 5 can report the actual technical evidence already collected. Its
usability subsection must remain pending until this study is conducted or the
supervisor explicitly approves reporting the unverified target as a limitation.
Chapter 6 conclusions must stay within the evidence actually obtained.
