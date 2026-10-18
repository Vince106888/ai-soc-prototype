import type {
  Account,
  CapabilityProfile,
  Credentials,
  Incident,
  IncidentFilters,
  IncidentStatus,
  ScanRequest,
  ScanJob,
  ScanSchedule,
  Source,
  Overview,
  IngestionResult,
  Page,
  EvidenceItem,
  EvidenceDetail,
  DetectionRule,
  AuthSession,
  TrustChoice,
  TrustedSender,
  PostureAnswers,
  PostureResult,
} from './types'
import { ApiError } from './types'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

function messageFrom(body: unknown, fallback: string): { message: string; code?: string } {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    if (record.error && typeof record.error === 'object') {
      const error = record.error as Record<string, unknown>
      return {
        message: typeof error.message === 'string' ? error.message : fallback,
        code: typeof error.code === 'string' ? error.code : undefined,
      }
    }
    if (typeof record.detail === 'string') return { message: record.detail }
    if (typeof record.message === 'string') return { message: record.message }
  }
  return { message: fallback }
}

async function request<T>(path: string, credentials: Credentials, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(credentials.apiKey ? { 'X-API-Key': credentials.apiKey } : {}),
        'X-Tenant-ID': credentials.tenantId,
        ...(credentials.csrfToken ? { 'X-CSRF-Token': credentials.csrfToken } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new ApiError('Could not reach the SentinelSME API. Check that the service is running.', 0)
  }

  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && credentials.csrfToken) window.dispatchEvent(new Event('sentinelsme:session-expired'))
    const parsed = messageFrom(body, `Request failed (${response.status})`)
    throw new ApiError(parsed.message, response.status, parsed.code)
  }
  return body as T
}

function arrayFrom<T>(body: T[] | { items?: T[] } | null | undefined): T[] {
  if (Array.isArray(body)) return body
  return body?.items ?? []
}

