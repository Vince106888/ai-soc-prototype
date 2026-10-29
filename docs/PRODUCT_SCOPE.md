# Product coverage and completion plan

Reviewed 4 October 2026 against the user's INKY product list, the executable
LindaBiz repository, and the corrected CNS 4101 Chapter 4 requirements.
Commercial parity has not been measured. Vendor product names describe separate
capabilities; they are not a checklist that can be satisfied by adding dashboard
buttons.

## Changes delivered in this upgrade

The console now has a consistent analyst layout: compact triage rows, clearer
type sizes, an explicit collection banner, separate selected-message/Gmail
workflows, incident Overview/Evidence/Activity tabs, readable source observations,
expandable rule records, and a protection coverage screen. Keyboard tabs support
arrows/Home/End; dialogs trap focus, close on Escape, and return focus to their
opener. Responsive layouts preserve the evidence workflow on narrow screens.
The mobile drawer also traps focus, closes on Escape and becomes inert when
hidden. Offset-free SQLite timestamps are interpreted as UTC before being
formatted in the viewer's local time, preventing false multi-hour collection ages.

The reviewed design specification is `design-system/lindabiz/MASTER.md`.
UI/UX Pro Max was installed from
[its source repository](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).
Its data-dashboard, contrast, touch-target, focus and responsive guidance informed
the implementation. The local Pencil CLI was unavailable without authentication;
the implementation and browser verification are the delivered design artifacts.
No third-party product icons, logos or private mailbox screenshots were copied.

`EMAIL-006` adds a narrow payment-redirection indicator requiring both a changed
payment-details phrase and a payment instruction. It stores matched phrases only.
The advisory guidance asks users to verify payment changes through an existing
trusted contact. Known supplied SPF/DKIM/DMARC results are preserved as message
observations. The selected-message form accepts bounded explicitly declared
trusted domains, making its existing lookalike rule usable without inferring a
domain from the recipient's address. Existing evidence is not silently re-scored.

## Products

| INKY product | LindaBiz executable coverage | Necessary work to cover the product |
|---|---|---|
| Inbound Mail Protection | Selected-message and bounded read-only Gmail inbox analysis; sender, language, link-host, brand/domain and authentication indicators | Continuous delivery/collection integration, evaluated detection and user-visible mail protection; the current sample cannot prevent delivery |
| Outbound Mail Protection | None | Separate outbound integration, data-loss policies, appropriate permissions and evaluation |
| Internal Mail Protection | Supplied signals can be analysed, but there is no internal mail collection or relationship model | Managed-domain collection and trustworthy internal sender/recipient context |
| Email Encryption | OAuth tokens are encrypted locally; messages are not encrypted by this platform | Delivery integration and message-key lifecycle; token storage encryption does not satisfy this product |
| Advanced Attachment Analysis | Attachments are excluded from collection, storage and execution | A separately reviewed external inspection boundary, supported formats and measured verdicts; repository instructions currently exclude malware execution |
| Graymail Protection | None | Evaluated bulk-mail classification plus mailbox/policy controls |
| Email Signatures | None | Managed identity/template rules and outbound signature insertion |
| DMARC Monitoring | Supplied per-message SPF/DKIM/DMARC observations and failure indicators | Aggregate report ingestion, domain posture, reporting and controlled DNS administration; message headers do not establish domain monitoring |

## Threat use cases

| Use case | Current evidence | Limitation and necessary update |
|---|---|---|
| Account takeover | Deterministic supplied sign-in, MFA, forwarding and OAuth-grant indicators, correlated per account | Personal Gmail permission does not expose this posture. Administrator telemetry, collection freshness and representative cases are required |
| Brand forgery | Recognised display names, sender-domain conflict and caller-declared lookalike domains | Narrow configured rules; no visual/logo analysis, reputation or sender behaviour model |
| Business email compromise | Reply-to mismatch, language/identity indicators and payment-redirection phrase conjunction | Legitimate invoice changes can match. BEC accuracy is unknown; evaluate realistic benign and malicious messages and record review outcomes |
| CEO fraud | Existing identity/language indicators may match some examples | No executive identity directory or relationship baseline; detection of a particular message is not general CEO-fraud protection |
| Malware and ransomware | None | No attachment/content verdict or execution. A reviewed external defensive inspection service would be a separate expansion |
| Spear phishing | Some configured sender/link/language indicators | No recipient targeting or behavioural model; test realistic targeted examples and evasions |
| Zero-day attack | None | No evidence supports this claim. A new threat must be evaluated before any broader detection claim |

## Platforms and industries

