# Chapter 5 evidence handoff — reviewed 12 October 2026

This is an evidence handoff, not Chapter 5 and not a new test report. No prototype
code or CNS report was changed during this review. At the time of the initial
file inventory, the retained evaluation JSON records found in `docs/evidence`
were dated 5 October 2026. A later coordination update reports fresh 12 October
verification by the Chapter 5 writing worker; see the separately attributed
update below. The 5 October results are historical records, not reruns by this
reviewer. Current HEAD is `39ee4114328111427b2bef729583b4276895ed73`,
but the checkout contains uncommitted implementation work. Do not identify that
commit alone as the tested implementation or invent a tested commit identifier.

## Chapter 4 authority and readiness

Source: `C:/Users/HP/OneDrive/Desktop/y4/CNS 4101/Chapter 4 Draft/CNS_4101_Chapter_4_106888_Vincent_Nyamao_Corrected.docx`,
last modified 4 October 2026. Its 28 rendered pages, 18 diagrams, seven tables
and complete text were inspected on 12 October. Diagram labels are readable and
no obvious page clipping was observed. The chapter is structurally complete but
has not been aligned with the later executable implementation.

Chapter 4 is Analysis and Design. Its requirements and planned verification
remain targets; measured results belong in Chapter 5. Preserve unmet targets
and distinguish implemented components from proposed extensions. In particular:

- Figure 4.2a/page 8 assumes the API returns a queued user job before a worker
  claims it. Actual selected-message and on-demand Gmail analysis execute
  directly; the scheduled worker claims a due **source schedule**, creates a
  job, then runs the same ingestion/adapter. It does not drain every generic
  queued job. Revise or identify this as a design deviation.
- Figure 4.7/page 17 still calls Gmail, scheduling, worker and session ownership
  targets. Gmail sampling and the controlled worker now execute; Google app
  identity is implemented with mocked-provider tests, with live login pending.
  Scheduling is part of the small polling worker, not a separate scheduler
  process or distributed broker. The LLM remains absent.
- Figure 4.8b/page 19 and Table 4.5/page 21 still call credentials planned/absent.
  The actual `oauth_credentials` primary key is `source_id`; the other fields
  are `tenant_id`, `encrypted_tokens` (Text) and `updated_at`. Token scopes and
  expiry are inside encrypted token JSON, not the separately drawn columns.
  Add `oauth_attempts`, `scan_schedules` and a separate small identity schema
  for `app_users`, `app_sessions`, `login_attempts`. Include account trial expiry.
- Figure 4.9a–b/pages 22–23 are readable conceptual wireframes. Current UI also
  has an overview, evidence/history, account coverage, detection catalogue,
  account/date filters, incident tabs and schedule controls. They need not be
  disguised as screenshots; Chapter 5 should use clearly labelled controlled
  implementation screens.
- Figure 4.10a/page 24 includes a proposed HTTPS gateway and separate scheduler.
  Actual prepared Compose has three services: API serving the React bundle,
  polling worker and PostgreSQL. Only loopback HTTP is published. No TLS gateway
  or model container is implemented. Native PostgreSQL acceptance is separate
  from pending container-stack execution.
- Figure 4.10b/page 25 omits browser-bound state/PKCE detail and still calls OAuth
  persistence proposed. Distinguish mailbox consent (`gmail.readonly`) from
  separate app identity (`openid email`), separate recurring acknowledgement,
  sign-out, pause, disconnect and deletion.
- Recheck Tables 4.3, 4.6 and 4.7 after diagram changes. Workspace administrator
  collection remains absent; personal Gmail supplies email, not live MFA,
  sign-in or application-grant telemetry. Optional AI invalid-output handling
  remains a proposed contract, not an executed model test.

## Chapter 4 acceptance mapping

The IDs below are unchanged. Criteria are compact transcriptions of Tables 4.1
and 4.2; consult the DOCX for the complete requirement descriptions. Status is
for the bounded research scope, not commercial or public-deployment readiness.

