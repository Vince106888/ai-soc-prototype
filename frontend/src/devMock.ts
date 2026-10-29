/**
 * Development-only synthetic API for visual review (`npm run dev`, then `/?mock=1`).
 * Loaded through a dynamic import guarded by `import.meta.env.DEV`, so it is not part
 * of the production bundle. All data is invented; nothing leaves the browser.
 */

const now = Date.UTC(2026, 9, 29, 9, 30)
const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString()

const makeIncident = (id: string, title: string, severity: string, status: string, score: number, minutes: number, rules: Array<[string, string, number]>) => ({
  id,
  title,
  summary: `${rules.length} evidence-backed finding(s) were correlated.`,
  account_id: 'account-1',
  account_name: 'owner@example.test',
  severity,
  status,
  score,
  first_seen_at: iso(minutes + 5),
  last_seen_at: iso(minutes),
  correlation_key: `account-1:thread-${id}`,
  findings: rules.map(([code, name, weight]) => ({
    id: `${id}-${code}`,
    rule_code: code,
    title: name,
    weight,
    confidence: 0.8,
    evidence: code === 'EMAIL-002' ? { matched_terms: ['urgent', 'verify your account'] } : { host: 'login.example.org' },
  })),
  explanation: {
    source: 'template',
    what_happened: 'The message combines pressure wording with a credential-themed link.',
    why_it_matters: 'People are often rushed into signing in on a page that is not the real service.',
    severity: severity === 'critical' ? 'Critical priority' : 'High priority',
    next_step: 'Verify the sender through a separate trusted channel before opening the link.',
    reasons: rules.map(([code, name]) => ({ rule_code: code, indicator: name, why: 'This pattern is common in phishing.', legitimate_if: 'The sender is a known service you expect to hear from.' })),
    warning_signs: rules.length,
    warning_level: rules.length > 2 ? 'many' : 'some',
  },
  recommendations: [{ position: 1, action: 'Do not open the link yet.', advisory: true }, { position: 2, action: 'Verify the sender through a trusted contact.', advisory: true }],
  signals: [{ id: `${id}-signal`, signal_type: 'email', occurred_at: iso(minutes), received_at: iso(minutes), features: { sender: 'support@example.test', subject: 'Urgent: verify your account' } }],
  audit: [{ id: `${id}-audit`, action: 'incident_created', actor: 'system', detail: 'Incident created from correlated deterministic findings.', created_at: iso(minutes) }],
})

const incidents = [
  makeIncident('inc-1', 'Credential-themed domain', 'critical', 'new', 0.91, 12, [['EMAIL-002', 'Urgent or credential-seeking language', 0.5], ['URL-002', 'Credential-themed domain', 0.65], ['EMAIL-008', 'Mobile-money or tax pressure wording', 0.3]]),
  makeIncident('inc-2', 'Reply-to domain mismatch', 'high', 'under_review', 0.68, 95, [['EMAIL-001', 'Reply-to domain mismatch', 0.6], ['EMAIL-002', 'Urgent or credential-seeking language', 0.4]]),
  makeIncident('inc-3', 'Payment redirection request', 'medium', 'new', 0.45, 340, [['EMAIL-006', 'Payment redirection request', 0.5]]),
  makeIncident('inc-4', 'Shortened URL', 'low', 'resolved', 0.2, 1500, [['URL-001', 'Shortened URL', 0.2]]),
]

const rules = [
  ['EMAIL-001', 'Reply-to domain mismatch', 'email', 0.6], ['EMAIL-002', 'Urgent or credential-seeking language', 'email', 0.5],
  ['EMAIL-005', 'Email authentication failed', 'email', 0.55], ['EMAIL-006', 'Payment redirection request', 'email', 0.5],
  ['URL-002', 'Credential-themed domain', 'email', 0.65], ['MFA-001', 'MFA disabled for account', 'mfa', 0.7],
].map(([code, title, signal_type, weight]) => ({ code, title, signal_type, weight, confidence: 0.85, enabled: true, version: 1, configuration: {} }))

