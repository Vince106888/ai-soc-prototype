# Detection Rule Catalogue

## Validated configuration extension

`uv run python -m app.rule_config fixtures/rules/example-authentication-rule.json
--check-only` validates an operator-owned JSON file without importing it. Omit
`--check-only` only in an intended controlled database to add the new rule.
Rule imports accept bounded weights/confidence, supported matchers and approved
minimised feature/evidence fields. Bodies, tokens, full URLs and arbitrary keys
are rejected. Existing codes cannot be overwritten; use a new code to preserve
historical evidence. Rules are a global research catalogue, not tenant-owned
configuration. This CLI is an operator function and has no public write API.
Adding a supported matcher instance requires no schema or dashboard change;
new feature extraction or matcher families require code and separate tests.

SentinelSME's persistent pipeline uses deterministic, versioned rules. Each
match records the rule code, copied weight, copied confidence, and selected
evidence. Rules create review indicators, not verdicts.

## Persistent rule set

| Code | Signal | Trigger | Evidence retained | Weight | Confidence |
|---|---|---|---|---:|---:|
| `EMAIL-001` | `email` | Non-empty sender and reply-to domains differ | `sender_domain`, `reply_to_domain` | 0.45 | 0.95 |
| `EMAIL-002` | `email` | At least one configured social-engineering phrase appears at word boundaries | `matched_terms` | 0.30 | 0.85 |
| `URL-001` | `email` | A canonical host equals or is a subdomain of a configured shortener | `url_hosts` | 0.30 | 0.98 |
| `URL-002` | `email` | A hostname label is `account`, `login`, `secure`, or `verify` | `url_hosts` | 0.45 | 0.80 |
| `EMAIL-003` | `email` | Sender domain is within edit distance two of a caller-declared trusted domain | sender and claimed domains | 0.65 | 0.85 |
| `EMAIL-004` | `email` | Recognised brand wording conflicts with the sender domain | display name, sender domain, claimed brand | 0.55 | 0.85 |
| `EMAIL-005` | `email` | SPF, DKIM, or DMARC reports fail/softfail | failed authentication checks | 0.55 | 0.95 |
| `EMAIL-006` | `email` | Payment-change phrase and payment-action phrase both match at word boundaries | `payment_change_terms`, `payment_action_terms` | 0.50 | 0.75 |
| `EMAIL-007` | `email` | First message from this sender (per account) and a payment-change phrase | `first_contact`, `sender_domain`, `payment_change_terms` | 0.35 | 0.80 |
| `EMAIL-008` | `email` | Mobile-money reversal or tax-penalty wording matches | `local_scam_terms` | 0.30 | 0.70 |
| `FORWARD-001` | `forwarding` | Forwarding is enabled, external, and not authorised | target domain and three flags | 0.70 | 0.95 |
| `SIGNIN-001` | `signin` | Any of unusual, new device, impossible travel, or high risk is true | country/device/travel/risk fields | 0.65 | 0.80 |
| `MFA-001` | `mfa` | MFA is disabled | enabled flag, method count | 0.60 | 0.99 |
| `OAUTH-001` | `oauth_grant` | Grant is broad or application is unverified | app, broad/verified flags, scope categories | 0.80 | 0.90 |

### Configured catalogues

Urgent/credential phrases:

```text
urgent
immediately
verify your account
password expires
account suspended
click here
confirm your identity
```

Known shorteners: `bit.ly`, `tinyurl.com`, `t.co`, `ow.ly`, and `is.gd`.
Suffix matching is label-aware: `go.bit.ly` matches, while
`bit.ly.evil.example` does not.

Credential-themed labels are ignored on the small built-in trusted-host list
(`accounts.google.com`, Microsoft sign-in hosts, and `appleid.apple.com`).
Lookalike checks use DNS-sized inputs and a threshold-banded edit-distance
algorithm so adversarial strings cannot trigger unbounded quadratic work.