| ID | Chapter 4 acceptance criterion | Executable path and evidence | Boundary/status |
|---|---|---|---|
| FR-01 | Test account connects, appears active and stops supplying data after disconnect. | `gmail.py`, `gmail_api.py`, source lifecycle; `test_gmail.py`, `test_scheduling.py`; authorised 4 Oct consent/sample. | Partial: personal Gmail implemented; Workspace admin and live provider-revocation outcome unverified. |
| FR-02 | Selected mailbox fields become normalised records; full bodies/attachments excluded from persistence. | Selected-message ingestion, Gmail adapter, normalisation; Gmail/privacy/evidence tests and 4 Oct private storage inspection. | Verified within selected/controlled and bounded personal-Gmail input; broader admin collection absent. |
| FR-03 | At least one authorised or controlled scenario from every enabled posture category accepted. | Forwarding, sign-in, MFA and OAuth-grant schemas/rules; platform tests and development probes. | Controlled equivalents implemented; no live Workspace administrator telemetry. |
| FR-04 | Mailbox/posture samples share account/source/type/features/event/receipt representation. | `platform_schemas.py`, `rules.py` (`normalise_signal`), `entities.py`, `platform.py`; platform/evidence tests. | Implemented for supported types. |
| FR-05 | Both user/schedule triggers execute, record outcomes/counts and prevent duplicate imports. | Direct user ingestion/Gmail scan; `scheduling.py`, `worker.py`; scheduling tests and native PostgreSQL user/schedule record. | Controlled scheduled execution verified; real recurring Gmail not validated; arbitrary queued jobs are records only. |
| FR-06 | Each prepared email activates its expected rule; benign comparison does not. | Six EMAIL and two URL rules; detection/payment/platform tests; 24 development probes. | Prepared probes pass; challenge includes false positives/misses, so no general accuracy claim. |
| FR-07 | Prepared posture produces expected finding when required source enabled. | FORWARD-001, SIGNIN-001, MFA-001, OAUTH-001; platform/detection tests and probes. | Implemented on supplied controlled telemetry; live account takeover not demonstrated. |
| FR-08 | Finding shows rule/evidence/copied weight in 0..1; combined incident score separate. | `rules.py`, `platform.py`, finding/detail models; score/severity tests. | Deterministic `1 - product(1 - weight)`, accepted-weight floor 0.10; confidence separate. |
| FR-09 | Related test findings group; unrelated findings remain separate. | Same tenant/account/key, fixed 30-minute window; platform correlation/isolation tests. | Implemented; configurable correlation window remains future work. |
| FR-10 | Only valid lifecycle transitions accepted; every change audited. | `platform.py`, status API and dashboard; platform lifecycle/reopen/isolation tests. | Human decisions; resolved does not prove remediation. False Positive has no outgoing transition. |
| FR-11 | Correct priority ordering with severity/status/text filters. | Incident page/query and independent open queue; platform/evidence/frontend tests; controlled 5 Oct visual review. | Implemented; additional account and inclusive UTC latest-evidence date filters exist. |
| FR-12 | Each displayed incident traces to stored signal and rule. | Incident detail/evidence endpoints and UI; platform/evidence/frontend tests. | Includes retained no-match signals, weights and correlation context; no unavailable telemetry inferred. |
| FR-13 | Four explanation parts appear; template used if AI unavailable. | `platform.py` (`_guidance`, `_refresh_guidance`), stored guidance/advisory actions and detail UI; API/platform tests. | Template-only executable guidance. No LLM invocation, invalid-model-output trial or automatic remediation. |
| FR-14 | Scan/lifecycle/explanation/advisory records retain actor/action/time/references. | Scan queue/completion/failure and guidance-update audit, lifecycle history; platform/scheduling tests. | Advisory catalogue and system audit, not automatic action execution; deletion removes operational source/job references. |
| NFR-01 | Encrypt tokens; isolate keys/secrets; no token logs; external HTTPS. | Gmail encryption/state/PKCE tests, auth tests, fixed provider errors; private 4 Oct inspection. | Token protection implemented; full database/backup encryption, public TLS and operational rotation are not demonstrated. |
| NFR-02 | No full bodies/attachments persisted; only minimised findings reach explanations. | Strict rejection, normalisation, seven-day Gmail expiry/manual deletion; privacy/Gmail/evidence/scheduling tests. | Local boundary implemented; no external model payload was actually sent. General retention/backup policy remains operational work. |
| NFR-03 | Reject unauthenticated requests; cross-session account IDs cannot retrieve incidents. | Google-mode verified subject, server workspace, opaque hashed sessions/CSRF; `test_auth.py`. | Mocked-identity/session tests pass historically; live login pending. Default local tenant-header mode is not authentication. |
| NFR-04 | At least 80% complete priority/reason/next-step tasks unaided within 3 minutes. | `USABILITY_STUDY.md`, blank `study/anonymous-results.csv`. | Not conducted; participants unavailable. No observed times, feedback or success rate. |
| NFR-05 | Prepared incidents expose signal/rule/weight/score/explanation source. | Detail/evidence API/UI; platform/evidence tests and controlled visual review. | Implemented within deterministic evidence scope. |
| NFR-06 | Stable IDs prevent duplicates; failures/bounded retries preserve evidence; model fallback. | Transactions, source/external identifiers, ten-minute leases, crash recovery, 30/60-minute retry then third-failure pause; scheduling/Gmail tests. | Controlled and mocked-provider verification; live outage/refresh/revocation exercises and model-output fallback unverified. |
| NFR-07 | Up to 500 prepared messages complete and become dashboard-visible within 5 minutes. | 5 Oct email-only HTTP/dashboard record: 113.963 seconds; 500 retained emails; repeat 500 duplicates, zero new findings/failures. | Passed for one controlled development run, not live Gmail/concurrent/production throughput. |
| NFR-08 | Supported matcher rule added via validated config without dashboard/schema change; isolated services tested. | Operator-only `rule_config.py`, immutable stored codes, `test_rule_config.py`. | Implemented within approved minimised fields/matchers; new matcher families require code. |
| NFR-09 | Container starts dashboard/API/worker/database and completes end-to-end scan. | Compose/Dockerfile/entrypoint and `scripts/verify_container.py`; native PostgreSQL migration/scan/restore record. | Prepared, container execution pending. Native PostgreSQL success does not satisfy the container criterion. |

