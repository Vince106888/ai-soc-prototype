import { useEffect, useState } from 'react'
import { api } from './api'
import type { Account, Credentials, EvidenceDetail, EvidenceItem, Page, Source } from './types'
import { accountLabel, formatDateTime, humanize } from './utils'
import { Icons } from './icons'
import { PageHeader } from './ui'

export function EvidenceValues({ features }: { features: Record<string, unknown> }) {
  const entries = Object.entries(features).filter(([, value]) => {
    if (value === '' || value === null || value === undefined) return false
    if (Array.isArray(value)) return value.length > 0
    return typeof value !== 'object' || Object.keys(value).length > 0
  })
  const format = (key: string, value: unknown): string => {
    if (Array.isArray(value)) return value.join(', ')
    if (typeof value === 'boolean') {
      if (['lookalike_domain', 'brand_mismatch'].includes(key)) return value ? 'Flagged' : 'Not flagged in stored inputs'
      return value ? 'Yes' : 'No'
    }
    if (typeof value === 'object' && value !== null) return Object.entries(value).map(([name, result]) => `${name.toUpperCase()}: ${String(result)}`).join(' · ')
    return String(value)
  }
  return <dl className="evidence-values">{entries.map(([key, value]) => <div key={key}><dt>{humanize(key)}</dt><dd>{format(key, value)}</dd></div>)}</dl>
}