Broad OAuth categories currently recognise scope strings containing
`mail.google.com`, `gmail.modify`, `gmail.readonly`, `drive`, or
`admin.directory.user`. The stored signal contains categories, not a token.

## Normalisation

For Gmail samples, authentication failures are extracted from the first
`Authentication-Results` header only when its service is `mx.google.com`.
This is provider header evidence, not independent SPF/DKIM/DMARC verification.
Unknown checks remain unknown. No URL reputation fetch or attachment analysis
is performed. Known supplied authentication results are retained alongside failures.
The new payment rule adds an `all_nonempty` matcher; existing weights remain unchanged.

All configured rules operate on normalised features:

- mailbox addresses and hosts are lower-cased and stripped of trailing dots;
- email text is reduced to configured phrases that matched;
- URLs are reduced to de-duplicated hostnames and are never opened;
- `sign_in` is canonicalised to `signin`;
- forwarding status and OAuth scope data are converted to bounded flags and
  categories;
- unknown fields are rejected; persistence stores only the defined, bounded
  feature set.

The minimum finding threshold is `0.10`. All seeded rules exceed it.

## Persistent incident scoring

For finding weights `w1 ... wn`, the combined score is:

```text
1 - ((1 - w1) * (1 - w2) * ... * (1 - wn))
```

The implementation clamps weights to `0..1` and rounds to four decimal places.
It applies the same operation to finding confidence values to produce the
incident confidence field. Score and confidence are distinct: score controls
severity; confidence reports how strongly the configured detectors support
their own matches.

Example:

```text
OAUTH-001 (0.80) + EMAIL-002 (0.30)
= 1 - ((1 - 0.80) * (1 - 0.30))
= 0.86, critical
```

| Combined score | Severity |
|---:|---|
| 0.00–0.2999 | `low` |
| 0.30–0.5999 | `medium` |
| 0.60–0.7999 | `high` |
| 0.80–1.00 | `critical` |

The Chapter 4 label “Low 0.10–0.29” refers to the minimum finding threshold.
The API also maps an empty `0.00` dry-run result to `low`.

## Correlation

A matching signal creates or updates an incident only when all of these are
true:

1. tenant and account match;
2. the correlation key matches;
3. the event falls within 30 minutes of the incident time range;
4. the existing incident is not a false positive.

Callers can provide a correlation key. Otherwise it is derived as follows:

| Signal | Default key source |
|---|---|
| Email | sender domain |
| Forwarding | forwarding target domain |
| Sign-in | source IP |
| MFA | enabled value |
| OAuth grant | application ID |

If a key field is empty, the signal type becomes the fallback key. New related
evidence recalculates score, confidence, severity, explanation, and
recommendations. If the matching incident was resolved, it reopens as
`under_review` and records an audit event.

## Incident lifecycle

| Current state | Allowed next state |
|---|---|
| `new` | `under_review`, `false_positive` |
| `under_review` | `resolved`, `false_positive` |
| `resolved` | `under_review` |
| `false_positive` | none |

Invalid transitions return HTTP `409`. A false-positive incident is terminal
and is excluded from later correlation; matching evidence can therefore create
a new incident for subsequent activity.

## Legacy compatibility analysis

`POST /analyze` predates the persistent platform. It runs four email/URL rules
with weights 25, 20, 20, and 25, adds them, caps at 100, and maps severity at
25, 55, and 80. It exists for backward compatibility and the original fixture.
It does not persist or correlate results. Use `/api/v1` for platform workflows.

## Catalogue and historical observations

The dashboard detection catalogue reads the current persisted configuration
through `GET /api/v1/rules`. It is read-only and does not alter matcher logic or
weights. Evidence browsing reads stored observations and copied findings without
re-evaluating them. A false lookalike/brand flag means it was not flagged in the
stored inputs; absent trusted-domain/brand context is not proof of legitimacy.

## Adding or changing rules