export const api = {
  schedule(credentials: Credentials, sourceId: string, signal?: AbortSignal): Promise<ScanSchedule | null> {
    return request(`/api/v1/sources/${encodeURIComponent(sourceId)}/schedule`, credentials, { signal })
  },
  saveSchedule(credentials: Credentials, sourceId: string, settings: { enabled: boolean; acknowledged: boolean; interval_minutes: number; maximum_messages: number; recent_days: number }): Promise<ScanSchedule> {
    return request(`/api/v1/sources/${encodeURIComponent(sourceId)}/schedule`, credentials, { method: 'PUT', body: JSON.stringify(settings) })
  },
  session(signal?: AbortSignal): Promise<AuthSession> {
    return request('/api/v1/auth/session', { apiKey: '', tenantId: '' }, { signal })
  },
  login(): Promise<{ authorization_url: string }> {
    return request('/api/v1/auth/login', { apiKey: '', tenantId: '' }, { method: 'POST' })
  },
  logout(credentials: Credentials): Promise<void> {
    return request('/api/v1/auth/logout', credentials, { method: 'POST' })
  },
  rules(credentials: Credentials, signal?: AbortSignal): Promise<DetectionRule[]> {
    return request('/api/v1/rules', credentials, { signal })
  },
  allSources(credentials: Credentials, signal?: AbortSignal): Promise<Source[]> {
    return request('/api/v1/sources', credentials, { signal })
  },
  evidence(credentials: Credentials, filters: { accountId: string; signalType: string; hasFindings: string; search: string; offset: number }, signal?: AbortSignal): Promise<Page<EvidenceItem>> {
    const query = new URLSearchParams({ limit: '25', offset: String(filters.offset) })
    if (filters.accountId) query.set('account_id', filters.accountId)
    if (filters.signalType) query.set('signal_type', filters.signalType)
    if (filters.hasFindings) query.set('has_findings', filters.hasFindings)
    if (filters.search.trim()) query.set('search', filters.search.trim())
    return request(`/api/v1/signals?${query}`, credentials, { signal })
  },
  evidenceDetail(credentials: Credentials, id: string, signal?: AbortSignal): Promise<EvidenceDetail> {
    return request(`/api/v1/signals/${encodeURIComponent(id)}`, credentials, { signal })
  },
  incidentPage(credentials: Credentials, filters: IncidentFilters, signal?: AbortSignal): Promise<Page<Incident>> {
    const query = new URLSearchParams({ limit: '25', offset: String(filters.offset ?? 0) })
    if (filters.severity) query.set('severity', filters.severity)
    if (filters.status) query.set('status', filters.status)
    if (filters.q.trim()) query.set('search', filters.q.trim())
    if (filters.accountId) query.set('account_id', filters.accountId)
    if (filters.openOnly) query.set('open_only', 'true')
    if (filters.seenFrom) query.set('seen_from', new Date(filters.seenFrom).toISOString())
    if (filters.seenTo) query.set('seen_to', new Date(filters.seenTo).toISOString())
    return request(`/api/v1/incidents/page?${query}`, credentials, { signal })
  },
  overview(credentials: Credentials, signal?: AbortSignal): Promise<Overview> {
    return request('/api/v1/overview', credentials, { signal })
  },
  deleteAccount(credentials: Credentials, accountId: string): Promise<void> {
    return request(`/api/v1/accounts/${encodeURIComponent(accountId)}`, credentials, { method: 'DELETE' })
  },
  gmailConsent(credentials: Credentials, email: string, acknowledged: boolean): Promise<{ authorization_url: string }> {
    return request('/api/v1/gmail/consent', credentials, { method: 'POST', body: JSON.stringify({ email, acknowledged }) })
  },
  gmailScan(credentials: Credentials, sourceId: string, maximumMessages: number, recentDays: number, acknowledged: boolean): Promise<{ examined_count: number; imported_count: number; duplicate_count: number; finding_count: number }> {
    return request('/api/v1/gmail/scan', credentials, { method: 'POST', body: JSON.stringify({ source_id: sourceId, maximum_messages: maximumMessages, recent_days: recentDays, acknowledged }) })
  },
  disconnectGmail(credentials: Credentials, sourceId: string): Promise<{ message: string }> {
    return request(`/api/v1/gmail/sources/${encodeURIComponent(sourceId)}/disconnect`, credentials, { method: 'POST' })
  },
  async incidents(credentials: Credentials, filters: IncidentFilters, signal?: AbortSignal): Promise<Incident[]> {
    const query = new URLSearchParams()
    if (filters.severity) query.set('severity', filters.severity)
    if (filters.status) query.set('status', filters.status)
    if (filters.q.trim()) query.set('search', filters.q.trim())
    if (filters.accountId) query.set('account_id', filters.accountId)
    const suffix = query.size ? `?${query}` : ''
    const body = await request<Incident[] | { items: Incident[] }>(
      `/api/v1/incidents${suffix}`,
      credentials,
      { signal },
    )
    return arrayFrom(body)
  },

  incident(credentials: Credentials, id: string, signal?: AbortSignal): Promise<Incident> {
    return request(`/api/v1/incidents/${encodeURIComponent(id)}`, credentials, { signal })
  },

  updateStatus(credentials: Credentials, id: string, status: IncidentStatus, note?: string, trustSender: TrustChoice = 'none'): Promise<Incident> {
    return request(`/api/v1/incidents/${encodeURIComponent(id)}/status`, credentials, {
      method: 'PATCH',
      body: JSON.stringify({ status, actor: 'console-user', ...(note?.trim() ? { note: note.trim() } : {}), ...(trustSender !== 'none' ? { trust_sender: trustSender } : {}) }),
    })
  },

  postureCheck(credentials: Credentials, accountId: string, answers: PostureAnswers): Promise<PostureResult> {
    return request(`/api/v1/accounts/${encodeURIComponent(accountId)}/posture-check`, credentials, { method: 'POST', body: JSON.stringify(answers) })
  },

  trustedSenders(credentials: Credentials, signal?: AbortSignal): Promise<TrustedSender[]> {
    return request('/api/v1/trusted-senders', credentials, { signal })
  },

  addTrustedSender(credentials: Credentials, payload: { kind: 'address' | 'domain'; value: string; note?: string }): Promise<TrustedSender> {
    return request('/api/v1/trusted-senders', credentials, { method: 'POST', body: JSON.stringify(payload) })
  },

  removeTrustedSender(credentials: Credentials, id: string): Promise<void> {
    return request(`/api/v1/trusted-senders/${encodeURIComponent(id)}`, credentials, { method: 'DELETE' })
  },

  explainIncident(credentials: Credentials, id: string): Promise<Incident> {
    return request(`/api/v1/incidents/${encodeURIComponent(id)}/explanation`, credentials, { method: 'POST' })
  },

  async accounts(credentials: Credentials, signal?: AbortSignal): Promise<Account[]> {
    const body = await request<Account[] | { items: Account[] }>('/api/v1/accounts', credentials, { signal })
    return arrayFrom(body)
  },

  capabilities(credentials: Credentials, signal?: AbortSignal): Promise<CapabilityProfile> {
    return request<CapabilityProfile>(
      '/api/v1/capabilities',
      credentials,
      { signal },
    )
  },

  async sources(credentials: Credentials, accountId: string, signal?: AbortSignal): Promise<Source[]> {
    const body = await request<Source[] | { items: Source[] }>(
      `/api/v1/accounts/${encodeURIComponent(accountId)}/sources`,
      credentials,
      { signal },
    )
    return arrayFrom(body).map((source) => ({ ...source, account_id: source.account_id ?? accountId }))
  },

  updateSourceStatus(credentials: Credentials, sourceId: string, status: 'active' | 'disconnected'): Promise<Source> {
    return request(`/api/v1/sources/${encodeURIComponent(sourceId)}`, credentials, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  },

  createAccount(credentials: Credentials, payload: { email: string; display_name?: string; provider: 'controlled' | 'google'; profile: 'controlled' | 'personal_gmail' | 'workspace_admin' }): Promise<Account> {
    return request('/api/v1/accounts', credentials, { method: 'POST', body: JSON.stringify(payload) })
  },

  createSource(credentials: Credentials, accountId: string, payload: { source_type: 'controlled' | 'gmail' | 'workspace'; name: string; external_id: string; capabilities: string[] }): Promise<Source> {
    return request(`/api/v1/accounts/${encodeURIComponent(accountId)}/sources`, credentials, { method: 'POST', body: JSON.stringify(payload) })
  },

  scan(credentials: Credentials, payload: ScanRequest): Promise<{ id?: string; status?: string; message?: string }> {
    return request('/api/v1/scan-jobs', credentials, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async scanJobs(credentials: Credentials, signal?: AbortSignal): Promise<ScanJob[]> {
    const body = await request<ScanJob[] | { items: ScanJob[] }>('/api/v1/scan-jobs', credentials, { signal })
    return arrayFrom(body)
  },

  retryScan(credentials: Credentials, jobId: string): Promise<ScanJob> {
    return request(`/api/v1/scan-jobs/${encodeURIComponent(jobId)}/retry`, credentials, { method: 'POST' })
  },

  ingestSignals(credentials: Credentials, sourceId: string, payload: { scan_job_id?: string; signals: Array<{ external_id: string; signal_type: 'email' | 'forwarding' | 'signin' | 'mfa' | 'oauth_grant'; occurred_at?: string; correlation_key?: string; features: Record<string, unknown> }> }): Promise<IngestionResult> {
    return request(`/api/v1/sources/${encodeURIComponent(sourceId)}/signals`, credentials, { method: 'POST', body: JSON.stringify(payload) })
  },
}
