# Competitive readiness review

Reviewed 4 October 2026 against the executable repository, the corrected CNS
4101 Chapter 4 design, and public INKY and Proofpoint product descriptions.

## Assessment

Both the frontend and backend have been upgraded. LindaBiz now provides a
working local investigation workflow with persistent, traceable evidence and an
implemented personal Gmail adapter. Commercial parity with INKY or Proofpoint
has not been established. The current deployment is a defensive research
prototype; it does not continuously protect mail delivery.

The runtime Gmail configuration was still **unconfigured** during this review.
The displayed workspace contained controlled examples. No real Gmail scan,
commercial product trial, comparative detection study, or production load test
was performed. A polished console and passing tests cannot establish equivalent
protection.

## Upgrades delivered

| Layer | Executable change | Practical result |
|---|---|---|
| Overview | Database totals, open priority queue, seven-day activity, source counts and latest job | Users can distinguish retained evidence from source registration and review the most urgent open cases |
| Investigation | Searchable evidence workspace with account/type/result filters and signal detail | Messages with no findings remain inspectable; an empty incident queue no longer hides processed messages |
| Incidents | Server pagination/counts, account/severity/status/search filters and linked incident navigation | Users can navigate beyond the first result page and follow findings into a review case |
| Detection transparency | Read-only API-backed catalogue of twelve rules, versions, weights, confidence and matcher configuration | Reviewers can inspect the actual backend configuration; rule count is not presented as accuracy |
| Email analysis | Selected-message ingestion and a bounded Gmail consent/sample workflow | Analysis creates persistent signals, findings, incidents and job counts rather than a decorative scan animation |
| Backend evidence | Tenant-scoped signal list/detail and incident page APIs | Reads reconstruct stored evidence without re-scoring historical signals or creating an extra mail archive |
| Gmail lifecycle | Browser-bound single-use OAuth state, PKCE, profile matching, encrypted tokens, refresh, disconnect and limits | A local authorised trial is implementable once the operator configures credentials and completes Google consent |
| Privacy | Input minimisation, external private trial database/key, seven-day Gmail account expiry and local deletion | Full bodies and attachments remain outside persistent storage; token encryption is separate from evidence-storage protection |
| Verification | Evidence/API privacy and tenant tests, dashboard workflow tests, isolated 500-signal benchmark | Implementation and local processing have reproducible evidence; real-world detection accuracy remains unknown |

Verification at this checkpoint: 64 backend tests passed with 93.04% application
coverage; 24 dashboard tests passed. Backend/frontend lint, locked installs and
the production frontend build passed. Updating `typescript-eslint` from 8.42.0
to 8.71.0 removed the reported
development-tool glob parser advisories; the dependency audit reports zero
vulnerabilities at this review date. The recorded benchmark and its boundary
appear in `BENCHMARK.md`.

Desktop evidence/rule views and the mobile catalogue/navigation were inspected
in the running browser. Regression checks cover a failed priority queue without
a misleading clean state, filter independence and old workspace responses. This
is practical UI verification, not the formal Chapter 4 usability study.

The backend still preserves `signal -> rule -> finding -> incident -> explanation
-> recommendation/audit`. Scores remain deterministic. No external AI creates
findings, changes scores, or performs response actions. The selected-data path
works when Google services are absent.

## Comparison with commercial platforms

These are comparisons of documented capability, not independent tests of vendor
claims. Product capabilities can differ by licence and deployment.

| Capability | INKY public description | Proofpoint public description | LindaBiz now |
|---|---|---|---|
| Analyst console | Search, email inspection, banner/policy controls and delivery/quarantine decisions | Unified investigation and response | Persistent incident/evidence console and audited review decisions; no delivery controls |
| Phishing/BEC detection | Intent, visual cues and sender behaviour, including impersonation | Behavioural analysis and threat intelligence across email threats | Twelve deterministic email/posture rules; narrow indicators, no calibrated BEC detection result |
| Continuous protection | Inbound/internal protection and account-takeover analysis | Inline, API, in-mailbox, post-delivery and click-time protection | Manual selected emails or bounded on-demand Gmail inbox samples |
| URLs and attachments | Advanced attachment analysis and malicious-content protection | URL/attachment inspection and protection beyond delivery | Locally parsed URL hosts; no link visits, attachment inspection or malware execution |
| Sender relationships/ATO | Sender profiling and social graphing | Behavioural signals and account protection | Supplied posture indicators can be correlated; no live behavioural relationship model |
| User coaching | Email banners visible in mail clients | Contextual banners and user-report investigation workflows | Guidance in the dashboard only |
| Email administration | Policy control, graymail/signatures and outbound features described | Enterprise email/security integrations and automated response | Gmail read-only permission; no quarantine, mailbox modification or outbound controls |
| Identity and operations | Commercial managed deployment | Commercial managed deployment | Invited Google sign-in/session/workspace isolation implemented for localhost with synthetic tests; public HTTPS, identity lifecycle and operations evidence pending; local mode remains header-based |
| Measured detection quality | Vendor marketing claims | Vendor marketing claims | Unit/scenario tests and an evaluation API; no representative held-out dataset or comparative study |

