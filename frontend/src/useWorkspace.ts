import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { Account, CapabilityProfile, Credentials, Incident, IncidentFilters, Overview, ScanJob, Source } from './types'
import { failureMessage } from './ui/hooks'
import { prioritizeIncidents } from './utils'

export interface WorkspaceSnapshot {
  key: string
  incidents: Incident[]
  incidentTotal: number
  incidentError: string
  priority: Incident[]
  priorityError: string
  accounts: Account[]
  sources: Source[]
  jobs: ScanJob[]
  capabilities: CapabilityProfile | null
  overview: Overview | null
  supportError: string
}

const OPEN_ONLY: IncidentFilters = { severity: '', status: '', q: '', openOnly: true }

function keyFor(credentials: Credentials, filters: IncidentFilters) {
  return JSON.stringify([credentials.tenantId, credentials.apiKey, credentials.csrfToken ?? '', filters])
}

async function load(credentials: Credentials, filters: IncidentFilters, key: string, signal?: AbortSignal): Promise<WorkspaceSnapshot> {
  const [incidentResult, accountResult, capabilityResult, scanResult, overviewResult, priorityResult, sourceResult] = await Promise.allSettled([
    api.incidentPage(credentials, filters, signal),
    api.accounts(credentials, signal),
    api.capabilities(credentials, signal),
    api.scanJobs(credentials, signal),
    api.overview(credentials, signal),
    api.incidentPage(credentials, OPEN_ONLY, signal),
    api.allSources(credentials, signal),
  ])
  const support: string[] = []
  const value = <T,>(result: PromiseSettledResult<T>, fallback: T, message: string): T => {
    if (result.status === 'fulfilled') return result.value
    if (failureMessage(result.reason, message)) support.push(message)
    return fallback
  }
  const incidentPage = incidentResult.status === 'fulfilled' ? incidentResult.value : null
  const priorityPage = priorityResult.status === 'fulfilled' ? priorityResult.value : null
  const snapshot: WorkspaceSnapshot = {
    key,
    incidents: incidentPage ? prioritizeIncidents(incidentPage.items) : [],
    incidentTotal: incidentPage?.total ?? 0,
    incidentError: incidentPage ? '' : failureMessage(incidentResult.status === 'rejected' ? incidentResult.reason : null, 'Unable to load incidents.'),
    priority: priorityPage ? prioritizeIncidents(priorityPage.items) : [],
    priorityError: priorityPage ? '' : 'The review queue is unavailable. Refresh to try again.',
    accounts: value(accountResult, [], 'Some account coverage data is unavailable.'),
    sources: value(sourceResult, [], 'Source coverage is unavailable.'),
    jobs: value(scanResult, [], 'Some source or scan-history data is unavailable.'),
    capabilities: value(capabilityResult, null, 'Some account and capability data is unavailable.'),
    overview: value(overviewResult, null, 'Workspace totals are unavailable. Try refreshing.'),
    supportError: '',
  }
  if (!priorityPage) support.push('The review queue is unavailable.')
  snapshot.supportError = support[support.length - 1] ?? ''
  return snapshot
}

/**
 * Workspace data for the console. A response is applied only while its
 * credentials and filters are still current, so switching tenants or filters
 * can never show another request's records.
 */
export function useWorkspace(credentials: Credentials, filters: IncidentFilters) {
  const key = credentials.tenantId ? keyFor(credentials, filters) : ''
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const current = useRef(key)
  useEffect(() => { current.current = key })

  const fetchFor = useCallback(async (requestKey: string, signal?: AbortSignal) => {
    const result = await load(credentials, filters, requestKey, signal)
    if (!signal?.aborted && current.current === requestKey) setSnapshot(result)
  }, [credentials, filters])

  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    void fetchFor(key, controller.signal)
    return () => controller.abort()
  }, [fetchFor, key])

  const refresh = useCallback(async () => {
    if (!key) return
    setRefreshing(true)
    try { await fetchFor(key) } finally { setRefreshing(false) }
  }, [fetchFor, key])

  const ready = snapshot !== null && snapshot.key === key
  /** Data from the same workspace stays visible while new filters load. */
  const sameTenant = snapshot !== null && JSON.parse(snapshot.key)[0] === credentials.tenantId && JSON.parse(snapshot.key)[1] === credentials.apiKey
  const visible = ready ? snapshot : sameTenant ? snapshot : null
  return {
    data: key ? visible : null,
    loading: Boolean(key) && !ready,
    refreshing,
    refresh,
    /** Apply a local change (for example a status update) until the next load. */
    patch: (update: (value: WorkspaceSnapshot) => WorkspaceSnapshot) => setSnapshot(value => value ? update(value) : value),
  }
}