## Dated evidence suitable for Chapter 5

| Evidence | Actual observation | Source and limitations |
|---|---|---|
| Regression — 5 Oct 2026 | 131 backend tests, 93.66% application coverage; Ruff lint/format pass. Frontend clean install, lint, 47 tests/build pass; audit reported zero vulnerabilities. Later concise-template change passed 29 focused tests. | `COMPLETION_REVIEW.md`; historical recorded runs, not a new 12 Oct verification. Test coverage is not detector accuracy. |
| Gmail integration — 4 Oct 2026 | Authorised read-only consent; 20 inbox messages imported, zero duplicates, two EMAIL-001 findings forming two medium incidents, score 0.45 each. Repeat imported zero, recognised 20 duplicates, added zero findings. | `EVALUATION.md`; integration and minimisation evidence only, no malicious/benign ground-truth labels. No private sample export or screenshot should enter the dissertation/repo. |
| Detector — 5 Oct 2026 | Development 24 cases: TP12/TN12/FP0/FN0. Challenge 32 cases: TP12/TN12/FP5/FN3; threshold 0.30, accuracy/F1 0.75, precision/specificity 0.7059, recall 0.80. | `evidence/synthetic-evaluation-2026-10-05.json`, `EVALUATION.md`, `fixtures/evaluation/*`; challenge repeats 24 controls plus 8 difficult cases. Stipulated labels authored with rule knowledge; not independent/blind/representative. No tuning. |
| Dashboard performance — 5 Oct 2026 | 500 email-only records (250 suspicious/250 benign), 50 groups; HTTP ingestion 24.6979 s, queries 2.599 s; visibly confirmed within 113.963 s. 500 findings/50 incidents; repeat 500 duplicates/zero new findings/zero failures. | `evidence/dashboard-benchmark-2026-10-05.json`, `BENCHMARK.md`; one isolated SQLite run, setup excluded, no warm-up. Includes manual navigation/observation latency; other development work active. |
| Earlier service baseline — 4 Oct 2026 | Three 500 mixed-signal runs, median ingestion 4.572 s; 300 findings/50 incidents. | `BENCHMARK.md`; before later worker/audit changes; direct services, no HTTP/browser/provider. Do not substitute it for the dashboard measurement. |
| PostgreSQL — 5 Oct 2026 | Native PostgreSQL 17.6, migration head 9d213bf807a2; user scan imports 5, worker repeat recognises 5 duplicates; pg_dump custom/pg_restore into second DB preserves 5 signals/2 jobs/head. | `evidence/postgresql-acceptance-2026-10-05.json`; synthetic data, temporary loopback server stopped afterwards. No Docker/TLS/production load claim. |
| Controlled UI — 5 Oct 2026 | Overview and UTC/filter/evidence views inspected. | `evidence/screens/overview-2026-10-05.jpg`; controlled illustration, not usability evidence. |

