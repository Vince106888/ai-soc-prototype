import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import { Icons } from './icons'
import { type EmailDraft } from './EmailAnalysis'
import { EmailWorkspace } from './EmailWorkspace'
import { OverviewPanel } from './OverviewPanel'
import { EvidenceWorkspace, Pagination } from './EvidenceWorkspace'
import { RuleCatalogue } from './RuleCatalogue'
import { TrustedSenders } from './TrustedSenders'
import { PostureCheck } from './PostureCheck'
import { ProtectionCoverage } from './ProtectionCoverage'
import { IncidentDetail } from './IncidentDetail'
import type { AuthSession, Overview } from './types'
import type { Account, CapabilityProfile, Credentials, Incident, IncidentFilters, IncidentStatus, ScanJob, Severity, SignalType, Source, TrustChoice } from './types'
import { accountLabel, formatDateTime, humanize, incidentTitle, prioritizeIncidents, relativeTime, scorePercent, telemetryCoverage } from './utils'

const KEY_STORAGE = 'sentinelsme.apiKey'
const TENANT_STORAGE = 'sentinelsme.tenantId'
const statuses: IncidentStatus[] = ['new', 'under_review', 'resolved', 'false_positive']
const severities: Severity[] = ['critical', 'high', 'medium', 'low']
const signalTypes: SignalType[] = ['email', 'forwarding', 'signin', 'mfa', 'oauth_grant']