const alerts = [
  { id: 'al-1', incident_id: 'inc-1', severity: 'critical', title: 'Credential-themed domain', score: 0.91, rule_codes: ['EMAIL-002', 'EMAIL-008', 'URL-002'], webhook_status: 'sent', read: false, created_at: iso(11) },
  { id: 'al-2', incident_id: 'inc-2', severity: 'high', title: 'Reply-to domain mismatch', score: 0.68, rule_codes: ['EMAIL-001', 'EMAIL-002'], webhook_status: 'none', read: true, created_at: iso(94) },
]

const gmailSource = { id: 'source-gmail', account_id: 'account-1', name: 'owner@example.test (Gmail)', source_type: 'gmail', status: 'active', capabilities: ['email'], last_scan_at: iso(14) }
const controlledSource = { id: 'source-1', account_id: 'account-1', name: 'Selected messages', source_type: 'controlled', status: 'active', capabilities: ['email'] }

const responses: Record<string, unknown> = {
  '/auth/session': { mode: 'google', configured: true, invitation_only: false, environment: 'production', session_hours: 8, evidence_retention_days: 30, csrf_token: 'mock', mailbox_consent_separate: true, user: { id: 'mock-user', email: 'owner@example.test', workspace_id: 'mock-workspace' } },
  '/accounts': [{ id: 'account-1', email: 'owner@example.test', display_name: 'Example workspace', provider: 'google' }],
  '/sources': [controlledSource, gmailSource],
  '/scan-jobs': [{ id: 'job-1', source_id: 'source-gmail', trigger: 'schedule', status: 'completed', attempts: 1, imported_count: 18, duplicate_count: 4, finding_count: 6, created_at: iso(14), completed_at: iso(14) }],
  '/capabilities': { service: 'SentinelSME', signal_types: ['email'], source_types: ['controlled', 'gmail'], live_connectors: ['gmail'], controlled_ingestion: true, template_explanations: true, ai_explanations: false, correlation_window_minutes: 30, maximum_batch_size: 500, privacy: { stores_full_bodies: false, stores_attachments: false }, gmail: { implemented: true, configured: true, message: 'Ready', scope: 'gmail.readonly', maximum_messages: 50, signal_types: ['email'], automatic_scanning: true, trial: false, evidence_retention_days: 30 } },
  '/overview': { incidents: { active: 3, critical: 1, under_review: 1, resolved: 1, false_positive: 0 }, accounts: 1, active_sources: 2, retained_signals: 42, source_activity: { 'source-gmail': { signal_count: 36, last_received_at: iso(14) } }, latest_job: { status: 'completed', completed_at: iso(14), imported_count: 18 }, activity: Array.from({ length: 7 }, (_, index) => ({ day: `2026-10-${23 + index}`, signals: [3, 8, 5, 12, 7, 15, 9][index], incidents: [0, 1, 0, 2, 1, 2, 1][index] })) },
  '/incidents/page': { items: incidents, total: incidents.length, limit: 25, offset: 0 },
  '/rules': rules,
  '/trusted-senders': [],
  '/signals': { items: [], total: 0, limit: 25, offset: 0 },
  '/sources/source-gmail/schedule': { source_id: 'source-gmail', enabled: true, interval_minutes: 60, maximum_messages: 20, recent_days: 7, next_run_at: iso(-42), failure_count: 0, last_job_id: 'job-1', updated_at: iso(300) },
  '/alert-settings': { minimum_severity: 'high', webhook_enabled: true, webhook_url: 'https://hooks.example.com/sentinel' },
  '/alerts': alerts,
}
for (const item of incidents) responses[`/incidents/${item.id}`] = item

export function installMockApi() {
  if (new URLSearchParams(window.location.search).get('mock') === 'out') (responses['/auth/session'] as { user: unknown }).user = null
  const original = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin)
    if (!url.pathname.startsWith('/api/')) return original(input, init)
    const path = url.pathname.replace('/api/v1', '')
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && !path.endsWith('/read')) {
      return new Response(JSON.stringify({ detail: 'Changes are disabled in the visual-review mock.' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
    }
    if (method === 'POST') return new Response(null, { status: 204 })
    const body = path in responses ? responses[path] : path.startsWith('/audit') ? [] : null
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}