References inspected on 4 October 2026:

- [INKY product overview](https://www.inky.com/)
- [INKY dashboard](https://www.inky.com/technology/dashboard)
- [Proofpoint Email Protection](https://www.proofpoint.com/us/products/email-protection)

## Necessary next updates

| Priority | Work | Evidence required before claiming completion |
|---|---|---|
| 1 | Complete the existing Google client setup and authorised Gmail trial | Real consent, correct-account match, bounded scan, duplicate repeat, disconnect and expiry evidence with private content excluded from shared artifacts |
| 2 | Evaluate and calibrate the detector | Versioned labelled development and held-out sets, benign hard negatives, precision/recall/false-positive results and documented telemetry limits |
| 3 | Finish Chapter 4 acceptance evidence | Timed 500 prepared-message API-to-dashboard run, three-minute user study, target PostgreSQL migration/restore check and reproducible demo/release package |
| 4 | Add operational collection if continuous monitoring is the goal | A bounded worker/scheduler, durable checkpoint, safe retry/backoff, provider quota handling, freshness indicators and failed/partial/clean states |
| 5 | Harden access before a shared or public deployment | Authenticated server-derived tenant identity, roles, TLS, rate limits, protected storage/backups, secret lifecycle and security/operational tests |

Priorities 1–3 fit the current research deliverable. Priorities 4–5 are necessary
for broader operational use. They should be explicit milestones rather than
silently implying that a scheduled job record is a running service.

Attachment inspection, link fetching/click-time interception, mail rewriting,
quarantine, outbound DLP and automated remediation would expand the product
boundary substantially. The repository instructions exclude URL fetching,
malware execution and automated remediation. Achieving those commercial features
requires a separately approved scope and architecture; adding decorative UI
controls cannot satisfy them. External generative AI is optional and does not
resolve the missing telemetry or evaluation evidence.

## CNS 4101 documentation alignment

The corrected Chapter 4 report was checked for the requirements relevant to this
upgrade. Its scheduled collection and broader account telemetry remain target
design. Personal Gmail read-only mail permission does not provide MFA posture,
sign-in history, forwarding configuration or OAuth-grant inventory.

NFR-07 specifies 500 prepared message records visible within five minutes. The
new [benchmark](BENCHMARK.md) establishes local service processing for 500 mixed
signals in a median 4.572 seconds; it does not measure 500 email records through
HTTP and dashboard rendering. NFR-04 still needs the formal 80%/three-minute
usability study. Current template explanations and finding weights are visible;
the current rule catalogue is not an immutable historical configuration archive.

The capability matrix and traceability document now record these differences.
The dissertation should report implementation, measured evidence and target
design separately.

## Remaining quality limitations

The detector is deliberately limited. Ordinary urgent wording, legitimate
reply-to differences, URL shorteners and authentication failures can be benign.
Sender-authentication headers are provider observations, not independent
cryptographic validation. Missing observations and a no-match result do not
establish safety. Confidence values and combined priority scores have not been
statistically calibrated.

Collection is synchronous and bounded. The 120-second Gmail budget is checked
between requests and before ingestion; the HTTP timeout applies to network
operations rather than providing a strict overall wall-clock deadline. There is
no ongoing monitoring while the app is stopped. Expiry runs at startup or the
next platform request, and local deletion does not revoke a provider grant.

The current result is a stronger local analyst prototype. A claim of commercial
competition needs measured detection effectiveness, verified live integrations,
operational reliability and a consciously expanded protection scope.


## Subsequent UI/UX upgrade checkpoint

The analyst console was subsequently redesigned using the installed UI/UX Pro Max
guidance. See [PRODUCT_SCOPE.md](PRODUCT_SCOPE.md) for the complete INKY product,
use-case, platform and industry mapping. The additional payment-redirection rule
and authentication observations have API privacy/isolation/idempotency tests.
The latest backend run passed 71 tests at 93.08% coverage. Frontend workflow checks
passed 43 tests with the concurrent onboarding integration; final checks and
browser-review limitations are recorded in the product review.

Local Google credentials are now configured in the running API. The setup helper
was repaired to apply a DACL without reapplying audit information that can require
SeSecurityPrivilege. Folder and token-key permissions verified as protected and
user-only. The controlled `ui-review` tenant contains synthetic demonstration data;
no new private Gmail accuracy evaluation was performed in this upgrade.