### Fresh verification reported by the writing worker — 12 October 2026

The coordinating project chat reports that the Chapter 5 writing worker has
rerun all 131 backend tests at 93.66% coverage and all 47 frontend tests, lint
and build successfully. It also reports that today's npm audit identifies one
high-severity `source-map-js` development dependency advisory. Do not carry the
historical 5 October zero-vulnerability result forward as today's audit result.
The worker's fresh synthetic report reportedly matches the previous detector,
fixture and rule hashes and metrics. Cite the worker's actual new files/logs
for these results: this reviewer has not independently rerun or located those
new outputs. These reports do not establish new human, Docker or live Google
validation.

The detector report contains dataset/rule/source checksums. Keep its exact
fixture label basis and counts when citing it. Eight challenge cases include
five false positives (approved urgency, shorteners, routing, new devices and
broad grants) and three misses (unfamiliar BEC/phishing phrasing and an
attachment-only stipulated threat outside collected telemetry).

## Remaining evidence and reporting rules

1. Run the human study when participants are available. Preserve the 80%/180 s
   criterion; report it unverified if no study is conducted. Any change to the
   research target requires supervisor agreement, not invented observations.
2. Execute the prepared Compose smoke on a Docker host and retain actual
   results. Its CI path exists but no execution is established by this handoff.
3. Validate invited Google app sign-in separately if claiming live onboarding.
   Existing real Gmail consent does not validate the `openid email` callback.
4. Live recurring Gmail, provider refresh/revocation/outage/observed expiry are
   not demonstrated by controlled-worker or mocked-provider tests.
5. Keep absent LLM, Workspace admin collection, Microsoft 365, outbound/internal
   interception, encryption product features, attachment sandboxing, graymail,
   signatures and DMARC report ingestion in limitations/future work. INKY
   commercial parity is not the bounded CNS 4101 completion criterion.
6. Chapters 5/6 can report completed controlled implementation and explicit
   limitations; they cannot conclude every Chapter 4 criterion was achieved.
   Do not move test results into Chapter 4 just to make it appear current.

Additional references: `CAPABILITY_MATRIX.md`, `REQUIREMENTS_TRACEABILITY.md`,
`SCHEDULING.md`, `ONBOARDING.md`, `DATA_MODEL.md`, `PRIVACY_AND_RETENTION.md`,
`OPERATIONS.md`, `RULE_CATALOG.md`, `API.md`. The complete prototype remains
deterministic and evidence-backed; only advisory human responses are supported.
