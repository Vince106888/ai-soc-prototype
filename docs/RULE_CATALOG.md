# Detection Rule Catalogue

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

## Adding or changing rules

The database stores rule configuration, but matcher implementations are a
reviewed code boundary. A rule change must include:

- normal, boundary, and benign test cases;
- a review of persisted evidence and privacy impact;
- score and false-positive implications;
- a version update where interpretation changes;
- updates to this catalogue and the traceability matrix.
