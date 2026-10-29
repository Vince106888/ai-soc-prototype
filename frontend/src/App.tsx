import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { AddSourceModal, type SourceDraft } from './AddSourceModal'
import { AlertsPanel } from './AlertsPanel'
import { ConnectionsPage } from './ConnectionsPage'
import { DetectionPage } from './DetectionPage'
import { type EmailDraft } from './EmailAnalysis'
import { EmailWorkspace } from './EmailWorkspace'
import { EvidenceWorkspace } from './EvidenceWorkspace'
import { FirstRunGuide, forgetGuideDismissed, rememberGuideDismissed, shouldShowGuide } from './FirstRunGuide'
import { Icons } from './icons'
import { IncidentsPage } from './IncidentsPage'
import { OverviewPanel } from './OverviewPanel'
import { readWorkspaceRoute, writeWorkspaceRoute, type AnalysisMethod, type DetectionTab, type WorkspaceView } from './routing'
import { DeleteAccountDataModal, LocalSettingsModal, SessionModal } from './SettingsDialogs'
import { Brand, InlineNotice, Panel, Toast } from './ui'
import type { Account, AuthSession, CapabilityProfile, Credentials, Incident, IncidentFilters, IncidentStatus, Overview, ScanJob, Source, TrustChoice } from './types'
import { prioritizeIncidents, telemetryCoverage } from './utils'

const KEY_STORAGE = 'sentinelsme.apiKey'
const TENANT_STORAGE = 'sentinelsme.tenantId'

function readSessionValue(key: string) {
  try { return sessionStorage.getItem(key) ?? '' } catch { return '' }
}

const emptyFilters = (): IncidentFilters => ({ severity: '', status: '', q: '', accountId: '', seenFrom: '', seenTo: '', openOnly: false, offset: 0 })