Personal Gmail has an implemented OAuth adapter and requires installation-specific
credentials and consent. A local authorised consent/sample trial is reported in
the existing setup documentation; that is integration evidence only. The current
coverage banner derives readiness from the running API and connection state from
registered active Gmail sources. A configured OAuth client alone is not a connected
mailbox, and an active source is not continuous protection.

Google Workspace administrator collection remains absent. Microsoft 365 requires
a separate Microsoft Graph adapter, consent, tenant identity and provider-contract
tests. Neither is available merely because the input schema names a provider.

Automotive, construction, finance, healthcare, manufacturing, technology and
professional services, and utilities/oil and gas share the same basic email threat
workflow. No industry-specific product or compliance certification exists here.
Industry labels and decorative landing pages are not necessary to complete CNS
4101. Sector-specific retention, access, incident handling and evaluation need
real requirements before implementation. For example, finance needs evaluated
payment-change scenarios; healthcare needs governed handling of sensitive content.

## Completion milestones

| Priority | Deliverable | Completion evidence |
|---|---|---|
| 1 — research | Versioned development and held-out evaluation sets, hard benign negatives and documented detector limits | Report precision, recall, specificity, false positives and F1 with reproducible input/rule versions; no accuracy claim from unit tests |
| 2 — research | CNS 4101 NFR-07 and NFR-04 acceptance evidence | 500 prepared email records visible through API/dashboard within five minutes; formal 80%/three-minute usability study. The existing mixed-signal service benchmark does not establish either |
| 3 — research | Release/deployment evidence and documentation alignment | PostgreSQL migration/restore check, reproducible controlled demonstration, API/rule/privacy contracts and dissertation clearly separating implemented and target design |
| 4 — operational use | Reliable continuous collection and richer managed-domain telemetry | Worker/scheduler, durable checkpoints, retry/backoff, quotas, retention and observable failed/partial/stale states; Gmail samples remain usable offline |
| 5 — shared deployment | Production access and operations | Invited localhost Google identity/session/isolation paths implemented; live sign-in validation, HTTPS public origin, identity lifecycle, roles when sharing workspaces, rate limits, protected storage/backups and target-host security tests remain; `ONBOARDING.md` |
| 6 — product expansion | Microsoft 365, mail administration and approved inspection boundaries | Separate scoped designs and executable provider/policy tests; no unsupported remediation or malware execution |

Priorities 1–3 complete the research evidence without turning the project into a
commercial mail gateway. Priorities 4–6 expand its operational/product scope.
The console intentionally exposes these gaps rather than implying that all of
INKY's products exist in this prototype.

## Verification record

The console/detection checkpoint passed the full 71-test backend suite with
93.08% application coverage. After the separate onboarding changes appeared in
the shared checkout, the focused payment/evidence/platform suite passed 22 tests
again. Ruff passed. Frontend checks passed 43 tests, ESLint and the production
build with the onboarding integration present. A clean `npm ci` completed with
no reported audit vulnerabilities. Vitest uses one thread worker at a time to
avoid Windows worker-startup timeouts; test isolation and assertions remain on.
These checks do not establish detection accuracy or commercial readiness.

Browser review used the synthetic `ui-review` tenant: four retained signals,
five matched findings and three incidents, including a routine no-match email,
payment-change evidence and a supplied MFA-disabled event. The overview, account
registry/history, selected-message form, Gmail readiness, coverage map, twelve-rule
catalogue and incident Overview/Evidence/Activity sections were inspected through
visible controls. Desktop overview and incident screenshots were visually reviewed.
Effective widths of 375, approximately 768/1024, and 1440 pixels were checked. The coverage pages and 375-pixel evidence view had page widths equal to the
viewport; mobile menu focus and Escape return were verified. The browser's viewport
control is affected by the host display scale, so requested and effective sizes
were checked separately. A formal user usability study is still required.

Screenshot captures failed intermittently in the in-app browser and later recovered. Final desktop overview/coverage and phone/tablet coverage screenshots were saved and visually reviewed. Saved
screenshots are controlled-data evidence of the reviewed layout, not private
mailbox captures. The normal viewport was restored and the local preview recovered
after the API loaded the concurrent onboarding routes. The onboarding task has
its own [implementation and rollout record](ONBOARDING.md); live Google app sign-in
and public deployment remain separate validation gates.

## References

The mapping uses the product/use-case/platform links supplied by the user and the
existing [competitive review](COMPETITIVE_READINESS.md). Public descriptions are
vendor claims, not results of a licensed commercial trial. See the executable
[capability matrix](CAPABILITY_MATRIX.md), [rule catalogue](RULE_CATALOG.md),
[privacy boundary](PRIVACY_AND_RETENTION.md) and [evaluation plan](EVALUATION.md).