export function Pagination({ total, offset, limit, busy, onChange }: { total: number; offset: number; limit: number; busy: boolean; onChange: (offset: number) => void }) {
  return <nav className="pagination" aria-label="Results pagination"><span>{total ? `${offset + 1}–${Math.min(offset + limit, total)} of ${total}` : '0 results'}</span><button className="button button-secondary button-small" disabled={busy || offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</button><button className="button button-secondary button-small" disabled={busy || offset + limit >= total} onClick={() => onChange(offset + limit)}>Next</button></nav>
}

export function EvidenceWorkspace({ credentials, accounts, sources, onInspect }: { credentials: Credentials; accounts: Account[]; sources: Source[]; onInspect: (id: string) => void }) {
  const [filters, setFilters] = useState({ accountId: '', signalType: '', hasFindings: '', search: '', offset: 0 })
  const [page, setPage] = useState<Page<EvidenceItem> | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState<EvidenceDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true); setError('')
      api.evidence(credentials, filters, controller.signal).then(result => {
        if (controller.signal.aborted) return
        setPage(result)
        setSelectedId(current => result.items.some(item => item.id === current) ? current : result.items[0]?.id ?? '')
      }).catch(reason => {
        if (!controller.signal.aborted) { setPage(null); setSelectedId(''); setError(reason instanceof Error ? reason.message : 'Could not load evidence.') }
      }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 200)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [credentials, filters, revision])
  useEffect(() => {
    const controller = new AbortController()
    if (!selectedId) { setDetail(null); setDetailLoading(false); setDetailError(''); return }
    setDetailLoading(true); setDetailError(''); setDetail(null)
    api.evidenceDetail(credentials, selectedId, controller.signal).then(result => {
      if (!controller.signal.aborted) setDetail(result)
    }).catch(reason => { if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : 'Could not load signal details.') }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false) })
    return () => controller.abort()
  }, [credentials, selectedId, revision])
  const update = (key: 'accountId' | 'signalType' | 'hasFindings' | 'search', value: string) => setFilters(current => ({ ...current, [key]: value, offset: 0 }))
  return <div className="page evidence-page"><PageHeader eyebrow="Investigation" title="Evidence workspace" description="Browse every retained signal, including messages with no configured indicators." actions={<button className="button button-secondary" disabled={loading} onClick={() => setRevision(current => current + 1)}><Icons.refresh />Refresh</button>} />
    <section className="panel evidence-toolbar"><label>Search sender or subject<input type="search" maxLength={200} value={filters.search} onChange={event => update('search', event.target.value)} placeholder="Find a collected message" /></label><label>Account<select value={filters.accountId} onChange={event => update('accountId', event.target.value)}><option value="">All accounts</option>{accounts.map(account => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</select></label><label>Signal type<select value={filters.signalType} onChange={event => update('signalType', event.target.value)}><option value="">All signal types</option>{['email', 'forwarding', 'signin', 'mfa', 'oauth_grant'].map(type => <option key={type} value={type}>{humanize(type)}</option>)}</select></label><label>Detection result<select value={filters.hasFindings} onChange={event => update('hasFindings', event.target.value)}><option value="">All results</option><option value="true">Indicators found</option><option value="false">No indicators matched</option></select></label></section>
    <div className="evidence-workspace"><section className="panel evidence-list-panel" aria-label="Retained signals" aria-busy={loading}>
      {loading ? <p className="muted-copy evidence-state">Loading retained evidence…</p> : error ? <p role="alert" className="form-error">{error}</p> : page?.items.length ? <div className="evidence-list">{page.items.map(item => <button className={`evidence-row ${selectedId === item.id ? 'is-selected' : ''}`} aria-current={selectedId === item.id ? 'true' : undefined} key={item.id} onClick={() => setSelectedId(item.id)}><span className={`evidence-marker ${item.finding_count ? 'has-findings' : ''}`} /><span><strong>{item.subject || humanize(item.signal_type) + ' signal'}</strong><small>{item.sender || accountLabel(accounts.find(account => account.id === item.account_id) ?? {id:item.account_id})}</small><span>{item.finding_count ? `${item.finding_count} ${item.finding_count === 1 ? 'indicator' : 'indicators'}` : 'No indicators matched'} · {formatDateTime(item.received_at)}</span></span><Icons.arrow /></button>)}</div> : <div className="state-card"><h3>No retained signals match</h3><p>Broaden the filters or analyse a message to collect evidence.</p></div>}
      {page && <Pagination total={page.total} offset={page.offset} limit={page.limit} busy={loading} onChange={offset => setFilters(current => ({ ...current, offset }))} />}
    </section><section className="panel evidence-inspector" aria-label="Signal details" aria-busy={detailLoading}>
      {detailLoading ? <p className="muted-copy">Loading signal details…</p> : detailError ? <p role="alert" className="form-error">{detailError}</p> : detail ? <><header><p className="eyebrow">{humanize(detail.signal_type)} · retained evidence</p><h2>{String(detail.features.subject || humanize(detail.signal_type) + ' signal')}</h2><p>{accountLabel(accounts.find(account => account.id === detail.account_id) ?? {id:detail.account_id ?? ''})} · {sources.find(source => source.id === detail.source_id)?.name || 'Registered source'}</p></header><div className={`evidence-outcome ${detail.findings.length ? 'has-findings' : ''}`}><strong>{detail.findings.length ? `${detail.findings.length} configured ${detail.findings.length === 1 ? 'indicator' : 'indicators'} matched` : 'No configured indicators matched'}</strong><p>{detail.findings.length ? 'Inspect the rule evidence and the linked incident before making a decision.' : 'This result does not certify safety. It covers only the collected fields and configured rules at ingestion.'}</p></div><dl className="evidence-timestamps"><div><dt>Occurred</dt><dd>{formatDateTime(detail.occurred_at)}</dd></div><div><dt>Received locally</dt><dd>{formatDateTime(detail.received_at)}</dd></div></dl>{detail.findings.length > 0 && <><h3>Matched rules</h3><div className="evidence-rule-list">{detail.findings.map(finding => <article key={finding.id || finding.rule_code}><code>{finding.rule_code}</code><strong>{finding.title}</strong><p>Weight {finding.weight?.toFixed(2)} · configured confidence {finding.confidence?.toFixed(2)}</p><EvidenceValues features={typeof finding.evidence === 'object' ? finding.evidence : {evidence:finding.evidence}} /></article>)}</div></>}{detail.incidents.map(incident => <button className="button button-primary" key={incident.id} onClick={() => onInspect(incident.id)}>Review linked incident</button>)}<details className="observation-details" open><summary>Normalised observations</summary><EvidenceValues features={detail.features} /></details><p className="privacy-caption">Full message bodies and attachments are excluded. This view shows stored observations; it does not re-score old evidence.</p></> : <div className="state-card"><h3>Select a signal</h3><p>Inspect the source observations and detection result.</p></div>}
    </section></div>
  </div>
}