export default function App({ session, onSignOut, onLocalDisconnect }: { session?: AuthSession; onSignOut?: () => Promise<void>; onLocalDisconnect?: () => void }) {
  const initialRoute = useMemo(() => readWorkspaceRoute(), [])
  const [apiKey, setApiKey] = useState(() => session?.user ? '' : readSessionValue(KEY_STORAGE))
  const [tenantId, setTenantId] = useState(() => session?.user?.workspace_id ?? readSessionValue(TENANT_STORAGE))
  const [view, setView] = useState<WorkspaceView>(initialRoute.view)
  const [method, setMethod] = useState<AnalysisMethod>(initialRoute.method)
  const [detectionTab, setDetectionTab] = useState<DetectionTab>(initialRoute.detectionTab)
  const [filters, setFilters] = useState<IncidentFilters>({
    severity: initialRoute.severity,
    status: initialRoute.status,
    q: initialRoute.q,
    accountId: initialRoute.account,
    seenFrom: initialRoute.seenFrom,
    seenTo: initialRoute.seenTo,
    openOnly: initialRoute.openOnly,
    offset: 0,
  })
  const [searchText, setSearchText] = useState(initialRoute.q)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [incidentTotal, setIncidentTotal] = useState(0)
  const [priorityIncidents, setPriorityIncidents] = useState<Incident[]>([])
  const [priorityError, setPriorityError] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [capabilities, setCapabilities] = useState<CapabilityProfile | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [scanJobs, setScanJobs] = useState<ScanJob[]>([])
  const [selectedId, setSelectedId] = useState(initialRoute.incident)
  const [detail, setDetail] = useState<Incident | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [error, setError] = useState('')
  const [supportError, setSupportError] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [explainBusy, setExplainBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)
  const [operationBusy, setOperationBusy] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [compactNavigation, setCompactNavigation] = useState(() => window.matchMedia?.('(max-width: 900px)').matches ?? false)
  const [toast, setToast] = useState('')
  const [guideOpen, setGuideOpen] = useState(() => shouldShowGuide(session?.user?.workspace_id ?? readSessionValue(TENANT_STORAGE)))
  const navigationPanel = useRef<HTMLElement>(null)
  const navigationButton = useRef<HTMLButtonElement>(null)
  const credentials = useMemo<Credentials>(() => ({ apiKey, tenantId, ...(session?.user ? { csrfToken: session.csrf_token, userEmail: session.user.email } : {}) }), [apiKey, tenantId, session])
  const activeCredentials = useRef(credentials)
  activeCredentials.current = credentials

  const navigate = useCallback((next: WorkspaceView, options?: { method?: AnalysisMethod; tab?: DetectionTab }) => {
    setView(next)
    if (options?.method) setMethod(options.method)
    if (options?.tab) setDetectionTab(options.tab)
    setMenuOpen(false)
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    writeWorkspaceRoute({
      view,
      incident: view === 'incidents' ? selectedId : '',
      severity: filters.severity,
      status: filters.status,
      q: filters.q,
      account: filters.accountId ?? '',
      seenFrom: filters.seenFrom ?? '',
      seenTo: filters.seenTo ?? '',
      openOnly: Boolean(filters.openOnly),
      method,
      detectionTab,
    })
  }, [view, selectedId, filters, method, detectionTab])

  useEffect(() => {
    const handlePopState = () => {
      const route = readWorkspaceRoute()
      setView(route.view); setSelectedId(route.incident); setMethod(route.method); setDetectionTab(route.detectionTab)
      setFilters({ severity: route.severity, status: route.status, q: route.q, accountId: route.account, seenFrom: route.seenFrom, seenTo: route.seenTo, openOnly: route.openOnly, offset: 0 })
      setSearchText(route.q)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 900px)')
    if (!query) return
    const update = () => { setCompactNavigation(query.matches); if (!query.matches) setMenuOpen(false) }
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!compactNavigation || !menuOpen) return
    const opener = navigationButton.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const controls = navigationPanel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    const focusTimer = window.setTimeout(() => controls?.[0]?.focus(), 30)
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); return }
      if (event.key !== 'Tab' || !controls?.length) return
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handleKey)
    return () => { window.clearTimeout(focusTimer); document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handleKey); opener?.focus() }
  }, [compactNavigation, menuOpen])

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId) return
    setLoading(true); setError(''); setSupportError('')
    const current = credentials
    const results = await Promise.allSettled([
      api.incidentPage(current, filters, signal), api.accounts(current, signal), api.capabilities(current, signal),
      api.scanJobs(current, signal), api.overview(current, signal),
      api.incidentPage(current, { ...emptyFilters(), openOnly: true }, signal), api.allSources(current, signal),
    ])
    if (signal?.aborted || activeCredentials.current.tenantId !== current.tenantId || activeCredentials.current.apiKey !== current.apiKey) return
    const [incidentResult, accountResult, capabilityResult, scanResult, overviewResult, priorityResult, sourceResult] = results
    if (incidentResult.status === 'fulfilled') {
      const sorted = prioritizeIncidents(incidentResult.value.items)
      setIncidents(sorted); setIncidentTotal(incidentResult.value.total)
      setSelectedId((id) => id || sorted[0]?.id || '')
    } else if (incidentResult.reason?.name !== 'AbortError') setError(incidentResult.reason instanceof Error ? incidentResult.reason.message : 'Unable to load incidents.')
    if (accountResult.status === 'fulfilled') setAccounts(accountResult.value); else setSupportError('Some account data is unavailable.')
    if (capabilityResult.status === 'fulfilled') setCapabilities(capabilityResult.value); else setSupportError('Some capability data is unavailable.')
    if (scanResult.status === 'fulfilled') setScanJobs(scanResult.value); else setSupportError('Analysis history is unavailable.')
    if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value); else setSupportError('Workspace totals are unavailable.')
    if (priorityResult.status === 'fulfilled') { setPriorityIncidents(priorityResult.value.items); setPriorityError('') } else { setPriorityIncidents([]); setPriorityError('The review queue is unavailable. Refresh to try again.') }
    if (sourceResult.status === 'fulfilled') setSources(sourceResult.value); else setSupportError('Source coverage is unavailable.')
    setLoading(false)
  }, [credentials, filters, tenantId])

  useEffect(() => { const controller = new AbortController(); void fetchData(controller.signal); return () => controller.abort() }, [fetchData])

  useEffect(() => {
    if (!tenantId || !selectedId) { setDetail(null); setDetailError(''); return }
    const controller = new AbortController(); setDetailLoading(true); setDetailError('')
    api.incident(credentials, selectedId, controller.signal).then((result) => { if (!controller.signal.aborted) setDetail(result) }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setDetail(null); setDetailError(reason instanceof Error ? reason.message : 'Incident evidence is unavailable.')
    }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false) })
    return () => controller.abort()
  }, [credentials, selectedId, tenantId])

  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer) }, [toast])

  useEffect(() => {
    const callback = new URLSearchParams(window.location.search).get('gmail')
    if (!callback) return
    navigate('analyse', { method: 'gmail' })
    setToast(callback === 'connected' ? 'Gmail connected with read-only consent.' : callback === 'cancelled' ? 'Google consent was cancelled.' : 'Google consent failed or expired. Check setup and try again.')
    window.history.replaceState(null, '', window.location.pathname)
  }, [navigate])

  const explanationPending = detail?.explanation_job?.status === 'queued' || detail?.explanation_job?.status === 'running'
  useEffect(() => {
    if (!explanationPending || !selectedId) return
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try { const result = await api.incident(credentials, selectedId, controller.signal); if (!controller.signal.aborted) setDetail(result) }
      catch (reason) { if (!controller.signal.aborted) setToast(reason instanceof Error ? reason.message : 'Could not refresh explanation status.') }
      if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), 5000)
    }
    timer = setTimeout(() => void refresh(), 3000)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [explanationPending, selectedId, credentials])

  const connect = (next: Credentials) => {
    try { if (next.apiKey) sessionStorage.setItem(KEY_STORAGE, next.apiKey); else sessionStorage.removeItem(KEY_STORAGE); sessionStorage.setItem(TENANT_STORAGE, next.tenantId) } catch { /* session storage is optional */ }
    setApiKey(next.apiKey); setTenantId(next.tenantId); activeCredentials.current = next; setSettingsOpen(false); setToast('Workspace connected')
  }
  const disconnect = () => {
    try { sessionStorage.removeItem(KEY_STORAGE); sessionStorage.removeItem(TENANT_STORAGE) } catch { /* already disconnected */ }
    setApiKey(''); setTenantId(''); setIncidents([]); setDetail(null); setSelectedId(''); setAccounts([]); setSources([]); setOverview(null); setSettingsOpen(false); onLocalDisconnect?.()
  }
  const changeFilters = (patch: Partial<IncidentFilters>) => {
    setSelectedId('')
    setFilters((current) => ({ ...current, ...('status' in patch ? { openOnly: false } : {}), ...patch, ...(!('offset' in patch) ? { offset: 0 } : {}) }))
  }
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const refreshUnreadAlerts = useCallback(async () => {
    if (!tenantId) { setUnreadAlerts(0); return }
    try { setUnreadAlerts((await api.alerts(credentials, true)).length) } catch { setUnreadAlerts(0) }
  }, [credentials, tenantId])
  useEffect(() => {
    void refreshUnreadAlerts()
    const timer = window.setInterval(() => void refreshUnreadAlerts(), 60_000)
    return () => window.clearInterval(timer)
  }, [refreshUnreadAlerts])
  const inspectIncident = (id: string) => { setFilters(emptyFilters()); setSelectedId(id); navigate('incidents') }

  const updateStatus = async (status: IncidentStatus, note: string, trust: TrustChoice = 'none') => {
    if (!detail) return false
    setStatusBusy(true)
    try {
      const updated = await api.updateStatus(credentials, detail.id, status, note, trust)
      setDetail(updated); setIncidents((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
      setToast(`Incident moved to ${status.replaceAll('_', ' ')}`); await fetchData(); return true
    } catch (reason) { setToast(reason instanceof Error ? reason.message : 'Could not update the incident.'); return false } finally { setStatusBusy(false) }
  }
  const explainIncident = async () => {
    if (!detail) return
    setExplainBusy(true)
    try { const updated = await api.explainIncident(credentials, detail.id); setDetail(updated); setToast(updated.explanation_job?.status === 'queued' ? 'Explanation requested. You can continue working.' : 'Explanation updated.') }
    catch (reason) { setToast(reason instanceof Error ? reason.message : 'Could not explain the incident.') } finally { setExplainBusy(false) }
  }
  const createControlledSource = async (draft: SourceDraft) => {
    let accountId = draft.accountId
    if (!accountId) accountId = (await api.createAccount(credentials, { email: draft.email || '', display_name: draft.displayName, provider: 'controlled', profile: 'controlled' })).id
    await api.createSource(credentials, accountId, { source_type: 'controlled', name: draft.name, external_id: draft.externalId, capabilities: draft.capabilities })
    setToast('Controlled source added'); await fetchData()
  }
  const changeSourceStatus = async (source: Source) => {
    const next = source.status === 'active' ? 'disconnected' : 'active'; setOperationBusy(`source-${source.id}`)
    try {
      if (source.source_type === 'gmail') {
        if (source.status !== 'active') { navigate('analyse', { method: 'gmail' }); return }
        setToast((await api.disconnectGmail(credentials, source.id)).message); await fetchData(); return
      }
      const updated = await api.updateSourceStatus(credentials, source.id, next)
      setSources((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item)); setToast(`${source.name} ${next}`)
    } catch (reason) { setToast(reason instanceof Error ? reason.message : 'Could not update the source.') } finally { setOperationBusy('') }
  }
  const analyzeEmail = async (draft: EmailDraft) => {
    let accountId = draft.accountId
    if (!accountId) {
      const existing = (await api.accounts(credentials)).find((account) => account.email?.toLowerCase() === draft.accountEmail.trim().toLowerCase())
      accountId = (existing ?? await api.createAccount(credentials, { email: draft.accountEmail.trim(), provider: 'controlled', profile: 'controlled', display_name: '' })).id
    }
    let sourceId = draft.sourceId
    if (!sourceId) {
      const existing = (await api.sources(credentials, accountId)).find((source) => source.source_type === 'controlled' && source.status === 'active' && source.capabilities?.includes('email'))
      sourceId = (existing ?? await api.createSource(credentials, accountId, { source_type: 'controlled', name: 'Selected messages', external_id: `selected-email:${accountId}:${crypto.randomUUID()}`, capabilities: ['email'] })).id
    }
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([draft.sender, draft.replyTo, draft.displayName, draft.subject, draft.body, draft.claimedDomains ?? [], draft.spf, draft.dkim, draft.dmarc])))
    const externalId = `selected:${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
    const job = await api.scan(credentials, { source_id: sourceId, trigger: 'user' })
    const authentication = Object.fromEntries(Object.entries({ spf: draft.spf, dkim: draft.dkim, dmarc: draft.dmarc }).filter(([, value]) => value))
    const result = await api.ingestSignals(credentials, sourceId, { scan_job_id: job.id, signals: [{ external_id: externalId, signal_type: 'email', features: { sender: draft.sender, reply_to: draft.replyTo, display_name: draft.displayName, subject: draft.subject, body: draft.body, claimed_domains: draft.claimedDomains ?? [], authentication } }] })
    await fetchData(); return { ...result, accountId }
  }
  const deleteAccount = async () => {
    if (!deleteTarget) return
    setOperationBusy('delete')
    try { await api.deleteAccount(credentials, deleteTarget.id); setDeleteTarget(null); setToast('Local account evidence deleted.'); await fetchData() }
    catch (reason) { setToast(reason instanceof Error ? reason.message : 'Deletion failed.') } finally { setOperationBusy('') }
  }

  const selected = detail?.id === selectedId ? detail : incidents.find((incident) => incident.id === selectedId) ?? null
  const telemetry = useMemo(() => telemetryCoverage(sources, capabilities), [sources, capabilities])
  const navigation: Array<{ id: WorkspaceView; label: string; icon: keyof typeof Icons }> = [
    { id: 'overview', label: 'Overview', icon: 'grid' }, { id: 'analyse', label: 'Analyse', icon: 'scan' },
    { id: 'incidents', label: 'Incidents', icon: 'alert' }, { id: 'evidence', label: 'Evidence', icon: 'search' },
    { id: 'connections', label: 'Connections', icon: 'building' }, { id: 'detection', label: 'Detection', icon: 'shield' },
  ]

  const openGuide = () => { setGuideOpen(true); if (tenantId) forgetGuideDismissed(tenantId); setSettingsOpen(false); navigate('overview') }
  const dismissGuide = () => { rememberGuideDismissed(tenantId); setGuideOpen(false) }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside id="workspace-navigation" ref={navigationPanel} inert={compactNavigation && !menuOpen} className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <Brand subtitle="Evidence-led email security" inverse />
        <div className="workspace-label">PRIVATE WORKSPACE</div>
        <nav aria-label="Primary navigation">
          {navigation.map((item) => {
            const Icon = Icons[item.icon]
            return <button key={item.id} aria-current={view === item.id ? 'page' : undefined} className={view === item.id ? 'active' : ''} onClick={() => navigate(item.id)} type="button"><Icon />{item.label}{item.id === 'incidents' && Boolean(overview?.incidents.active) && <span className="nav-count">{overview?.incidents.active}</span>}</button>
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="protection-status"><span className={telemetry.activeSourceCount ? 'pulse' : ''} /><div><strong>{telemetry.activeSourceCount ? `${telemetry.activeSourceCount} active ${telemetry.activeSourceCount === 1 ? 'source' : 'sources'}` : 'Selected-message ready'}</strong><small>{telemetry.mode === 'live' ? 'Gmail samples on demand' : 'No continuous monitoring'}</small></div></div>
          <button onClick={() => { setMenuOpen(false); setSettingsOpen(true) }} type="button"><Icons.settings />Account & settings</button>
        </div>
      </aside>
      {menuOpen && <button aria-label="Close navigation" className="sidebar-scrim" onClick={() => setMenuOpen(false)} type="button" />}
      <div className="app-main" inert={compactNavigation && menuOpen}>
        <header className="topbar">
          <button ref={navigationButton} aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded={menuOpen} className="icon-button menu-button" onClick={() => setMenuOpen(true)} type="button"><Icons.menu /></button>
          <form className="global-search" onSubmit={(event) => { event.preventDefault(); changeFilters({ q: searchText.trim() }); navigate('incidents') }}>
            <Icons.search /><label className="sr-only" htmlFor="global-search">Search incidents</label><input id="global-search" maxLength={200} onChange={(event) => setSearchText(event.target.value)} placeholder="Search incidents…" value={searchText} /><button className="search-submit" type="submit" aria-label="Search workspace" disabled={!searchText.trim()}><Icons.arrow /></button>
          </form>
          <div className="top-actions"><button aria-label={unreadAlerts ? `Alerts, ${unreadAlerts} unread` : 'Alerts'} className="icon-button alert-bell" disabled={!tenantId} onClick={() => navigate('connections')} type="button"><Icons.alert />{unreadAlerts > 0 && <span className="alert-count" aria-hidden="true">{unreadAlerts > 9 ? '9+' : unreadAlerts}</span>}</button><button className="button button-primary scan-button" disabled={!tenantId} onClick={() => navigate('analyse', { method: 'selected' })} type="button"><Icons.scan /><span>Analyse message</span></button><button aria-label={session?.user ? 'Your account' : 'Local workspace settings'} className="avatar-button" onClick={() => setSettingsOpen(true)} type="button">{session?.user?.email?.slice(0, 2).toUpperCase() ?? <Icons.settings />}</button></div>
        </header>
        {tenantId && <div className="data-scope-bar"><span><Icons.lock />{session?.user ? 'Signed in as' : 'Workspace'} <strong>{session?.user?.email ?? tenantId}</strong></span><span className="mode-tag">{telemetry.mode === 'live' ? 'Gmail samples · on demand' : 'Selected-message analysis'}</span><span>Private evidence · human review</span></div>}
        <main id="main-content">
          {!tenantId ? <div className="page"><Panel className="state-card"><h1>Open a local workspace</h1><p>Choose a controlled workspace before analysing evidence.</p><button className="button button-primary" onClick={() => setSettingsOpen(true)}>Configure local workspace</button></Panel></div> : <>
            {supportError && <InlineNotice tone="warning" title="Some workspace data is unavailable">{supportError}</InlineNotice>}
            {view === 'overview' && <>{guideOpen && <FirstRunGuide overview={overview} sources={sources} onAnalyse={() => navigate('analyse', { method: 'selected' })} onReview={() => navigate('incidents')} onConnectGmail={() => navigate('analyse', { method: 'gmail' })} onDismiss={dismissGuide} />}<OverviewPanel overview={overview} incidents={priorityIncidents} accounts={accounts} sources={sources} profile={capabilities} jobs={scanJobs} loading={loading} error={priorityError} onRefresh={() => void fetchData()} onInspect={inspectIncident} onNavigate={(section) => navigate(section === 'analysis' ? 'analyse' : section === 'coverage' ? 'connections' : section === 'protection' ? 'detection' : section)} onConnectGmail={() => navigate('analyse', { method: 'gmail' })} onMetric={(metric) => { if (metric === 'signals') navigate('evidence'); else { changeFilters(metric === 'critical' ? { severity: 'critical', openOnly: true } : metric === 'review' ? { status: 'under_review' } : { openOnly: true }); navigate('incidents') } }} /></>}
            {view === 'analyse' && <EmailWorkspace key={tenantId} method={method} onMethodChange={setMethod} credentials={credentials} configuration={capabilities?.gmail} accounts={accounts} sources={sources} onRefresh={async () => { await fetchData() }} onAnalyze={analyzeEmail} onInspect={inspectIncident} />}
            {view === 'incidents' && <IncidentsPage incidents={incidents} total={incidentTotal} accounts={accounts} filters={filters} selectedId={selectedId} selected={selected} loading={loading} detailLoading={detailLoading} error={error} detailError={detailError} compactNavigation={compactNavigation} statusBusy={statusBusy} aiAvailable={Boolean(capabilities?.ai_explanations)} explainBusy={explainBusy} onChangeFilters={changeFilters} onSelect={setSelectedId} onPage={(offset) => changeFilters({ offset })} onAnalyse={() => navigate('analyse', { method: 'selected' })} onRetry={() => void fetchData()} onStatus={updateStatus} onExplain={explainIncident} />}
            {view === 'evidence' && <EvidenceWorkspace key={tenantId} credentials={credentials} accounts={accounts} sources={sources} onInspect={inspectIncident} />}
            {view === 'connections' && <><ConnectionsPage overview={overview} accounts={accounts} sources={sources} profile={capabilities} jobs={scanJobs} loading={loading} error={supportError} onRefresh={() => void fetchData()} onAddSource={() => setSourceOpen(true)} onAnalyse={() => navigate('analyse', { method: 'selected' })} onConnectGmail={() => navigate('analyse', { method: 'gmail' })} onDeleteAccount={setDeleteTarget} onChangeSourceStatus={(source) => void changeSourceStatus(source)} operationBusy={operationBusy} /><AlertsPanel credentials={credentials} onChanged={() => void refreshUnreadAlerts()} onOpenIncident={inspectIncident} /></>}
            {view === 'detection' && <DetectionPage tab={detectionTab} onTabChange={setDetectionTab} credentials={credentials} profile={capabilities} sources={sources} accounts={accounts} onAnalyse={() => navigate('analyse', { method: 'selected' })} onPostureComplete={() => void fetchData()} />}
          </>}
        </main>
      </div>
      {deleteTarget && <DeleteAccountDataModal account={deleteTarget} busy={operationBusy === 'delete'} onClose={() => setDeleteTarget(null)} onDelete={() => void deleteAccount()} />}
      {settingsOpen && (session?.user && onSignOut ? <SessionModal session={session} onClose={() => setSettingsOpen(false)} onSignOut={onSignOut} onDelete={async () => { await api.deleteIdentity(credentials); window.dispatchEvent(new Event('sentinelsme:session-expired')) }} onShowGuide={openGuide} onOpenConnections={() => { setSettingsOpen(false); navigate('connections') }} /> : <LocalSettingsModal currentKey={apiKey} currentTenant={tenantId} onClear={disconnect} onClose={() => setSettingsOpen(false)} onSave={connect} />)}
      {sourceOpen && <AddSourceModal accounts={accounts} onClose={() => setSourceOpen(false)} onCreate={createControlledSource} profile={capabilities} />}
      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </div>
  )
}
