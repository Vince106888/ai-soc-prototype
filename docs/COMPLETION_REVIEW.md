# Project completion review — 5 October 2026

The project is not yet fully complete as a CNS 4101 submission. The bounded
defensive research implementation is substantially complete, with the remaining
technical gaps closed in this pass. Formal usability evidence and execution of
the prepared container stack are still pending. Chapters 5 and 6 have not been
started in this pass.

## Scope used for the completion decision

Reviewed the repository README, capability matrix, architecture/rules/API/data,
privacy/operations/evaluation/traceability documents and the corrected report:
`CNS 4101/Chapter 4 Draft/CNS_4101_Chapter_4_106888_Vincent_Nyamao_Corrected.docx`.
Functional and non-functional acceptance intent was compared with executable
paths. The corrected Chapter 4 file and the completed Chapters 1–3 were not
altered. Earlier corrected image assets remain available.

LindaBiz's completion boundary is deterministic, evidence-backed monitoring
of selected/controlled email and authorised bounded Gmail samples, with supplied
account-posture events and human decisions. Commercial parity with INKY is not
a CNS 4101 completion requirement. Outbound/internal interception, encryption,
attachment sandboxing, graymail/signatures, DMARC-report ingestion, Microsoft
365 and live Workspace-admin telemetry remain outside the implemented boundary.
They must be described as future work, not demonstrated capabilities.

## Completed in this pass

- Executed opt-in scheduled collection through a small polling worker, rather
  than merely assigning a schedule label to a job. Added source-scoped atomic
  leases, abandoned-job recovery, bounded retries/backoff and pause after three
  consecutive failures. Controlled CLI fallback executes without Google.
- Added separate recurring Gmail acknowledgement and bounded settings to the
  console. Disconnect, invitation withdrawal and deletion stop future scans.
  Worker/API share the same protected provider/token configuration.
- Added scan queue/completion/failure and guidance audit events; deletion
  removes operational source/job references. Raw exception strings, bodies,
  attachments and full URLs do not enter the added records.
- Added incident latest-evidence time range filters, visible UTC time and
  correlation context. Matched the review note's 500-character API limit.
- Added validated operator-only stored-rule extension with approved minimised
  fields and supported matchers. Existing codes cannot be overwritten.
- Ran a real 500-email HTTP-to-dashboard acceptance: 24.6979 seconds ingestion,
  113.963 seconds through visible dashboard confirmation, 500 retained emails,
  500 findings and 50 incidents. Repeat: 500 duplicates, zero new findings.
- Produced reproducible synthetic rule/challenge evaluation with fixture and
  rule/source checksums. The challenge file reported five false positives and
  three misses; it is not independent or representative accuracy validation.
- Executed PostgreSQL 17.6 migration, controlled user/scheduled scans and backup
  restoration into a second database. Five signals and both jobs survived.
- Prepared one-host API/dashboard/worker/PostgreSQL Compose startup with a
  localhost-published API and executable CI smoke checks. Docker is unavailable
  on this Windows host, so container execution has not been claimed.
- Prepared the participant protocol and blank anonymous result sheet. No human
  observations or task times have been invented.

## Remaining gates before a complete evaluation/conclusion

| Gate | Status | Exact next action |
|---|---|---|
| NFR-04: 80% identify priority, reason and next step unaided within 180 seconds | Pending; participants unavailable | Run [the prepared study](USABILITY_STUDY.md), record anonymous actual outcomes and calculate the pass rate. If unavailable, obtain supervisor agreement to report the target as an unverified limitation. |
| NFR-09: actual one-host container scan | Pending environment execution | On a Docker host, build/start Compose, seed `container-acceptance`, execute the controlled worker and run `scripts/verify_container.py`; retain the real result. CI includes this path but has not been dispatched. |
| Invited Google app sign-in | Implemented and synthetic-tested; live callback pending | Validate the configured app OIDC callback once with the operator's own invited account. Earlier real Gmail consent is separate integration evidence. This is required if the dissertation claims live invited onboarding. |
| Generalisation/calibration | Limited synthetic evidence | Use independent authorised labels if making real-world precision/recall claims. Current findings support a controlled prototype and explicitly documented limitations only. |
| Dissertation consistency | Final evidence alignment pending | Chapter 5 should use actual test, benchmark, restore and study records; Chapter 6 should conclude within that evidence. Update Chapter 4 implementation descriptions if the worker/migration changes are included in the final submitted design. |

Live Google refresh/revocation/outage/expiry exercises and public deployment
hardening remain operational extensions. Production roles, TLS, rate limits and
protected backup policies must precede shared public hosting. They do not need
to be simulated or fabricated to finish a controlled research demonstration.

## Evidence and review assets

- [Capability matrix](CAPABILITY_MATRIX.md) and [requirements traceability](REQUIREMENTS_TRACEABILITY.md).
- [Email-only performance report](evidence/dashboard-benchmark-2026-10-05.json).
- [Synthetic detector report](evidence/synthetic-evaluation-2026-10-05.json).
- [PostgreSQL scan/restore report](evidence/postgresql-acceptance-2026-10-05.json).
- [Scheduling contract/runbook](SCHEDULING.md).
- [Usability protocol](USABILITY_STUDY.md) and [blank sheet](study/anonymous-results.csv).

Regression verification: final backend run passed all 131 tests at 93.66% application coverage. Ruff lint and format checks passed. The clean frontend install, audit (zero reported vulnerabilities), lint, all 47 tests and production build passed. The final concise-template change also passed 29 focused platform/scheduling/payment tests. The controlled overview and incident filter/UTC/evidence screens were visually checked. The saved screenshot is `evidence/screens/overview-2026-10-05.jpg`; no private mailbox content is shown.

This report is a completion audit, not Chapter 5 or Chapter 6.
