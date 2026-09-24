import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api } from './api'
import { Icons } from './icons'
import type { Account, CapabilityProfile, Credentials, Incident, IncidentFilters, IncidentStatus, ScanRequest, Severity, Source } from './types'
import { accountLabel, formatDateTime, humanize, incidentTitle, prioritizeIncidents, relativeTime, scorePercent, telemetryCoverage } from './utils'

const KEY_STORAGE = 'sentinelsme.apiKey'
const TENANT_STORAGE = 'sentinelsme.tenantId'
const statuses: IncidentStatus[] = ['new', 'under_review', 'resolved', 'false_positive']
const transitions: Record<IncidentStatus, IncidentStatus[]> = {
  new: ['under_review', 'false_positive'],
  under_review: ['resolved', 'false_positive'],
  resolved: ['under_review'],
  false_positive: [],
}
const severities: Severity[] = ['critical', 'high', 'medium', 'low']

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
    { id: 'ai-explanations', name: 'AI explanations', description: 'Optional generated incident context.', enabled: profile.ai_explanations },
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
  return <div className="state-card"><span className="state-icon"><Icons.shield /></span><h3>{filtered ? 'No matching incidents' : 'Your queue is clear'}</h3><p>{filtered ? 'Try broadening your filters or changing the search term.' : 'No incidents require attention right now. Keep monitoring and run controlled scans when needed.'}</p></div>
}

function Modal({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: ReactNode }) {
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeButton.current?.focus()
    const handler = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section aria-describedby={description ? 'modal-description' : undefined} aria-labelledby="modal-title" aria-modal="true" className="modal" role="dialog"><header><div><p className="eyebrow">SentinelSME</p><h2 id="modal-title">{title}</h2>{description && <p id="modal-description">{description}</p>}</div><button aria-label="Close dialog" className="icon-button" onClick={onClose} ref={closeButton}><Icons.close /></button></header>{children}</section></div>
}

function ConnectionCard({ onConnect }: { onConnect: (credentials: Credentials) => void }) {
  const [key, setKey] = useState('')
  const [tenantId, setTenantId] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (key.trim() && tenantId.trim()) onConnect({ apiKey: key.trim(), tenantId: tenantId.trim() })
  }
  return <div className="connection-wrap"><div className="connection-art" aria-hidden="true"><div className="radar radar-one" /><div className="radar radar-two" /><div className="connection-shield"><Icons.shield /></div></div><Panel className="connection-card"><span className="state-icon"><Icons.lock /></span><p className="eyebrow">Secure workspace</p><h1>Connect your security console</h1><p>Enter your workspace and API key to view protected incidents, response guidance, and account coverage.</p><form onSubmit={submit}><label htmlFor="initial-tenant">Workspace ID</label><input autoComplete="organization" id="initial-tenant" onChange={(event) => setTenantId(event.target.value)} placeholder="Your tenant ID" value={tenantId} /><label htmlFor="initial-key">API key</label><input autoComplete="off" id="initial-key" onChange={(event) => setKey(event.target.value)} placeholder="Paste your API key" type="password" value={key} /><p className="field-help">Stored for this browser session only. It is removed when the session ends.</p><button className="button button-primary button-full" disabled={!key.trim() || !tenantId.trim()} type="submit"><Icons.lock />Connect securely</button></form></Panel></div>
}

function IncidentRow({ incident, onSelect, selected = false }: { incident: Incident; onSelect: () => void; selected?: boolean }) {
  const time = incident.detected_at ?? incident.last_seen_at ?? incident.created_at ?? incident.updated_at
  const explanation = typeof incident.explanation === 'string' ? incident.explanation : incident.explanation?.what_happened
  const displayedScore = scorePercent(incident.score)
  return <button aria-current={selected ? 'true' : undefined} className={`incident-row ${selected ? 'is-selected' : ''}`} onClick={onSelect}><span className={`severity-line severity-bg-${incident.severity}`} /><span className="incident-main"><span className="incident-topline"><SeverityBadge severity={incident.severity} /><StatusBadge status={incident.status} /></span><strong>{incidentTitle(incident)}</strong><span className="incident-summary">{incident.summary || explanation || 'Security activity requires review.'}</span><span className="incident-meta"><span>{incident.source || incident.account_name || 'Sentinel engine'}</span><span>·</span><span>{relativeTime(time)}</span></span></span>{displayedScore !== undefined && <span className="risk-score"><strong>{displayedScore}</strong><small>risk</small></span>}<Icons.arrow className="row-arrow" /></button>
}

