# Local processing benchmark

## Email-only HTTP-to-dashboard acceptance — 5 October 2026

One run on the same Windows 11/i5/8-GB development host used a fresh isolated
controlled SQLite database and the actual FastAPI HTTP server and production
React dashboard. Input: 500 synthetic emails, 250 stipulated suspicious and 250
benign, 50 correlation groups. Migrations/account/source/job setup were excluded;
there was no warm-up. Other development checks were active during the run.

| Measure | Result |
|---|---:|
| HTTP ingestion | 24.6979 seconds |
| HTTP incident/evidence queries | 2.599 seconds |
| Ingestion start to visually verified dashboard result | 113.963 seconds |
| Retained emails / findings / incidents | 500 / 500 / 50 |
| Repeat duplicates / new findings / failures | 500 / 0 / 0 |

The console visibly showed 500 retained signals, 50 incidents and completed job
counts; Evidence workspace showed `1–25 of 500`, including no-match messages.
Timing includes manual navigation and browser/tool observation latency. This
passes NFR-07 for this one controlled run; it does not establish concurrent,
large-database, live Gmail or production throughput. See [raw controlled report](evidence/dashboard-benchmark-2026-10-05.json).

Reproduce against a separate controlled server/database with
`uv run python -m scripts.benchmark_dashboard --tenant acceptance --output
data/dashboard-benchmark.json`, then visually check the dashboard and execute
the same command with `--confirm-visible`. Do not confirm without observing the
result. Account/source metadata is generated afresh; no real mail is used.

The measurements below are historical service-only runs from 4 October, before
the added audit/worker changes, and are retained as the earlier baseline.

Measured 4 October 2026 at 07:46:16 UTC on Windows 11
(`Windows-11-10.0.26300-SP0`), Python 3.13.7. This records local service processing
and query time; it is not a Gmail, browser, HTTP or concurrency benchmark.
Hardware: Intel Core i5-8250U at 1.60 GHz, 8 logical processors, approximately
7.8 GiB installed RAM reported by Windows.

## Reproduce

```bash
uv sync --dev --frozen
uv run python -m app.benchmark --runs 3
```

The command generates synthetic data and applies migrations to a fresh temporary
SQLite database for each run. It does not ingest into the configured application
database. Temporary engines are disposed and the original configuration is
restored. The JSON output contains the measured OS, Python version, input hash,
counts and timings. Keep real evaluation exports outside the repository.

Input: 500 records, 100 each of email, forwarding, sign-in, MFA and OAuth grant;
half of each type are suspicious controlled cases. Fifty correlation groups
produce 300 findings and 50 incidents. No warm-up is performed; migrations and
account/source creation are excluded from timing. The two query calls fetch the
first 25 incidents and first 25 evidence records. The final ingestion repeats
the same 500 source/external IDs to measure duplicate handling.

Input SHA-256:
`f7ea8cf902726e78dc59a7ea87c9d87d7a168b26ccd8d62653894ed2b47c6439`

| Run | Ingest 500 (s) | Incident + evidence queries (s) | Duplicate repeat (s) | Imported / findings / incidents / duplicates |
|---:|---:|---:|---:|---|
| 1 | 4.5720 | 0.0490 | 0.9862 | 500 / 300 / 50 / 500 |
| 2 | 3.3816 | 0.0256 | 0.9211 | 500 / 300 / 50 / 500 |
| 3 | 4.8240 | 0.0797 | 2.3661 | 500 / 300 / 50 / 500 |

Median ingestion: **4.572 seconds**. All three runs completed without a failed
batch or unexpected count. The process-level acceptance test also checks that
the configured persistent database is not used.

## Interpretation

These results demonstrate adequate local processing speed for this synthetic
mix on this computer. They provide partial evidence toward Chapter 4 NFR-07.
That requirement specifically calls for 500 prepared message records becoming
visible in the dashboard within five minutes. The email-only HTTP-to-dashboard acceptance above now supplies that evidence for one controlled run. Google latency/quotas, browser
rendering, concurrent users, large database behaviour and PostgreSQL performance
were not measured. Synthetic cases do not establish detection accuracy or
commercial throughput.
