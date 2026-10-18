import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { Icons } from './icons'
import { type EmailDraft } from './EmailAnalysis'
import { EmailWorkspace } from './EmailWorkspace'
import { EvidenceWorkspace } from './EvidenceWorkspace'
import { OverviewPanel } from './OverviewPanel'
import { PostureCheck } from './PostureCheck'
import { ProtectionCoverage } from './ProtectionCoverage'
import { RuleCatalogue } from './RuleCatalogue'
import { TrustedSenders } from './TrustedSenders'
import { AddSourceModal, DeleteAccountModal, SessionModal, SettingsModal, ShortcutsModal, type SourceDraft } from './modals'
import { IncidentsPage } from './pages/IncidentsPage'
import { SourcesPage } from './pages/SourcesPage'
import { Sidebar } from './shell/Sidebar'
import { Topbar } from './shell/Topbar'
import type { Account, AuthSession, Credentials, Incident, IncidentFilters, IncidentStatus, Source, TrustChoice } from './types'
import { useFocusTrap, useMediaQuery, useRequest } from './ui/hooks'
import { Notice } from './ui/primitives'
import { useRoute, type Section } from './ui/router'
import { useWorkspace } from './useWorkspace'
import { telemetryCoverage } from './utils'

const KEY_STORAGE = 'sentinelsme.apiKey'
const TENANT_STORAGE = 'sentinelsme.tenantId'
const NO_FILTERS: IncidentFilters = { severity: '', status: '', q: '' }

function readSession(key: string) {
  try { return sessionStorage.getItem(key) ?? '' } catch { return '' }
}

type Toast = { message: string; tone: 'success' | 'error' | 'info' }

/** Read and strip a Google consent callback before the first render, so the route is right immediately. */
function consumeGmailCallback(): Toast | null {
  const callback = new URLSearchParams(window.location.search).get('gmail')
  if (!callback) return null
  window.history.replaceState(null, '', `${window.location.pathname}#/analyse`)
  return callback === 'connected' ? { message: 'Gmail connected with read-only consent.', tone: 'success' }
    : callback === 'cancelled' ? { message: 'Google consent was cancelled.', tone: 'info' }
      : { message: 'Google consent failed or expired. Check setup and try again.', tone: 'error' }
}

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return Boolean(element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)))
}