The database stores rule configuration, but matcher implementations are a
reviewed code boundary. A rule change must include:

- normal, boundary, and benign test cases;
- a review of persisted evidence and privacy impact;
- score and false-positive implications;
- a version update where interpretation changes;
- updates to this catalogue and the traceability matrix.


## Payment redirection indicator

Change phrases: `new bank details`, `updated bank details`, `change bank account`,
`change of bank details`, `update payment details`, `new payment instructions`.
Action phrases: `wire transfer`, `bank transfer`, `transfer the payment`,
`send payment`, `pay the invoice`, `payment to`. Both groups must match in the
subject/body. Case folding and word boundaries apply. A legitimate payment change
can match, and wording outside the catalogue can evade this indicator. It is not
a fraud verdict. Only the matched catalogue phrases are retained, and guidance
asks the reviewer to confirm through a previously trusted contact. New seeded
rules are added without overwriting existing stored rules or re-scoring history.


## Trusted senders and first contact

Version 2 of `EMAIL-001`, `EMAIL-002`, `URL-001` and `URL-002` (and `EMAIL-008`)
carry `"suppress_if": ["trusted_sender"]`. Migration `c3f1a7d2e9b4` upgrades
seeded version-1 rows; other rule versions are left untouched.

At ingestion each email gets three context features, stored as booleans and
never re-evaluated later:

- `trusted_sender` is true when the sender address, or its domain or a parent
  domain, is on the workspace list **and** no SPF/DKIM/DMARC failure was
  observed. A failed check means the From address may be forged.
- `first_contact` is true when no earlier message from the same address exists
  for that account. History stores an account-salted SHA-256 digest, the
  earliest time seen and a count. Samples that arrive newest-first are handled
  by comparing times. A trusted sender is never a first contact.
- Trusted domains and the domains of trusted addresses are added to
  `claimed_domains`, so `EMAIL-003` flags lookalikes of real suppliers.

Shared mail providers (`gmail.com`, `outlook.com` and similar) cannot be trusted
as whole domains; only exact addresses. Authentication, lookalike, brand and
payment-redirection rules always run because a trusted supplier's mailbox can be
compromised. `EMAIL-007` needs a payment-change phrase: a new sender alone is not
an indicator, which avoids flagging every sender on a first Gmail scan.

## Kenya-localised catalogues

Brand domains (checked against each organisation's public website, October 2026):
`safaricom.co.ke`, `kra.go.ke`, `ecitizen.go.ke`, `equitybank.com`,
`equitybank.co.ke`, `kcbgroup.com`, `co-opbank.co.ke`. Display-name aliases use
whole phrases (`equity bank`, not `equity`) so unrelated newsletters do not
match. `m-pesa` and `m pesa` fold to `mpesa` before matching. Brands that send
through third-party mailing services can trigger `EMAIL-004`; add those senders
to the trusted list after verification.

Payment-change additions: `new paybill`, `new paybill number`, `new till number`,
`change of paybill`, `paybill has changed`, `till number has changed`. Action
additions: `pay via mpesa`, `pay through mpesa`, `paybill number`, `till number`,
`account number`.

`EMAIL-008` phrases: `mpesa reversal`, `reverse the transaction`, `sent to you by
mistake`, `sent by mistake`, `kra penalty`, `tax refund`, `itax account
suspended`, `fuliza limit`. These also occur in legitimate mail; the rule is a
low-weight review indicator.

## Explanation reasons

Each template explanation lists one entry per matched rule with `why`
(feature-based) and `legitimate_if` (counterfactual), following the finding that
feature-based warnings help on real phishing while counterfactual ones reduce
false alarms (Cau et al., 2025, arXiv:2507.07916). `warning_signs` counts distinct
indicators; one sign is labelled "few" with advice to verify rather than judge by
appearance. This borrows the idea behind the NIST Phish Scale but is not that
scale. A local-model rewrite keeps these fields unchanged.
