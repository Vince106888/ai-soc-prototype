import type {
  Account,
  CapabilityProfile,
  Credentials,
  Incident,
  IncidentFilters,
  IncidentStatus,
  ScanRequest,
  Source,
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
      headers: {
        Accept: 'application/json',
        'X-API-Key': credentials.apiKey,
        'X-Tenant-ID': credentials.tenantId,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new ApiError('Could not reach the SentinelSME API. Check that the service is running.', 0)
  }

  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
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
  async incidents(credentials: Credentials, filters: IncidentFilters, signal?: AbortSignal): Promise<Incident[]> {
    const query = new URLSearchParams()
    if (filters.severity) query.set('severity', filters.severity)
    if (filters.status) query.set('status', filters.status)
    if (filters.q.trim()) query.set('search', filters.q.trim())
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

  updateStatus(credentials: Credentials, id: string, status: IncidentStatus, note?: string): Promise<Incident> {
    return request(`/api/v1/incidents/${encodeURIComponent(id)}/status`, credentials, {
      method: 'PATCH',
      body: JSON.stringify({ status, actor: 'console-user', ...(note?.trim() ? { note: note.trim() } : {}) }),
    })
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

  ingestSignals(credentials: Credentials, sourceId: string, payload: { scan_job_id?: string; signals: Array<{ external_id: string; signal_type: 'email' | 'forwarding' | 'signin' | 'mfa' | 'oauth_grant'; occurred_at?: string; correlation_key?: string; features: Record<string, unknown> }> }): Promise<{ items?: unknown[] }> {
    return request(`/api/v1/sources/${encodeURIComponent(sourceId)}/signals`, credentials, { method: 'POST', body: JSON.stringify(payload) })
  },
}