function readKey() {
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

function readTenant() {
  try {
    return sessionStorage.getItem(TENANT_STORAGE) ?? ''
  } catch {
    return ''
  }
}

function capabilityRows(profile: CapabilityProfile | null) {
  if (!profile) return []
  const signalRows = profile.signal_types.map((signal) => ({
    id: `signal-${signal}`,
    name: `${humanize(signal)} detection`,
    description: `Analyzes ${humanize(signal).toLowerCase()} security signals.`,
    enabled: true,
  }))
  return [
    ...signalRows,
    { id: 'controlled-ingestion', name: 'Controlled ingestion', description: `Up to ${profile.maximum_batch_size} signals per batch.`, enabled: profile.controlled_ingestion },
    { id: 'template-explanations', name: 'Template explanations', description: 'Deterministic, auditable incident context.', enabled: profile.template_explanations },
    { id: 'ai-explanations', name: 'Local-model explanations', description: 'Optional plain-language context from a model on this computer; template fallback.', enabled: profile.ai_explanations },
  ]
}

function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`badge severity severity-${severity}`}><span />{severity}</span>
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge status status-${status.toLowerCase()}`}>{humanize(status)}</span>
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>
}

function LoadingRows({ count = 3 }: { count?: number }) {
  return <div aria-label="Loading" className="loading-list" role="status">{Array.from({ length: count }, (_, index) => <div className="skeleton-row" key={index}><span /><span /><span /></div>)}</div>
}

function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return <div className="state-card" role="alert"><span className="state-icon error-icon"><Icons.alert /></span><h3>We couldn’t load this view</h3><p>{message}</p><button className="button button-secondary" onClick={retry}><Icons.refresh />Try again</button></div>
}

function EmptyState({ filtered }: { filtered?: boolean }) {
  return <div className="state-card"><span className="state-icon"><Icons.shield /></span><h3>{filtered ? 'No matching incidents' : 'Your queue is clear'}</h3><p>{filtered ? 'Try broadening your filters or changing the search term.' : 'No incident matches this view. Analyse an email to collect evidence; an empty queue alone does not establish safety.'}</p></div>
}

function Modal({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: ReactNode }) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current()
      if (event.key !== 'Tab') return
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')
      if (!controls?.length) return
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handler)
    return () => { window.removeEventListener('keydown', handler); if (opener?.isConnected) opener.focus() }
  }, [])
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialog} aria-describedby={description ? 'modal-description' : undefined} aria-labelledby="modal-title" aria-modal="true" className="modal" role="dialog"><header><div><p className="eyebrow">SentinelSME</p><h2 id="modal-title">{title}</h2>{description && <p id="modal-description">{description}</p>}</div><button aria-label="Close dialog" className="icon-button" onClick={onClose} ref={closeButton}><Icons.close /></button></header>{children}</section></div>
}

function IncidentRow({ incident, onSelect, selected = false }: { incident: Incident; onSelect: () => void; selected?: boolean }) {
  const time = incident.detected_at ?? incident.last_seen_at ?? incident.created_at ?? incident.updated_at
  const explanation = typeof incident.explanation === 'string' ? incident.explanation : incident.explanation?.what_happened
  const displayedScore = scorePercent(incident.score)
  return <button aria-current={selected ? 'true' : undefined} className={`incident-row ${selected ? 'is-selected' : ''}`} onClick={onSelect}><span className={`severity-line severity-bg-${incident.severity}`} /><span className="incident-main"><span className="incident-topline"><SeverityBadge severity={incident.severity} /><StatusBadge status={incident.status} /></span><strong>{incidentTitle(incident)}</strong><span className="incident-summary">{incident.summary || explanation || 'Security activity requires review.'}</span><span className="incident-meta"><span>{incident.source || incident.account_name || 'Sentinel engine'}</span><span>·</span><span>{relativeTime(time)}</span></span></span>{displayedScore !== undefined && <span className="risk-score"><strong>{displayedScore}</strong><small>priority</small></span>}<Icons.arrow className="row-arrow" /></button>
}

function SettingsModal({ currentTenant, currentKey, onClose, onSave, onClear }: { currentTenant: string; currentKey: string; onClose: () => void; onSave: (credentials: Credentials) => void; onClear: () => void }) {
  const [key, setKey] = useState(currentKey)
  const [tenantId, setTenantId] = useState(currentTenant)
  const connected = Boolean(currentTenant)
  const hasKey = Boolean(currentKey)
  return <Modal description="Manage the workspace and credential used to authenticate API requests." onClose={onClose} title="API connection"><form className="modal-form" onSubmit={(event) => { event.preventDefault(); if (tenantId.trim()) onSave({ apiKey: key.trim(), tenantId: tenantId.trim() }) }}><div className={`connection-status ${connected ? 'connected' : ''}`}><span /><div><strong>{connected ? hasKey ? 'API key configured' : 'Local workspace connected' : 'No workspace configured'}</strong><p>{connected ? `Requests are scoped to ${currentTenant}.` : 'Choose a workspace to open the console.'}</p></div></div><label htmlFor="settings-tenant">Workspace ID</label><input autoComplete="organization" id="settings-tenant" onChange={(event) => setTenantId(event.target.value)} placeholder="Your tenant ID" value={tenantId} /><label htmlFor="settings-key">API key <span>(optional in local mode)</span></label><input autoComplete="off" id="settings-key" onChange={(event) => setKey(event.target.value)} placeholder="Deployment API key" type="password" value={key} /><p className="field-help"><Icons.lock /> Credentials stay in session storage only—never local storage.</p><footer className="modal-actions">{connected && <button className="button button-danger" onClick={onClear} type="button">Disconnect</button>}<span /><button className="button button-secondary" onClick={onClose} type="button">Cancel</button><button className="button button-primary" disabled={!tenantId.trim()} type="submit">Save & connect</button></footer></form></Modal>
}

interface SourceDraft {
  accountId?: string
  email?: string
  displayName?: string
  name: string
  externalId: string
  capabilities: SignalType[]
}

function AddSourceModal({ accounts, profile, onClose, onCreate }: { accounts: Account[]; profile: CapabilityProfile | null; onClose: () => void; onCreate: (draft: SourceDraft) => Promise<void> }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '__new__')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [name, setName] = useState('Controlled signal source')
  const [externalId, setExternalId] = useState('')
  const supported = signalTypes.filter((item) => profile?.signal_types.includes(item) ?? true)
  const [selected, setSelected] = useState<SignalType[]>(supported)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const creatingAccount = accountId === '__new__'
  const valid = Boolean(name.trim() && externalId.trim() && selected.length && confirmed && (!creatingAccount || email.trim()))
  const toggle = (capability: SignalType) => setSelected((current) => current.includes(capability) ? current.filter((item) => item !== capability) : [...current, capability])
  return <Modal description="Register a minimal, authorized source for controlled ingestion. Use Email analysis for the separate Gmail consent flow." onClose={onClose} title="Add a controlled source"><form className="modal-form" onSubmit={(event) => { event.preventDefault(); if (!valid) return; setBusy(true); setFormError(''); void onCreate({ accountId: creatingAccount ? undefined : accountId, email: email.trim(), displayName: displayName.trim(), name: name.trim(), externalId: externalId.trim(), capabilities: selected }).then(onClose).catch((reason: unknown) => setFormError(reason instanceof Error ? reason.message : 'Could not add the source.')).finally(() => setBusy(false)) }}>
    <div className="scope-note"><Icons.shield /><div><strong>Controlled data only</strong><p>This records source metadata and accepted signal types. It does not authorize or create a live mailbox connection.</p></div></div>
    <label htmlFor="source-account">Protected account</label><select id="source-account" onChange={(event) => setAccountId(event.target.value)} value={accountId}>{accounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}<option value="__new__">Create a new account</option></select>
    {creatingAccount && <div className="form-grid"><label htmlFor="account-name">Display name <span>(optional)</span><input id="account-name" onChange={(event) => setDisplayName(event.target.value)} placeholder="Finance team" value={displayName} /></label><label htmlFor="account-email">Account email<input id="account-email" onChange={(event) => setEmail(event.target.value)} placeholder="security@example.test" required type="email" value={email} /></label></div>}
    <div className="form-grid"><label htmlFor="source-name">Source name<input id="source-name" onChange={(event) => setName(event.target.value)} required value={name} /></label><label htmlFor="source-external-id">External ID<input id="source-external-id" onChange={(event) => setExternalId(event.target.value)} placeholder="source-01" required value={externalId} /></label></div>
    <fieldset className="capability-picker"><legend>Accepted signal types</legend>{supported.map((capability) => <label className="capability-check" key={capability}><input checked={selected.includes(capability)} onChange={() => toggle(capability)} type="checkbox" /><span><strong>{humanize(capability)}</strong><small>Normalized metadata only</small></span></label>)}</fieldset>
    <label className="check-field"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>I confirm this source contains only synthetic, controlled, or explicitly authorized data.</span></label>
    {formError && <p className="form-error" role="alert">{formError}</p>}
    <footer className="modal-actions"><span /><button className="button button-secondary" onClick={onClose} type="button">Cancel</button><button className="button button-primary" disabled={!valid || busy} type="submit">{busy ? 'Adding…' : 'Add source'}</button></footer>
  </form></Modal>
}

function SessionModal({ email, hours, onClose, onSignOut, onDelete }: { email: string; hours: number; onClose: () => void; onSignOut: () => Promise<void>; onDelete: () => Promise<void> }) {
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <Modal title="Your account" description="Your workspace is assigned to your Google identity." onClose={onClose}>
    <div className="session-account"><Icons.lock /><div><strong>{email}</strong><p>Private workspace · session lasts up to {hours} hours</p></div></div>
    <p className="session-help">Signing out closes this app session. To revoke Gmail access or delete collected evidence, use Accounts &amp; sources.</p>
    <details><summary>Delete your account and workspace</summary><p>This permanently deletes your app account and retained workspace data and signs out every session. To revoke Google permissions, disconnect Gmail first or remove access in your Google account settings.</p><label htmlFor="delete-confirmation">Type DELETE to confirm</label><input id="delete-confirmation" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" /><button className="button button-secondary" disabled={busy || confirmation !== 'DELETE'} onClick={() => { setBusy(true); setError(''); void onDelete().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not delete your account.')).finally(() => setBusy(false)) }}>Delete account permanently</button></details>
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer className="modal-actions"><button className="button button-secondary" onClick={onClose}>Close</button><button className="button button-primary" disabled={busy} onClick={() => { setBusy(true); setError(''); void onSignOut().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not sign out.')).finally(() => setBusy(false)) }}>{busy ? 'Signing out…' : 'Sign out'}</button></footer>
  </Modal>
}

export default function App({ session, onSignOut, onLocalDisconnect }: { session?: AuthSession; onSignOut?: () => Promise<void>; onLocalDisconnect?: () => void }) {
  const [apiKey, setApiKey] = useState(() => session?.user ? '' : readKey())
  const [tenantId, setTenantId] = useState(() => session?.user?.workspace_id ?? readTenant())
  const [section, setSection] = useState<'overview' | 'incidents' | 'coverage' | 'analysis' | 'evidence' | 'rules' | 'protection'>('overview')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)
  const [filters, setFilters] = useState<IncidentFilters>({ severity: '', status: '', q: '' })
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [incidentTotal, setIncidentTotal] = useState(0)
  const [priorityIncidents, setPriorityIncidents] = useState<Incident[]>([])
  const [priorityError, setPriorityError] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [capabilities, setCapabilities] = useState<CapabilityProfile | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [scanJobs, setScanJobs] = useState<ScanJob[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [detail, setDetail] = useState<Incident | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [error, setError] = useState('')
  const [supportError, setSupportError] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [operationBusy, setOperationBusy] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [compactNavigation, setCompactNavigation] = useState(() => window.matchMedia?.('(max-width: 900px)').matches ?? false)
  const navigationPanel = useRef<HTMLElement>(null)
  const navigationButton = useRef<HTMLButtonElement>(null)
  const [toast, setToast] = useState('')
  const credentials = useMemo(() => ({ apiKey, tenantId, ...(session?.user ? { csrfToken: session.csrf_token, userEmail: session.user.email } : {}) }), [apiKey, tenantId, session])
  const activeCredentials = useRef(credentials)

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
    const controls = navigationPanel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    controls?.[0]?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false) }
      if (event.key !== 'Tab' || !controls?.length) return
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handleKey)
    return () => { window.removeEventListener('keydown', handleKey); opener?.focus() }
  }, [compactNavigation, menuOpen])

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!tenantId) return
    setLoading(true)
    setError('')
    setSupportError('')
    const [incidentResult, accountResult, capabilityResult, scanResult, overviewResult, priorityResult, sourceResult] = await Promise.allSettled([
      api.incidentPage(credentials, filters, signal),
      api.accounts(credentials, signal),
      api.capabilities(credentials, signal),
      api.scanJobs(credentials, signal),
      api.overview(credentials, signal),
      api.incidentPage(credentials, { severity: '', status: '', q: '', openOnly: true }, signal),
      api.allSources(credentials, signal),
    ])
    if (signal?.aborted || activeCredentials.current.tenantId !== credentials.tenantId || activeCredentials.current.apiKey !== credentials.apiKey) return
    if (incidentResult.status === 'fulfilled') {
      const sorted = prioritizeIncidents(incidentResult.value.items)
      setIncidents(sorted)
      setIncidentTotal(incidentResult.value.total)
      setSelectedId((current) => current || (sorted[0]?.id ?? ''))
    } else if (incidentResult.reason?.name !== 'AbortError') {
      setError(incidentResult.reason instanceof Error ? incidentResult.reason.message : 'Unable to load incidents.')
    }
    if (accountResult.status === 'fulfilled') {
      setAccounts(accountResult.value)
    }
    else if (accountResult.reason?.name !== 'AbortError') setSupportError('Some account coverage data is unavailable.')
    if (sourceResult.status === 'fulfilled') setSources(sourceResult.value)
    else setSupportError('Source coverage is unavailable.')
    if (priorityResult.status === 'fulfilled') { setPriorityIncidents(priorityResult.value.items); setPriorityError('') }
    else { setPriorityIncidents([]); setPriorityError('The review queue is unavailable. Refresh to try again.'); setSupportError('The review queue is unavailable.') }
    if (capabilityResult.status === 'fulfilled') setCapabilities(capabilityResult.value)
    else if (capabilityResult.reason?.name !== 'AbortError') setSupportError('Some account and capability data is unavailable.')
    if (scanResult.status === 'fulfilled') setScanJobs(scanResult.value)
    else if (scanResult.reason?.name !== 'AbortError') setSupportError('Some source or scan-history data is unavailable.')
    if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value)
    else if (overviewResult.reason?.name !== 'AbortError') { setOverview(null); setSupportError('Workspace totals are unavailable. Try refreshing.') }
    if (!signal?.aborted) setLoading(false)
  }, [credentials, filters, tenantId])

  useEffect(() => {
    const controller = new AbortController()
    void fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  useEffect(() => {
    if (!tenantId || !selectedId) { setDetail(null); setDetailLoading(false); setDetailError(''); return }
    const controller = new AbortController()
    setDetailLoading(true)
    setDetailError('')
    api.incident(credentials, selectedId, controller.signal)
      .then(result => { if (!controller.signal.aborted) setDetail(result) })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setDetail(null)
        setDetailError(reason instanceof Error ? reason.message : 'Incident evidence is unavailable.')
      })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false) })
    return () => controller.abort()
  }, [credentials, selectedId, incidents, tenantId])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4500)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const callback = new URLSearchParams(window.location.search).get('gmail')
    if (!callback) return
    setSection('analysis')
    setToast(callback === 'connected' ? 'Gmail connected with read-only consent.' : callback === 'cancelled' ? 'Google consent was cancelled.' : 'Google consent failed or expired. Check setup and try again.')
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const connect = (nextCredentials: Credentials) => {
    if (nextCredentials.apiKey) sessionStorage.setItem(KEY_STORAGE, nextCredentials.apiKey)
    else sessionStorage.removeItem(KEY_STORAGE)
    sessionStorage.setItem(TENANT_STORAGE, nextCredentials.tenantId)
    setApiKey(nextCredentials.apiKey)
    setTenantId(nextCredentials.tenantId)
    activeCredentials.current = nextCredentials
    if (nextCredentials.tenantId !== tenantId || nextCredentials.apiKey !== apiKey) {
      setSelectedId('')
      setDetail(null)
      setIncidents([])
      setIncidentTotal(0)
      setPriorityIncidents([])
      setAccounts([])
      setSources([])
      setScanJobs([])
      setOverview(null)
      setCapabilities(null)
      setFilters({ severity: '', status: '', q: '' })
      setDeleteTarget(null)
      setSourceOpen(false)
      setToast('')
    }
    setSettingsOpen(false)
    setToast('Workspace connected')
  }
  const disconnect = () => {
    sessionStorage.removeItem(KEY_STORAGE)
    sessionStorage.removeItem(TENANT_STORAGE)
    setApiKey('')
    setTenantId('')
    activeCredentials.current = { tenantId: '', apiKey: '' }
    setIncidents([])
    setDetail(null)
    setSelectedId('')
    setIncidentTotal(0)
    setPriorityIncidents([])
    setAccounts([])
    setCapabilities(null)
    setSources([])
    setScanJobs([])
    setOverview(null)
    setSettingsOpen(false)
    onLocalDisconnect?.()
  }
  const explanationPending = detail?.explanation_job?.status === 'queued' || detail?.explanation_job?.status === 'running'
  useEffect(() => {
    if (!explanationPending || !selectedId) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
        const result = await api.incident(credentials, selectedId, controller.signal)
        if (!controller.signal.aborted) setDetail(result)
      } catch (reason) {
        if (!controller.signal.aborted) setToast(reason instanceof Error ? reason.message : 'Could not refresh explanation status.')
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void refresh(), 5000)
    }
    timer = setTimeout(() => void refresh(), 3000)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [explanationPending, selectedId, credentials])
  const [explainBusy, setExplainBusy] = useState(false)
  const explainIncident = async () => {
    if (!detail) return
    setExplainBusy(true)
    try {
      const updated = await api.explainIncident(credentials, detail.id)
      if (activeCredentials.current.tenantId !== credentials.tenantId || activeCredentials.current.apiKey !== credentials.apiKey) return
      setDetail(updated)
      const explanation = typeof updated.explanation === 'object' ? updated.explanation : null
      setToast(updated.explanation_job?.status === 'queued' || updated.explanation_job?.status === 'running' ? 'Explanation requested. You can continue working while it is prepared.' : explanation?.source === 'ai' ? 'Plain-language explanation added' : 'The local model was unavailable; the template explanation was kept.')
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : 'Could not explain the incident.')
    } finally {
      setExplainBusy(false)
    }
  }
  const updateStatus = async (status: IncidentStatus, note: string, trust: TrustChoice = 'none') => {
    if (!detail) return false
    setStatusBusy(true)
    try {
      const updated = await api.updateStatus(credentials, detail.id, status, note, trust)
      if (activeCredentials.current.tenantId !== credentials.tenantId || activeCredentials.current.apiKey !== credentials.apiKey) return false
      setDetail(updated)
      setIncidents((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
      setToast(trust !== 'none' ? `Incident moved to ${status.replaceAll('_', ' ')}; sender trusted for new email` : `Incident moved to ${status.replaceAll('_', ' ')}`)
      await fetchData()
      return true
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : 'Could not update the incident.')
      return false
    } finally {
      setStatusBusy(false)
    }
  }
  const createControlledSource = async (draft: SourceDraft) => {
    let accountId = draft.accountId
    if (!accountId) {
      const account = await api.createAccount(credentials, {
        email: draft.email || '',
        display_name: draft.displayName,
        provider: 'controlled',
        profile: 'controlled',
      })
      accountId = account.id
    }
    await api.createSource(credentials, accountId, {
      source_type: 'controlled',
      name: draft.name,
      external_id: draft.externalId,
      capabilities: draft.capabilities,
    })
    setToast('Controlled source added')
    await fetchData()
  }
  const changeSourceStatus = async (source: Source) => {
    const next = source.status === 'active' ? 'disconnected' : 'active'
    setOperationBusy(`source-${source.id}`)
    try {
      if (source.source_type === 'gmail') {
        if (source.status !== 'active') { setSection('analysis'); setToast('Use Google consent to reconnect Gmail.'); return }
        const result = await api.disconnectGmail(credentials, source.id)
        setToast(result.message)
        await fetchData()
        return
      }
      const updated = await api.updateSourceStatus(credentials, source.id, next)
      setSources((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
      setToast(`${source.name} ${next === 'active' ? 'activated' : 'disconnected'}`)
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : 'Could not update the source.')
    } finally {
      setOperationBusy('')
    }
  }
  const navigate = (next: typeof section) => {
    if (next === 'overview' || next === 'incidents') setFilters({ severity: '', status: '', q: '' })
    setSection(next); setMenuOpen(false); window.scrollTo({ top: 0 })
  }
  const changeFilters = (patch: Partial<IncidentFilters>) => { setSelectedId(''); setFilters(current => ({ ...current, ...patch, offset: 0 })) }
  const inspectIncident = (id: string) => { setFilters({ severity: '', status: '', q: '' }); setSelectedId(id); navigate('incidents') }
  const analyzeEmail = async (draft: EmailDraft) => {
    let accountId = draft.accountId
    if (!accountId) {
      const knownAccounts = await api.accounts(credentials)
      const existing = knownAccounts.find(account => account.email?.toLowerCase() === draft.accountEmail.trim().toLowerCase())
      const account = existing ?? await api.createAccount(credentials, { email: draft.accountEmail.trim(), provider: 'controlled', profile: 'controlled', display_name: '' })
      accountId = account.id
    }
    let sourceId = draft.sourceId
    if (!sourceId) {
      const existingSources = await api.sources(credentials, accountId)
      const existing = existingSources.find(source => source.source_type === 'controlled' && source.status === 'active' && source.capabilities?.includes('email'))
      const source = existing ?? await api.createSource(credentials, accountId, { source_type: 'controlled', name: 'Selected emails', external_id: `selected-email:${accountId}:${crypto.randomUUID()}`, capabilities: ['email'] })
      sourceId = source.id
    }
    const digestBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([draft.sender, draft.replyTo, draft.displayName, draft.subject, draft.body, draft.claimedDomains ?? [], draft.spf, draft.dkim, draft.dmarc])))
    const externalId = `selected:${Array.from(new Uint8Array(digestBytes), byte => byte.toString(16).padStart(2, '0')).join('')}`
    const job = await api.scan(credentials, { source_id: sourceId, trigger: 'user' })
    const authentication = Object.fromEntries(Object.entries({ spf: draft.spf, dkim: draft.dkim, dmarc: draft.dmarc }).filter(([, value]) => value))
    const result = await api.ingestSignals(credentials, sourceId, { scan_job_id: job.id, signals: [{ external_id: externalId, signal_type: 'email', features: { sender: draft.sender, reply_to: draft.replyTo, display_name: draft.displayName, subject: draft.subject, body: draft.body, claimed_domains: draft.claimedDomains ?? [], authentication } }] })
    await fetchData()
    return { ...result, accountId }
  }
  const deleteAccount = async () => {
    if (!deleteTarget) return
    setOperationBusy('delete')
    try {
      await api.deleteAccount(credentials, deleteTarget.id)
      setDeleteTarget(null)
      setToast('Local account evidence deleted. Review Google access separately if it was connected.')
      await fetchData()
    } catch (reason) { setToast(reason instanceof Error ? reason.message : 'Deletion failed.') }
    finally { setOperationBusy('') }
  }
  const selected = detail?.id === selectedId ? detail : incidents.find((incident) => incident.id === selectedId) ?? null
  const capabilityItems = useMemo(() => capabilityRows(capabilities), [capabilities])
  const enabledEngineCapabilities = capabilityItems.filter((capability) => capability.enabled).length
  const telemetry = useMemo(() => telemetryCoverage(sources, capabilities), [sources, capabilities])

  return <div className="app-shell">
    <aside ref={navigationPanel} inert={compactNavigation && !menuOpen} className={`sidebar ${menuOpen ? 'is-open' : ''}`}><div className="brand"><span><Icons.shield /></span><div><strong>Sentinel<span>SME</span></strong><small>Email security workspace</small></div></div><div className="workspace-label">ANALYST WORKSPACE</div><nav aria-label="Primary navigation"><button className={section === 'overview' ? 'active' : ''} onClick={() => navigate('overview')}><Icons.grid />Overview</button><button className={section === 'incidents' ? 'active' : ''} onClick={() => navigate('incidents')}><Icons.alert />Incidents{(overview?.incidents.active ?? 0) > 0 && <span className="nav-count">{(overview?.incidents.active ?? 0)}</span>}</button><button className={section === 'evidence' ? 'active' : ''} onClick={() => navigate('evidence')}><Icons.search />Evidence workspace</button><button className={section === 'coverage' ? 'active' : ''} onClick={() => navigate('coverage')}><Icons.building />Accounts & sources</button><button className={section === 'analysis' ? 'active' : ''} onClick={() => navigate('analysis')}><Icons.scan />Email analysis</button><span className="nav-section-label">CONFIGURATION</span><button className={section === 'protection' ? 'active' : ''} onClick={() => navigate('protection')}><Icons.shield />Protection coverage</button><button className={section === 'rules' ? 'active' : ''} onClick={() => navigate('rules')}><Icons.shield />Detection catalogue</button></nav><div className="sidebar-bottom"><div className="protection-status"><span className={telemetry.activeSourceCount ? 'pulse' : ''} /><div><strong>{loading ? 'Checking coverage…' : telemetry.activeSourceCount ? `${telemetry.activeSourceCount} active ${telemetry.activeSourceCount === 1 ? 'source' : 'sources'}` : 'No live monitoring'}</strong><small>{telemetry.mode === 'live' ? 'Gmail samples on demand' : capabilities?.controlled_ingestion ? 'Controlled-data ingestion only' : 'No telemetry connected'}</small></div></div><button onClick={() => setSettingsOpen(true)}><Icons.settings />Settings</button></div></aside>
    {menuOpen && <button aria-label="Close navigation" className="sidebar-scrim" onClick={() => setMenuOpen(false)} />}
    <div className="app-main"><header className="topbar"><button ref={navigationButton} aria-label="Open navigation" aria-expanded={menuOpen} className="icon-button menu-button" onClick={() => setMenuOpen(true)}><Icons.menu /></button><form className="global-search" onSubmit={(event) => { event.preventDefault(); setSection('incidents') }}><Icons.search /><label className="sr-only" htmlFor="global-search">Search incidents</label><input maxLength={200} id="global-search" onChange={(event) => changeFilters({ q: event.target.value })} placeholder="Search incident titles and summaries" value={filters.q} /></form><div className="top-actions"><button aria-label="Analyse email" className="button button-primary scan-button" disabled={!tenantId} onClick={() => navigate('analysis')}><Icons.scan /><span>Analyse email</span></button><button aria-label="API settings" className="avatar-button" onClick={() => setSettingsOpen(true)}><Icons.settings /></button></div></header>

      {tenantId && <div className="data-scope-bar"><span><Icons.lock />{session?.user ? 'Signed in as' : 'Workspace'} <strong>{session?.user?.email ?? tenantId}</strong></span><span className="mode-tag">{telemetry.mode === 'live' ? 'Gmail samples · on demand' : 'Controlled analysis'}</span><span>Local evidence · human review</span></div>}
      <main id="main-content">{!tenantId ? <div className="page"><Panel className="state-card"><h1>Open a local workspace</h1><p>Choose your workspace in Settings.</p><button className="button button-primary" onClick={() => setSettingsOpen(true)}>Configure local workspace</button></Panel></div> : <>
        {supportError && <div className="support-warning" role="status"><Icons.alert />{supportError}</div>}
        {section === 'overview' && <OverviewPanel overview={overview} incidents={priorityIncidents} accounts={accounts} sources={sources} profile={capabilities} jobs={scanJobs} loading={loading} error={priorityError} onRefresh={() => void fetchData()} onInspect={inspectIncident} onNavigate={navigate} />}
        {section === 'evidence' && <EvidenceWorkspace key={tenantId} credentials={credentials} accounts={accounts} sources={sources} onInspect={inspectIncident} />}
        {section === 'protection' && <><ProtectionCoverage profile={capabilities} sources={sources} onAnalyse={() => navigate('analysis')} /><div className="page page-addon"><PostureCheck key={`posture-${tenantId}`} credentials={credentials} accounts={accounts} onComplete={() => void fetchData()} /></div></>}
        {section === 'rules' && <><RuleCatalogue key={tenantId} credentials={credentials} /><div className="page page-addon"><TrustedSenders key={`trusted-${tenantId}`} credentials={credentials} /></div></>}
        {section === 'analysis' && <EmailWorkspace key={tenantId} credentials={credentials} configuration={capabilities?.gmail} accounts={accounts} sources={sources} onRefresh={async () => { await fetchData() }} onAnalyze={analyzeEmail} onInspect={inspectIncident} />}

        {section === 'incidents' && <div className="page page-incidents"><header className="page-header compact"><div><p className="eyebrow">Response workspace</p><h1>Incidents</h1><p>Review cases by severity and recency, then follow their supporting evidence.</p></div><button className="button button-primary" onClick={() => navigate('analysis')}><Icons.scan />Analyse email</button></header><Panel className="filter-bar"><label><span>Severity</span><select onChange={(event) => changeFilters({ severity: event.target.value })} value={filters.severity}><option value="">All severities</option>{severities.map((severity) => <option key={severity} value={severity}>{humanize(severity)}</option>)}</select></label><label><span>Status</span><select onChange={(event) => changeFilters({ status: event.target.value })} value={filters.status}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select></label><label><span>Account</span><select value={filters.accountId ?? ''} onChange={event => changeFilters({ accountId: event.target.value })}><option value="">All accounts</option>{accounts.map(account => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</select></label><label><span>Latest evidence from (local time)</span><input type="datetime-local" value={filters.seenFrom ?? ''} onChange={event => changeFilters({ seenFrom: event.target.value })} /></label><label><span>Latest evidence until (local time)</span><input type="datetime-local" min={filters.seenFrom} value={filters.seenTo ?? ''} onChange={event => changeFilters({ seenTo: event.target.value })} /></label><span className="result-count">{incidentTotal} {incidentTotal === 1 ? 'incident' : 'incidents'}</span></Panel><div className="incident-workspace"><Panel className="incident-rail">{loading ? <LoadingRows count={6} /> : error ? <ErrorState message={error} retry={() => void fetchData()} /> : incidents.length ? <div className="incident-list">{incidents.map((incident) => <IncidentRow incident={{ ...incident, account_name: accountLabel(accounts.find(account => account.id === incident.account_id) ?? { id: incident.account_id ?? "" }) }} key={incident.id} onSelect={() => setSelectedId(incident.id)} selected={incident.id === selectedId} />)}</div> : <EmptyState filtered={Boolean(filters.q || filters.severity || filters.status || filters.accountId || filters.seenFrom || filters.seenTo)} />}<Pagination total={incidentTotal} offset={filters.offset ?? 0} limit={25} busy={loading} onChange={offset => { setSelectedId(''); setFilters(current => ({ ...current, offset })) }} /></Panel><Panel className="detail-panel">{detailLoading ? <LoadingRows count={6} /> : detailError ? <ErrorState message={detailError} retry={() => void fetchData()} /> : selected ? <IncidentDetail key={`${selected.id}:${selected.status}`} incident={selected} loading={detailLoading} onStatus={updateStatus} statusBusy={statusBusy} aiAvailable={Boolean(capabilities?.ai_explanations)} onExplain={explainIncident} explainBusy={explainBusy} /> : <div className="state-card detail-placeholder"><span className="state-icon"><Icons.alert /></span><h3>Select an incident</h3><p>Choose a record to review evidence and response guidance.</p></div>}</Panel></div></div>}

        {section === 'coverage' && <div className="page">
          <header className="page-header"><div><p className="eyebrow">Connected environment</p><h1>Accounts & sources</h1><p>Manage consent, review processed data, and inspect available detectors.</p></div><div className="page-actions"><button className="button button-secondary" onClick={() => setSourceOpen(true)}>Add source</button><button className="button button-primary" onClick={() => navigate('analysis')}><Icons.scan />Analyse email</button></div></header>
          {!loading && telemetry.mode === 'none' && <div className="coverage-alert" role="status"><Icons.alert /><div><strong>No live monitoring</strong><p>{capabilities?.controlled_ingestion ? 'This workspace currently supports controlled-data ingestion only. Add or activate a source to establish telemetry coverage.' : 'Add a selected-data source or connect Gmail for on-demand analysis.'}</p></div><button className="button button-secondary" onClick={() => setSourceOpen(true)}>Add source</button></div>}
          <div className="coverage-layout">
            <Panel><div className="panel-heading"><div><p className="eyebrow">Telemetry sources</p><h2>Registered accounts</h2></div><span>{telemetry.activeSourceCount} active</span></div>{loading ? <LoadingRows /> : accounts.length ? <div className="source-groups">{accounts.map((account) => { const label = accountLabel(account); const accountSources = sources.filter((source) => source.account_id === account.id); return <section className="source-group" key={account.id}><header><span className="account-avatar">{label.slice(0, 2).toUpperCase()}</span><div><strong>{label}</strong><small>{account.email || account.provider || account.id}</small></div></header>{account.delete_after && <p className="retention-note">Local trial data expires {formatDateTime(account.delete_after)}.</p>}<button className="link-button delete-account-link" onClick={() => setDeleteTarget(account)}>Delete local account data</button>{accountSources.length ? <div className="source-list">{accountSources.map((source) => <article className="source-card" key={source.id}><div><strong>{source.name}</strong><span>{humanize(source.source_type || 'controlled')} · {source.capabilities?.length ?? 0} signal types</span><small>{overview?.source_activity[source.id] ? overview.source_activity[source.id].signal_count + ' signals · ' + relativeTime(overview.source_activity[source.id].last_received_at) : 'No signals processed'}</small></div><div className="source-actions"><StatusBadge status={source.status || 'unknown'} /><button className="link-button" disabled={operationBusy === `source-${source.id}`} onClick={() => void changeSourceStatus(source)}>{operationBusy === `source-${source.id}` ? 'Updating…' : source.status === 'active' ? 'Disconnect' : source.source_type === 'gmail' ? 'Reconnect Gmail' : 'Activate'}</button></div></article>)}</div> : <p className="inline-note">No source registered for this account.</p>}</section>})}</div> : <div className="state-card compact-state"><span className="state-icon"><Icons.building /></span><h3>Add your first controlled source</h3><p>Create an account and define the normalized signal types SentinelSME may accept.</p><button className="button button-primary" onClick={() => setSourceOpen(true)}>Add source</button></div>}</Panel>
            <Panel><div className="panel-heading"><div><p className="eyebrow">Engine support</p><h2>{capabilities?.service || 'SentinelSME'} capabilities</h2></div><span>{enabledEngineCapabilities} supported</span></div>{loading ? <LoadingRows /> : capabilityItems.length ? <><div className="capability-grid">{capabilityItems.map((capability) => { const connected = capability.id.startsWith('signal-') && telemetry.activeCapabilities.includes(capability.id.replace('signal-', '')); return <article key={capability.id}><span className={`capability-icon ${!capability.enabled ? 'disabled' : ''}`}><Icons.shield /></span><div><strong>{capability.name}</strong><p>{capability.description}</p><span className={connected ? 'control-on' : 'control-off'}>{connected ? 'Source accepts this signal' : capability.enabled ? 'Available detector' : 'Unavailable'}</span></div></article> })}</div>{capabilities && <div className="capability-facts"><span>{capabilities.correlation_window_minutes} min correlation</span><span>{capabilities.source_types.length} source types</span><span>{capabilities.live_connectors.length} live connectors</span><span>{capabilities.privacy.stores_full_bodies || capabilities.privacy.stores_attachments ? 'Content retention enabled' : 'No full bodies or attachments stored'}</span></div>}</> : <div className="state-card compact-state"><h3>No capability profile</h3><p>The API did not report its supported detection contract.</p></div>}</Panel>
          </div>
          <Panel className="operations-panel"><div className="panel-heading"><div><p className="eyebrow">Operations</p><h2>Analysis history</h2></div><span>{scanJobs.length} {scanJobs.length === 1 ? 'job' : 'jobs'}</span></div>{loading ? <LoadingRows /> : scanJobs.length ? <div className="scan-history">{scanJobs.slice(0, 12).map((job) => { const source = sources.find((item) => item.id === job.source_id); return <article className="scan-row" key={job.id}><span className={`scan-status scan-status-${job.status}`}><Icons.scan /></span><div className="scan-main"><strong>{source?.name || 'Controlled source'}</strong><span>{humanize(job.trigger)} scan · {formatDateTime(job.created_at)}</span>{job.error && <small className="scan-error">{job.error}</small>}</div><div className="scan-counts"><span><strong>{job.imported_count}</strong> imported</span><span><strong>{job.finding_count}</strong> findings</span><span><strong>{job.duplicate_count}</strong> duplicates</span></div><StatusBadge status={job.status} />{job.status === 'failed' && <button className="button button-secondary button-small" onClick={() => navigate('analysis')}>Run another analysis</button>}</article>})}</div> : <div className="state-card compact-state"><span className="state-icon"><Icons.scan /></span><h3>No analysis yet</h3><p>Inspect a selected email or run a Gmail inbox sample.</p></div>}</Panel>
        </div>}
      </>}</main>
    </div>
    {deleteTarget && <Modal title="Delete local account data" description="This removes this account's local sources, tokens, signals, incidents, recommendations, and audit details. It does not delete anything from Gmail." onClose={() => setDeleteTarget(null)}><p className="muted-copy">Disconnect Gmail first to request provider revocation. This deletion cannot be undone.</p><div className="modal-actions"><button className="button button-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button><button className="button button-danger" disabled={operationBusy === 'delete'} onClick={() => void deleteAccount()}>{operationBusy === 'delete' ? 'Deleting…' : 'Delete local data'}</button></div></Modal>}
    {settingsOpen && (session?.user && onSignOut ? <SessionModal email={session.user.email} hours={session.session_hours} onClose={() => setSettingsOpen(false)} onSignOut={onSignOut} onDelete={async () => { await api.deleteIdentity(credentials); window.dispatchEvent(new Event('sentinelsme:session-expired')) }} /> : <SettingsModal currentKey={apiKey} currentTenant={tenantId} onClear={disconnect} onClose={() => setSettingsOpen(false)} onSave={connect} />)}
    {sourceOpen && <AddSourceModal accounts={accounts} onClose={() => setSourceOpen(false)} onCreate={createControlledSource} profile={capabilities} />}
    {toast && <div aria-live="polite" className="toast" role="status"><Icons.check />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><Icons.close /></button></div>}
  </div>
}