function StatCard({ label, value, detail, tone, icon }: { label: string; value: number; detail: string; tone: string; icon: ReactNode }) {
  return <Panel className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><div><p>{label}</p><strong>{value}</strong><span>{detail}</span></div></Panel>
}

interface DetailProps {
  incident: Incident
  loading: boolean
  onStatus: (status: IncidentStatus, note: string) => Promise<void>
  statusBusy: boolean
}

function IncidentDetail({ incident, loading, onStatus, statusBusy }: DetailProps) {
  const [nextStatus, setNextStatus] = useState(incident.status)
  const [note, setNote] = useState('')
  const findings = incident.findings ?? []
  const recommendationItems = incident.recommendations ?? incident.recommended_actions ?? []
  const recommendations = recommendationItems.map((item) => typeof item === 'string' ? item : item.action)
  const explanation = typeof incident.explanation === 'string' ? null : incident.explanation
  const explanationText = typeof incident.explanation === 'string' ? incident.explanation : undefined
  const availableStatuses = [incident.status, ...transitions[incident.status]]
  const displayedScore = scorePercent(incident.score)
  useEffect(() => setNextStatus(incident.status), [incident.id, incident.status])

  return <article className="detail-pane" aria-busy={loading}>
    <header className="detail-header"><div><div className="badge-line"><SeverityBadge severity={incident.severity} /><StatusBadge status={incident.status} /><span className="incident-id">#{incident.id}</span></div><h2>{incidentTitle(incident)}</h2><p>{incident.summary || explanation?.what_happened || explanationText || 'This signal requires investigation by your security team.'}</p></div>{displayedScore !== undefined && <div aria-label={`${displayedScore} out of 100 risk score`} className={`score-ring score-${incident.severity}`} style={{ '--score': displayedScore } as React.CSSProperties}><strong>{displayedScore}</strong><span>risk score</span></div>}</header>

    <div className="answer-grid"><div><span>What happened</span><p>{explanation?.what_happened || incident.summary || incidentTitle(incident)}</p></div><div><span>Why it matters</span><p>{explanation?.why_it_matters || explanationText || 'The activity crossed your configured security thresholds.'}</p></div><div><span>Severity</span><p><strong className={`text-${incident.severity}`}>{incident.severity}</strong>{displayedScore !== undefined ? ` · ${displayedScore}/100 risk` : ' risk'}</p></div><div><span>Recommended next step</span><p>{explanation?.next_step || recommendations[0] || 'Validate the evidence, contact the account owner, and update the incident status.'}</p></div></div>

    <section className="detail-section"><div className="section-heading"><div><p className="eyebrow">Transparent detection</p><h3>Evidence</h3></div><span>{findings.length} {findings.length === 1 ? 'finding' : 'findings'}</span></div>{findings.length ? <div className="table-wrap"><table><thead><tr><th scope="col">Rule</th><th scope="col">Finding</th><th scope="col">Observed evidence</th><th scope="col">Weight</th></tr></thead><tbody>{findings.map((finding, index) => <tr key={finding.id ?? finding.rule_id ?? index}><td><code>{finding.rule_code || finding.rule_id || finding.id || '—'}</code></td><td><strong>{finding.title}</strong></td><td>{typeof finding.evidence === 'string' ? finding.evidence : JSON.stringify(finding.evidence)}</td><td>{typeof finding.weight === 'number' ? `+${Math.round(finding.weight)}` : '—'}</td></tr>)}</tbody></table></div> : <div className="inline-empty"><Icons.check /><span>No rule evidence was attached to this incident.</span></div>}</section>

    <div className="detail-columns"><section className="detail-section"><div className="section-heading"><div><p className="eyebrow">Response plan</p><h3>Recommended actions</h3></div></div>{recommendations.length ? <ol className="action-list">{recommendations.map((item, index) => <li key={`${item}-${index}`}><span>{index + 1}</span><p>{item}</p></li>)}</ol> : <div className="inline-empty"><span>No specific recommendations were returned.</span></div>}</section>
      <section className="detail-section"><div className="section-heading"><div><p className="eyebrow">Incident lifecycle</p><h3>Move response forward</h3></div></div><form className="status-form" onSubmit={(event) => { event.preventDefault(); void onStatus(nextStatus, note).then(() => setNote('')) }}><label htmlFor="next-status">Status</label><select id="next-status" onChange={(event) => setNextStatus(event.target.value as IncidentStatus)} value={nextStatus}>{availableStatuses.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select>{!transitions[incident.status].length && <p className="field-help">False-positive incidents are final and have no further transitions.</p>}<label htmlFor="status-note">Handoff note <span>(optional)</span></label><textarea id="status-note" onChange={(event) => setNote(event.target.value)} placeholder="Add context for the next responder…" rows={3} value={note} /><button className="button button-primary" disabled={statusBusy || nextStatus === incident.status} type="submit">{statusBusy ? 'Updating…' : 'Update incident'}</button></form></section></div>

    {!!incident.audit?.length && <section className="detail-section"><div className="section-heading"><div><p className="eyebrow">Accountability</p><h3>Audit trail</h3></div></div><ol className="timeline">{incident.audit.map((entry, index) => <li key={entry.id ?? index}><span className="timeline-dot" /><div><strong>{entry.action ? humanize(entry.action) : entry.to_status ? `Status changed to ${humanize(entry.to_status)}` : 'Incident updated'}</strong>{(entry.note || entry.detail) && <p>{entry.note || entry.detail}</p>}<small>{entry.actor || 'SentinelSME'} · {formatDateTime(entry.created_at ?? entry.timestamp)}</small></div></li>)}</ol></section>}
  </article>
}

function SettingsModal({ currentTenant, hasKey, onClose, onSave, onClear }: { currentTenant: string; hasKey: boolean; onClose: () => void; onSave: (credentials: Credentials) => void; onClear: () => void }) {
  const [key, setKey] = useState('')
  const [tenantId, setTenantId] = useState(currentTenant)
  return <Modal description="Manage the workspace and credential used to authenticate API requests." onClose={onClose} title="API connection"><form className="modal-form" onSubmit={(event) => { event.preventDefault(); if (key.trim() && tenantId.trim()) onSave({ apiKey: key.trim(), tenantId: tenantId.trim() }) }}><div className={`connection-status ${hasKey ? 'connected' : ''}`}><span /><div><strong>{hasKey ? 'API key configured' : 'No API key configured'}</strong><p>{hasKey ? `Protected requests are scoped to ${currentTenant}.` : 'Add a key to connect to your workspace.'}</p></div></div><label htmlFor="settings-tenant">Workspace ID</label><input autoComplete="organization" id="settings-tenant" onChange={(event) => setTenantId(event.target.value)} placeholder="Your tenant ID" value={tenantId} /><label htmlFor="settings-key">{hasKey ? 'Replace API key' : 'API key'}</label><input autoComplete="off" id="settings-key" onChange={(event) => setKey(event.target.value)} placeholder={hasKey ? 'Enter a new key' : 'Paste your API key'} type="password" value={key} /><p className="field-help"><Icons.lock /> Credentials stay in session storage only—never local storage.</p><footer className="modal-actions">{hasKey && <button className="button button-danger" onClick={onClear} type="button">Disconnect</button>}<span /><button className="button button-secondary" onClick={onClose} type="button">Cancel</button><button className="button button-primary" disabled={!key.trim() || !tenantId.trim()} type="submit">Save & connect</button></footer></form></Modal>
}

function ScanModal({ accounts, sources, onClose, onScan }: { accounts: Account[]; sources: Source[]; onClose: () => void; onScan: (payload: ScanRequest) => Promise<void> }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const matchingSources = sources.filter((source) => !source.account_id || source.account_id === accountId)
  const [sourceId, setSourceId] = useState(matchingSources[0]?.id ?? '')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  return <Modal description="Run a bounded scan only against a source you are authorized to assess." onClose={onClose} title="Start a controlled scan"><form className="modal-form" onSubmit={(event) => { event.preventDefault(); setBusy(true); void onScan({ source_id: sourceId, trigger: 'user' }).then(onClose).finally(() => setBusy(false)) }}><label htmlFor="scan-account">Protected account</label><select id="scan-account" onChange={(event) => { const nextAccount = event.target.value; setAccountId(nextAccount); setSourceId(sources.find((source) => !source.account_id || source.account_id === nextAccount)?.id ?? '') }} required value={accountId}><option disabled value="">Select an account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</select><label htmlFor="scan-source">Data source</label><select id="scan-source" onChange={(event) => setSourceId(event.target.value)} required value={sourceId}><option disabled value="">{matchingSources.length ? 'Select a source' : 'No sources connected'}</option>{matchingSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select>{!matchingSources.length && <p className="field-help">Connect a source to this account through the API before starting a scan.</p>}<label className="check-field"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>I confirm this is an authorized, controlled assessment.</span></label><footer className="modal-actions"><span /><button className="button button-secondary" onClick={onClose} type="button">Cancel</button><button className="button button-primary" disabled={!sourceId || !confirmed || busy} type="submit"><Icons.scan />{busy ? 'Starting…' : 'Start scan'}</button></footer></form></Modal>
}

export default function App() {
  const [apiKey, setApiKey] = useState(readKey)
  const [tenantId, setTenantId] = useState(readTenant)
  const [section, setSection] = useState<'overview' | 'incidents' | 'coverage'>('overview')
  const [filters, setFilters] = useState<IncidentFilters>({ severity: '', status: '', q: '' })
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [capabilities, setCapabilities] = useState<CapabilityProfile | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [detail, setDetail] = useState<Incident | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [supportError, setSupportError] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState('')
  const credentials = useMemo(() => ({ apiKey, tenantId }), [apiKey, tenantId])

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!apiKey || !tenantId) return
    setLoading(true)
    setError('')
    setSupportError('')
    const [incidentResult, accountResult, capabilityResult] = await Promise.allSettled([
      api.incidents(credentials, filters, signal),
      api.accounts(credentials, signal),
      api.capabilities(credentials, signal),
    ])
    if (incidentResult.status === 'fulfilled') {
      const sorted = prioritizeIncidents(incidentResult.value)
      setIncidents(sorted)
      setSelectedId((current) => current && sorted.some((item) => item.id === current) ? current : (sorted[0]?.id ?? ''))
    } else if (incidentResult.reason?.name !== 'AbortError') {
      setError(incidentResult.reason instanceof Error ? incidentResult.reason.message : 'Unable to load incidents.')
    }
    if (accountResult.status === 'fulfilled') {
      setAccounts(accountResult.value)
      const sourceResults = await Promise.allSettled(accountResult.value.map((account) => api.sources(credentials, account.id, signal)))
      setSources(sourceResults.flatMap((result) => result.status === 'fulfilled' ? result.value : []))
    }
    else if (accountResult.reason?.name !== 'AbortError') setSupportError('Some account coverage data is unavailable.')
    if (capabilityResult.status === 'fulfilled') setCapabilities(capabilityResult.value)
    else if (capabilityResult.reason?.name !== 'AbortError') setSupportError('Some account and capability data is unavailable.')
    if (!signal?.aborted) setLoading(false)
  }, [apiKey, credentials, filters, tenantId])

  useEffect(() => {
    const controller = new AbortController()
    void fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  useEffect(() => {
    if (!apiKey || !tenantId || !selectedId) { setDetail(null); return }
    const controller = new AbortController()
    setDetailLoading(true)
    api.incident(credentials, selectedId, controller.signal)
      .then(setDetail)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setDetail(incidents.find((item) => item.id === selectedId) ?? null)
      })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false) })
    return () => controller.abort()
  }, [apiKey, credentials, selectedId, incidents, tenantId])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const connect = (nextCredentials: Credentials) => {
    sessionStorage.setItem(KEY_STORAGE, nextCredentials.apiKey)
    sessionStorage.setItem(TENANT_STORAGE, nextCredentials.tenantId)
    setApiKey(nextCredentials.apiKey)
    setTenantId(nextCredentials.tenantId)
    setSettingsOpen(false)
    setToast('Connected securely')
  }
  const disconnect = () => {
    sessionStorage.removeItem(KEY_STORAGE)
    sessionStorage.removeItem(TENANT_STORAGE)
    setApiKey('')
    setTenantId('')
    setIncidents([])
    setAccounts([])
    setCapabilities(null)
    setSources([])
    setSettingsOpen(false)
  }
  const updateStatus = async (status: IncidentStatus, note: string) => {
    if (!detail) return
    setStatusBusy(true)
    try {
      const updated = await api.updateStatus(credentials, detail.id, status, note)
      setDetail(updated)
      setIncidents((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
      setToast(`Incident moved to ${status.replaceAll('_', ' ')}`)
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : 'Could not update the incident.')
    } finally {
      setStatusBusy(false)
    }
  }
  const startScan = async (payload: ScanRequest) => {
    try {
      const result = await api.scan(credentials, payload)
      setToast(result.message || 'Controlled scan started')
      await fetchData()
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : 'Could not start the scan.')
      throw reason
    }
  }
  const navigate = (next: typeof section) => { setSection(next); setMenuOpen(false) }
  const selected = detail?.id === selectedId ? detail : incidents.find((incident) => incident.id === selectedId) ?? null
  const counts = useMemo(() => ({
    critical: incidents.filter((item) => item.severity === 'critical' && item.status !== 'resolved').length,
    active: incidents.filter((item) => ['new', 'under_review'].includes(item.status)).length,
    investigating: incidents.filter((item) => item.status === 'under_review').length,
    resolved: incidents.filter((item) => item.status === 'resolved').length,
  }), [incidents])
  const capabilityItems = useMemo(() => capabilityRows(capabilities), [capabilities])
  const enabledEngineCapabilities = capabilityItems.filter((capability) => capability.enabled).length
  const telemetry = useMemo(() => telemetryCoverage(sources, capabilities), [sources, capabilities])

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}><div className="brand"><span><Icons.shield /></span><div><strong>Sentinel<span>SME</span></strong><small>Security operations</small></div></div><nav aria-label="Primary navigation"><button className={section === 'overview' ? 'active' : ''} onClick={() => navigate('overview')}><Icons.grid />Overview</button><button className={section === 'incidents' ? 'active' : ''} onClick={() => navigate('incidents')}><Icons.alert />Incidents{counts.active > 0 && <span className="nav-count">{counts.active}</span>}</button><button className={section === 'coverage' ? 'active' : ''} onClick={() => navigate('coverage')}><Icons.building />Coverage</button></nav><div className="sidebar-bottom"><div className="protection-status"><span className={telemetry.activeSourceCount ? 'pulse' : ''} /><div><strong>{loading ? 'Checking coverage…' : telemetry.activeSourceCount ? `${telemetry.activeSourceCount} active ${telemetry.activeSourceCount === 1 ? 'source' : 'sources'}` : 'No active monitoring'}</strong><small>{telemetry.mode === 'live' ? 'Live connector telemetry' : capabilities?.controlled_ingestion ? 'Controlled-data ingestion only' : 'No telemetry connected'}</small></div></div><button onClick={() => setSettingsOpen(true)}><Icons.settings />Settings</button></div></aside>
    {menuOpen && <button aria-label="Close navigation" className="sidebar-scrim" onClick={() => setMenuOpen(false)} />}
    <div className="app-main"><header className="topbar"><button aria-label="Open navigation" className="icon-button menu-button" onClick={() => setMenuOpen(true)}><Icons.menu /></button><form className="global-search" onSubmit={(event) => { event.preventDefault(); setSection('incidents') }}><Icons.search /><label className="sr-only" htmlFor="global-search">Search incidents</label><input id="global-search" onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Search incidents, signals, or accounts" value={filters.q} /></form><div className="top-actions"><button className="button button-primary scan-button" disabled={!apiKey} onClick={() => setScanOpen(true)}><Icons.scan /><span>New scan</span></button><button aria-label="API settings" className="avatar-button" onClick={() => setSettingsOpen(true)}><span>{apiKey ? 'SO' : '?'}</span><i className={apiKey ? 'online' : ''} /></button></div></header>

      <main id="main-content">{!apiKey || !tenantId ? <ConnectionCard onConnect={connect} /> : <>
        {supportError && <div className="support-warning" role="status"><Icons.alert />{supportError}</div>}
        {section === 'overview' && <div className="page page-overview"><header className="page-header"><div><p className="eyebrow">Security posture</p><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}</h1><p>Here’s what needs your attention across the business.</p></div><button aria-label="Refresh dashboard" className="button button-secondary" disabled={loading} onClick={() => void fetchData()}><Icons.refresh className={loading ? 'spinning' : ''} />Refresh</button></header><div className="stats-grid"><StatCard detail="Require immediate review" icon={<Icons.alert />} label="Critical" tone="red" value={counts.critical} /><StatCard detail="Open response work" icon={<Icons.clock />} label="Active incidents" tone="orange" value={counts.active} /><StatCard detail="Being investigated" icon={<Icons.search />} label="Under review" tone="blue" value={counts.investigating} /><StatCard detail="Closed in this view" icon={<Icons.check />} label="Resolved" tone="green" value={counts.resolved} /></div><div className="dashboard-grid"><Panel className="queue-panel"><div className="panel-heading"><div><p className="eyebrow">Priority queue</p><h2>Incidents needing attention</h2></div><button className="link-button" onClick={() => setSection('incidents')}>View all <Icons.arrow /></button></div>{loading ? <LoadingRows count={4} /> : error ? <ErrorState message={error} retry={() => void fetchData()} /> : incidents.length ? <div className="incident-list">{incidents.slice(0, 5).map((incident) => <IncidentRow incident={incident} key={incident.id} onSelect={() => { setSelectedId(incident.id); setSection('incidents') }} />)}</div> : <EmptyState />}</Panel><div className="side-stack"><Panel className="posture-card"><div className="panel-heading"><div><p className="eyebrow">Telemetry</p><h2>Connected coverage</h2></div><span className={`telemetry-state telemetry-${telemetry.mode}`}>{telemetry.mode === 'live' ? 'Live telemetry' : telemetry.mode === 'controlled' ? 'Controlled data' : 'Not monitoring'}</span></div><div className="coverage-score"><div className="coverage-ring" style={{ '--coverage': `${telemetry.percent}%` } as React.CSSProperties}><strong>{telemetry.percent}%</strong><span>covered</span></div><div><strong>{telemetry.activeSourceCount} active {telemetry.activeSourceCount === 1 ? 'source' : 'sources'}</strong><span>{telemetry.activeCapabilities.length} of {telemetry.supportedCapabilityCount} supported signal types connected</span></div></div>{telemetry.mode !== 'live' && <p className="telemetry-note"><Icons.alert />{telemetry.mode === 'controlled' ? 'Active sources provide controlled data; no live connector is available.' : 'No active source is providing telemetry. Engine support alone does not monitor your environment.'}</p>}<button className="button button-secondary button-full" onClick={() => setSection('coverage')}>Review coverage</button></Panel><Panel className="capability-mini"><div className="panel-heading"><div><p className="eyebrow">Detection engine</p><h2>Supported capabilities</h2></div></div>{capabilityItems.length ? <ul>{capabilityItems.slice(0, 4).map((capability) => <li key={capability.id}><span className={!capability.enabled ? 'off' : ''}><Icons.check /></span><div><strong>{capability.name}</strong><small>{capability.description}</small></div></li>)}</ul> : <p className="muted-copy">No engine capabilities have been reported by the API.</p>}</Panel></div></div></div>}

        {section === 'incidents' && <div className="page page-incidents"><header className="page-header compact"><div><p className="eyebrow">Response workspace</p><h1>Incidents</h1><p>Prioritized by risk, then recency.</p></div><button className="button button-primary" onClick={() => setScanOpen(true)}><Icons.scan />New scan</button></header><Panel className="filter-bar"><label><span>Severity</span><select onChange={(event) => setFilters((current) => ({ ...current, severity: event.target.value }))} value={filters.severity}><option value="">All severities</option>{severities.map((severity) => <option key={severity}>{humanize(severity)}</option>)}</select></label><label><span>Status</span><select onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} value={filters.status}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select></label><span className="result-count">{incidents.length} {incidents.length === 1 ? 'incident' : 'incidents'}</span></Panel><div className="incident-workspace"><Panel className="incident-rail">{loading ? <LoadingRows count={6} /> : error ? <ErrorState message={error} retry={() => void fetchData()} /> : incidents.length ? <div className="incident-list">{incidents.map((incident) => <IncidentRow incident={incident} key={incident.id} onSelect={() => setSelectedId(incident.id)} selected={incident.id === selectedId} />)}</div> : <EmptyState filtered={Boolean(filters.q || filters.severity || filters.status)} />}</Panel><Panel className="detail-panel">{selected ? <IncidentDetail incident={selected} loading={detailLoading} onStatus={updateStatus} statusBusy={statusBusy} /> : <div className="state-card detail-placeholder"><span className="state-icon"><Icons.alert /></span><h3>Select an incident</h3><p>Choose a record to review evidence and response guidance.</p></div>}</Panel></div></div>}

        {section === 'coverage' && <div className="page"><header className="page-header"><div><p className="eyebrow">Connected environment</p><h1>Coverage</h1><p>Connected telemetry is shown separately from engine support.</p></div><button className="button button-primary" onClick={() => setScanOpen(true)}><Icons.scan />New scan</button></header>{!loading && telemetry.mode === 'none' && <div className="coverage-alert" role="status"><Icons.alert /><div><strong>No active monitoring</strong><p>{capabilities?.controlled_ingestion ? 'This workspace currently supports controlled-data ingestion only. Connect and activate a source to establish telemetry coverage.' : 'Connect and activate a source to establish telemetry coverage.'}</p></div></div>}<div className="coverage-layout"><Panel><div className="panel-heading"><div><p className="eyebrow">Telemetry sources</p><h2>Connected accounts</h2></div><span>{telemetry.activeSourceCount} active</span></div>{loading ? <LoadingRows /> : accounts.length ? <div className="account-list">{accounts.map((account) => { const label = accountLabel(account); const accountSources = sources.filter((source) => source.account_id === account.id); const activeAccountSources = accountSources.filter((source) => source.status === 'active'); return <article key={account.id}><span className="account-avatar">{label.slice(0, 2).toUpperCase()}</span><div><strong>{label}</strong><span>{account.email || account.provider || account.id}</span><small>{activeAccountSources.length} of {accountSources.length} sources active</small></div><StatusBadge status={activeAccountSources.length ? 'telemetry active' : 'not monitoring'} /></article> })}</div> : <EmptyState />}</Panel><Panel><div className="panel-heading"><div><p className="eyebrow">Engine support</p><h2>{capabilities?.service || 'SentinelSME'} capabilities</h2></div><span>{enabledEngineCapabilities} supported</span></div>{loading ? <LoadingRows /> : capabilityItems.length ? <><div className="capability-grid">{capabilityItems.map((capability) => { const connected = capability.id.startsWith('signal-') && telemetry.activeCapabilities.includes(capability.id.replace('signal-', '')); return <article key={capability.id}><span className={`capability-icon ${!capability.enabled ? 'disabled' : ''}`}><Icons.shield /></span><div><strong>{capability.name}</strong><p>{capability.description}</p><span className={connected ? 'control-on' : 'control-off'}>{connected ? 'Telemetry connected' : capability.enabled ? 'Supported · not connected' : 'Unavailable'}</span></div></article> })}</div>{capabilities && <div className="capability-facts"><span>{capabilities.correlation_window_minutes} min correlation</span><span>{capabilities.source_types.length} source types</span><span>{capabilities.live_connectors.length} live connectors</span><span>{capabilities.privacy.stores_full_bodies || capabilities.privacy.stores_attachments ? 'Content retention enabled' : 'No full bodies or attachments stored'}</span></div>}</> : <EmptyState />}</Panel></div></div>}
      </>}</main>
    </div>
    {settingsOpen && <SettingsModal currentTenant={tenantId} hasKey={Boolean(apiKey && tenantId)} onClear={disconnect} onClose={() => setSettingsOpen(false)} onSave={connect} />}
    {scanOpen && <ScanModal accounts={accounts} onClose={() => setScanOpen(false)} onScan={startScan} sources={sources} />}
    {toast && <div aria-live="polite" className="toast" role="status"><Icons.check />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><Icons.close /></button></div>}
  </div>
}