export default function App({ session, onSignOut, onLocalDisconnect }: { session?: AuthSession; onSignOut?: () => Promise<void>; onLocalDisconnect?: () => void }) {
  const [initialToast] = useState(consumeGmailCallback)
  const [apiKey, setApiKey] = useState(() => session?.user ? '' : readSession(KEY_STORAGE))
  const [tenantId, setTenantId] = useState(() => session?.user?.workspace_id ?? readSession(TENANT_STORAGE))
  const [route, navigateRoute] = useRoute()
  const section = route.section
  const [filters, setFilters] = useState<IncidentFilters>(NO_FILTERS)
  const credentials = useMemo<Credentials>(() => ({ apiKey, tenantId, ...(session?.user ? { csrfToken: session.csrf_token, userEmail: session.user.email } : {}) }), [apiKey, tenantId, session])
  const workspace = useWorkspace(credentials, filters)
  const data = workspace.data
  const accounts = useMemo(() => data?.accounts ?? [], [data])
  const sources = useMemo(() => data?.sources ?? [], [data])
  const incidents = useMemo(() => data?.incidents ?? [], [data])
  const capabilities = data?.capabilities ?? null
  const telemetry = useMemo(() => telemetryCoverage(sources, capabilities), [sources, capabilities])

  const compactNavigation = useMediaQuery('(max-width: 900px)')
  const compactSplit = useMediaQuery('(max-width: 1080px)')
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuLayout, setMenuLayout] = useState(compactNavigation)
  if (menuLayout !== compactNavigation) { setMenuLayout(compactNavigation); setMenuOpen(false) }
  const drawerOpen = compactNavigation && menuOpen
  const sidebar = useRef<HTMLElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  useFocusTrap(sidebar, drawerOpen, () => setMenuOpen(false), undefined, menuButton)

  const [dialog, setDialog] = useState<'' | 'settings' | 'source' | 'shortcuts'>('')
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)
  const [operationBusy, setOperationBusy] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [explainBusy, setExplainBusy] = useState(false)
  const [toast, setToast] = useState<Toast | null>(initialToast)
  const gmailCallback = initialToast !== null
  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => setToast({ message, tone }), [])

  // Incident selection lives in the URL; on wide screens the top case is shown by default.
  const selectedId = route.section === 'incidents' ? route.id ?? (compactSplit ? '' : incidents[0]?.id ?? '') : ''
  const [detailRevision, setDetailRevision] = useState(0)
  const [updated, setUpdated] = useState<{ incident: Incident; revision: number } | null>(null)
  const detailKey = tenantId && selectedId ? JSON.stringify([tenantId, apiKey, selectedId, detailRevision]) : null
  const detailRequest = useRequest(detailKey, signal => api.incident(credentials, selectedId, signal), 'Incident evidence is unavailable.')
  const fetchedDetail = detailRequest.data ?? (detailRequest.previous?.id === selectedId ? detailRequest.previous : undefined)
  const detail = updated && updated.incident.id === selectedId && (updated.revision === detailRevision || !detailRequest.data) ? updated.incident : fetchedDetail ?? null
  /** Reload workspace data and the open case together. */
  const refreshAll = useCallback(async () => { await workspace.refresh(); setDetailRevision(value => value + 1) }, [workspace])

  const go = useCallback((next: Section, id?: string) => {
    if (next === 'overview' || (next === 'incidents' && !id)) setFilters(NO_FILTERS)
    navigateRoute({ section: next, id })
    setMenuOpen(false)
    window.scrollTo({ top: 0 })
  }, [navigateRoute])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), toast.tone === 'error' ? 8000 : 4500)
    return () => window.clearTimeout(timer)
  }, [toast])

  // Keyboard shortcuts. Read the latest values through a ref so the listener is attached once.
  const shortcutState = useRef({ section, incidents, selectedId, dialog, go, drawerOpen })
  useEffect(() => { shortcutState.current = { section, incidents, selectedId, dialog, go, drawerOpen } })
  useEffect(() => {
    let chord = 0
    const handler = (event: KeyboardEvent) => {
      const state = shortcutState.current
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target) || state.dialog || state.drawerOpen || document.querySelector('[role="dialog"]')) return
      if (chord && Date.now() - chord < 1200) {
        chord = 0
        const target = ({ o: 'overview', i: 'incidents', e: 'evidence', a: 'analysis', s: 'sources', r: 'rules', c: 'protection' } as Record<string, Section>)[event.key]
        if (target) { event.preventDefault(); state.go(target) }
        return
      }
      if (event.key === 'g') { chord = Date.now(); return }
      if (event.key === '/') { event.preventDefault(); searchInput.current?.focus(); return }
      if (event.key === '?') { event.preventDefault(); setDialog('shortcuts'); return }
      if ((event.key === 'j' || event.key === 'k') && state.section === 'incidents' && state.incidents.length) {
        event.preventDefault()
        const index = state.incidents.findIndex(incident => incident.id === state.selectedId)
        const next = event.key === 'j' ? Math.min(state.incidents.length - 1, index + 1) : Math.max(0, index === -1 ? 0 : index - 1)
        navigateRoute({ section: 'incidents', id: state.incidents[next].id }, { replace: true })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigateRoute])

  const latestCredentials = useRef(credentials)
  useEffect(() => { latestCredentials.current = credentials })
  const isCurrent = (requested: Credentials) => requested.tenantId === latestCredentials.current.tenantId && requested.apiKey === latestCredentials.current.apiKey

  const connect = (next: Credentials) => {
    try {
      if (next.apiKey) sessionStorage.setItem(KEY_STORAGE, next.apiKey)
      else sessionStorage.removeItem(KEY_STORAGE)
      sessionStorage.setItem(TENANT_STORAGE, next.tenantId)
    } catch { notify('Session storage is unavailable; the workspace will not survive a reload.', 'info') }
    if (next.tenantId !== tenantId || next.apiKey !== apiKey) {
      setFilters(NO_FILTERS)
      setDeleteTarget(null)
      setUpdated(null)
      navigateRoute({ section: route.section === 'incidents' ? 'incidents' : route.section }, { replace: true })
    }
    setApiKey(next.apiKey)
    setTenantId(next.tenantId)
    setDialog('')
    notify('Workspace connected')
  }
  const disconnect = () => {
    try { sessionStorage.removeItem(KEY_STORAGE); sessionStorage.removeItem(TENANT_STORAGE) } catch { /* nothing stored */ }
    setApiKey('')
    setTenantId('')
    setUpdated(null)
    setDialog('')
    window.history.replaceState(null, '', window.location.pathname)
    onLocalDisconnect?.()
  }

  const explainIncident = async () => {
    if (!detail) return
    const requested = credentials
    setExplainBusy(true)
    try {
      const result = await api.explainIncident(requested, detail.id)
      if (!isCurrent(requested)) return
      setUpdated({ incident: result, revision: detailRevision })
      const explanation = typeof result.explanation === 'object' ? result.explanation : null
      notify(explanation?.source === 'ai' ? 'Plain-language explanation added' : 'The local model was unavailable; the template explanation was kept.', explanation?.source === 'ai' ? 'success' : 'info')
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Could not explain the incident.', 'error')
    } finally { setExplainBusy(false) }
  }

  const updateStatus = async (status: IncidentStatus, note: string, trust: TrustChoice = 'none') => {
    if (!detail) return false
    const requested = credentials
    setStatusBusy(true)
    try {
      const result = await api.updateStatus(requested, detail.id, status, note, trust)
      if (!isCurrent(requested)) return false
      setUpdated({ incident: result, revision: detailRevision })
      workspace.patch(value => ({ ...value, incidents: value.incidents.map(item => item.id === result.id ? { ...item, ...result } : item) }))
      // Pin the case so a status filter cannot swap the open record after the refresh.
      if (route.section === 'incidents' && route.id !== result.id) navigateRoute({ section: 'incidents', id: result.id }, { replace: true })
      notify(trust !== 'none' ? `Incident moved to ${status.replaceAll('_', ' ')}; sender trusted for new email` : `Incident moved to ${status.replaceAll('_', ' ')}`)
      await workspace.refresh()
      return true
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Could not update the incident.', 'error')
      return false
    } finally { setStatusBusy(false) }
  }

  const createControlledSource = async (draft: SourceDraft) => {
    let accountId = draft.accountId
    if (!accountId) accountId = (await api.createAccount(credentials, { email: draft.email || '', display_name: draft.displayName, provider: 'controlled', profile: 'controlled' })).id
    await api.createSource(credentials, accountId, { source_type: 'controlled', name: draft.name, external_id: draft.externalId, capabilities: draft.capabilities })
    notify('Controlled source added')
    await workspace.refresh()
  }

  const changeSourceStatus = async (source: Source) => {
    const next = source.status === 'active' ? 'disconnected' : 'active'
    setOperationBusy(`source-${source.id}`)
    try {
      if (source.source_type === 'gmail') {
        if (source.status !== 'active') { go('analysis'); notify('Use Google consent to reconnect Gmail.', 'info'); return }
        notify((await api.disconnectGmail(credentials, source.id)).message)
      } else {
        await api.updateSourceStatus(credentials, source.id, next)
        notify(`${source.name} ${next === 'active' ? 'activated' : 'disconnected'}`)
      }
      await workspace.refresh()
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Could not update the source.', 'error')
    } finally { setOperationBusy('') }
  }

  const analyzeEmail = async (draft: EmailDraft) => {
    let accountId = draft.accountId
    if (!accountId) {
      const known = await api.accounts(credentials)
      const existing = known.find(account => account.email?.toLowerCase() === draft.accountEmail.trim().toLowerCase())
      accountId = (existing ?? await api.createAccount(credentials, { email: draft.accountEmail.trim(), provider: 'controlled', profile: 'controlled', display_name: '' })).id
    }
    let sourceId = draft.sourceId
    if (!sourceId) {
      const existing = (await api.sources(credentials, accountId)).find(source => source.source_type === 'controlled' && source.status === 'active' && source.capabilities?.includes('email'))
      sourceId = (existing ?? await api.createSource(credentials, accountId, { source_type: 'controlled', name: 'Selected emails', external_id: `selected-email:${accountId}:${crypto.randomUUID()}`, capabilities: ['email'] })).id
    }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([draft.sender, draft.replyTo, draft.displayName, draft.subject, draft.body, draft.claimedDomains ?? [], draft.spf, draft.dkim, draft.dmarc])))
    const externalId = `selected:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`
    const job = await api.scan(credentials, { source_id: sourceId, trigger: 'user' })
    const authentication = Object.fromEntries(Object.entries({ spf: draft.spf, dkim: draft.dkim, dmarc: draft.dmarc }).filter(([, value]) => value))
    const result = await api.ingestSignals(credentials, sourceId, { scan_job_id: job.id, signals: [{ external_id: externalId, signal_type: 'email', features: { sender: draft.sender, reply_to: draft.replyTo, display_name: draft.displayName, subject: draft.subject, body: draft.body, claimed_domains: draft.claimedDomains ?? [], authentication } }] })
    await workspace.refresh()
    return { ...result, accountId }
  }

  const deleteAccount = async () => {
    if (!deleteTarget) return
    setOperationBusy('delete')
    try {
      await api.deleteAccount(credentials, deleteTarget.id)
      setDeleteTarget(null)
      notify('Local account data deleted. Review Google access separately if it was connected.')
      await workspace.refresh()
    } catch (reason) { notify(reason instanceof Error ? reason.message : 'Deletion failed.', 'error') }
    finally { setOperationBusy('') }
  }

  const changeFilters = (patch: Partial<IncidentFilters>) => {
    setFilters(current => ({ ...current, ...patch, offset: 0 }))
    if (route.section === 'incidents' && route.id) navigateRoute({ section: 'incidents' }, { replace: true })
  }
  const inspectIncident = (id: string) => { setFilters(NO_FILTERS); go('incidents', id) }
  const openCount = data?.overview?.incidents.active ?? 0
  const collection = workspace.loading && !data ? { title: 'Checking sources…', detail: 'Loading workspace', live: false }
    : telemetry.activeSourceCount ? { title: `${telemetry.activeSourceCount} active ${telemetry.activeSourceCount === 1 ? 'source' : 'sources'}`, detail: telemetry.mode === 'live' ? 'Gmail samples on demand' : 'Controlled data only', live: true }
      : { title: 'No live monitoring', detail: capabilities?.controlled_ingestion ? 'Controlled data only' : 'No source connected', live: false }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>Skip to main content</a>
    <Sidebar ref={sidebar} section={section} open={drawerOpen} compact={compactNavigation} openCount={openCount} collection={collection} onNavigate={next => go(next)} onSettings={() => { setMenuOpen(false); setDialog('settings') }} />
    {menuOpen && compactNavigation && <button aria-label="Close navigation" className="sidebar-scrim" onClick={() => setMenuOpen(false)} tabIndex={-1} type="button" />}
    <div className="app-main">
      <Topbar ref={menuButton} menuOpen={drawerOpen} search={filters.q} workspace={session?.user?.email ?? tenantId} signedIn={Boolean(session?.user)} mode={telemetry.mode === 'live' ? 'Gmail samples' : 'Controlled analysis'} canAnalyse={Boolean(tenantId)} searchInput={searchInput}
        onMenu={() => setMenuOpen(true)} onSearch={value => { changeFilters({ q: value }); if (section !== 'incidents') navigateRoute({ section: 'incidents' }) }} onSearchSubmit={() => navigateRoute({ section: 'incidents' })} onAnalyse={() => go('analysis')} onSettings={() => setDialog('settings')} onShortcuts={() => setDialog('shortcuts')} />
      <main id="main-content" tabIndex={-1}>
        {!tenantId ? <div className="page page-narrow"><div className="state-card state-hero"><span className="state-icon"><Icons.lock /></span><h1>Open a workspace</h1><p>Choose the demonstration workspace this tab should use.</p><button className="button button-primary" onClick={() => setDialog('settings')} type="button">Open workspace settings</button></div></div> : <>
          {data?.supportError && <div className="page-banner"><Notice tone="warning" title={data.supportError} /></div>}
          {section === 'overview' && <OverviewPanel overview={data?.overview ?? null} incidents={data?.priority ?? []} accounts={accounts} sources={sources} profile={capabilities} jobs={data?.jobs ?? []} loading={workspace.loading || workspace.refreshing} error={data?.priorityError ?? ''} onRefresh={() => void refreshAll()} onInspect={inspectIncident} onNavigate={go} />}
          {section === 'incidents' && <IncidentsPage filters={filters} incidents={incidents} total={data?.incidentTotal ?? 0} accounts={accounts} loading={workspace.loading} error={data?.incidentError ?? ''} selected={selectedId} detail={detail} detailLoading={detailRequest.loading} detailError={detailRequest.error} compact={compactSplit} statusBusy={statusBusy} explainBusy={explainBusy} aiAvailable={Boolean(capabilities?.ai_explanations)}
            onFilters={changeFilters} onOffset={offset => { setFilters(current => ({ ...current, offset })); navigateRoute({ section: 'incidents' }, { replace: true }) }} onSelect={id => navigateRoute({ section: 'incidents', id }, { replace: !compactSplit })} onBack={() => navigateRoute({ section: 'incidents' })} onRetry={() => void refreshAll()} onRetryDetail={() => setDetailRevision(value => value + 1)} onStatus={updateStatus} onExplain={explainIncident} onAnalyse={() => go('analysis')} />}
          {section === 'evidence' && <EvidenceWorkspace key={tenantId} credentials={credentials} accounts={accounts} sources={sources} onInspect={inspectIncident} />}
          {section === 'sources' && <SourcesPage loading={workspace.loading} accounts={accounts} sources={sources} jobs={data?.jobs ?? []} overview={data?.overview ?? null} capabilities={capabilities} telemetry={telemetry} busy={operationBusy} onAddSource={() => setDialog('source')} onAnalyse={() => go('analysis')} onToggleSource={source => void changeSourceStatus(source)} onDelete={setDeleteTarget} />}
          {section === 'analysis' && <EmailWorkspace key={tenantId} credentials={credentials} configuration={capabilities?.gmail} accounts={accounts} sources={sources} onRefresh={refreshAll} onAnalyze={analyzeEmail} onInspect={inspectIncident} gmailCallback={gmailCallback} />}
          {section === 'protection' && <ProtectionCoverage profile={capabilities} sources={sources} onAnalyse={() => go('analysis')}><PostureCheck key={`posture-${tenantId}`} credentials={credentials} accounts={accounts} onComplete={() => void refreshAll()} /></ProtectionCoverage>}
          {section === 'rules' && <RuleCatalogue key={tenantId} credentials={credentials}><TrustedSenders key={`trusted-${tenantId}`} credentials={credentials} /></RuleCatalogue>}
        </>}
      </main>
    </div>
    {deleteTarget && <DeleteAccountModal account={deleteTarget} busy={operationBusy === 'delete'} onClose={() => setDeleteTarget(null)} onConfirm={() => void deleteAccount()} />}
    {dialog === 'settings' && (session?.user && onSignOut ? <SessionModal email={session.user.email} hours={session.session_hours} onClose={() => setDialog('')} onSignOut={onSignOut} /> : <SettingsModal currentKey={apiKey} currentTenant={tenantId} onClear={disconnect} onClose={() => setDialog('')} onSave={connect} />)}
    {dialog === 'source' && <AddSourceModal accounts={accounts} onClose={() => setDialog('')} onCreate={createControlledSource} profile={capabilities} />}
    {dialog === 'shortcuts' && <ShortcutsModal onClose={() => setDialog('')} />}
    {toast && <div aria-live={toast.tone === 'error' ? 'assertive' : 'polite'} className={`toast toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>{toast.tone === 'error' ? <Icons.alert /> : toast.tone === 'info' ? <Icons.info /> : <Icons.check />}<span>{toast.message}</span><button aria-label="Dismiss notification" className="icon-button" onClick={() => setToast(null)} type="button"><Icons.close /></button></div>}
  </div>
}
