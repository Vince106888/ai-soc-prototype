import { useEffect, useState } from 'react'
import { api } from './api'
import type { Account, Credentials, Source } from './types'
import { accountLabel, formatDateTime, humanize } from './utils'
import { Icons } from './icons'
import { useRequest } from './ui/hooks'
import { EmptyState, ErrorState, LoadingRows, PageHeader } from './ui/primitives'

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
  if (total <= limit && offset === 0) return <p className="pagination-summary">{total ? `${total} of ${total}` : '0 results'}</p>
  return <nav className="pagination" aria-label="Results pagination"><span>{total ? `${offset + 1}–${Math.min(offset + limit, total)} of ${total}` : '0 results'}</span><div><button className="button button-secondary button-small" disabled={busy || offset === 0} onClick={() => onChange(Math.max(0, offset - limit))} type="button">Previous</button><button className="button button-secondary button-small" disabled={busy || offset + limit >= total} onClick={() => onChange(offset + limit)} type="button">Next</button></div></nav>
}

const signalTypes = ['email', 'forwarding', 'signin', 'mfa', 'oauth_grant']

export function EvidenceWorkspace({ credentials, accounts, sources, onInspect }: { credentials: Credentials; accounts: Account[]; sources: Source[]; onInspect: (id: string) => void }) {
  const [filters, setFilters] = useState({ accountId: '', signalType: '', hasFindings: '', search: '', offset: 0 })
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState('')
  const [revision, setRevision] = useState(0)
  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    if (search === filters.search) return
    const timer = window.setTimeout(() => setFilters(current => ({ ...current, search, offset: 0 })), 250)
    return () => window.clearTimeout(timer)
  }, [search, filters.search])
  const list = useRequest(JSON.stringify([credentials, filters, revision]), signal => api.evidence(credentials, filters, signal), 'Could not load evidence.')
  const page = list.data ?? (list.loading ? list.previous : undefined)
  const selectedId = page?.items.some(item => item.id === chosen) ? chosen : page?.items[0]?.id ?? ''
  const detailRequest = useRequest(selectedId ? JSON.stringify([credentials, selectedId, revision]) : null, signal => api.evidenceDetail(credentials, selectedId, signal), 'Could not load signal details.')
  const detail = detailRequest.data
  const update = (key: 'accountId' | 'signalType' | 'hasFindings', value: string) => setFilters(current => ({ ...current, [key]: value, offset: 0 }))
  const accountName = (id?: string) => accountLabel(accounts.find(account => account.id === id) ?? { id: id ?? '' })

  return <div className="page page-wide evidence-page">
    <PageHeader title="Evidence" lead="Every retained signal, including messages where no configured indicator matched." actions={<button className="button button-secondary" disabled={list.loading} onClick={() => setRevision(current => current + 1)} type="button"><Icons.refresh />Refresh</button>} />
    <section className="filter-bar" aria-label="Evidence filters">
      <div className="field field-grow"><label htmlFor="evidence-search">Search sender or subject</label><input id="evidence-search" type="search" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a collected message" /></div>
      <div className="field"><label htmlFor="evidence-account">Account</label><select id="evidence-account" value={filters.accountId} onChange={event => update('accountId', event.target.value)}><option value="">All accounts</option>{accounts.map(account => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</select></div>
      <div className="field"><label htmlFor="evidence-type">Signal type</label><select id="evidence-type" value={filters.signalType} onChange={event => update('signalType', event.target.value)}><option value="">All signal types</option>{signalTypes.map(type => <option key={type} value={type}>{humanize(type)}</option>)}</select></div>
      <div className="field"><label htmlFor="evidence-result">Detection result</label><select id="evidence-result" value={filters.hasFindings} onChange={event => update('hasFindings', event.target.value)}><option value="">All results</option><option value="true">Indicators found</option><option value="false">No indicators matched</option></select></div>
    </section>
    <div className="split">
      <section className="panel queue" aria-label="Retained signals" aria-busy={list.loading}>
        {list.error ? <ErrorState message={list.error} retry={() => setRevision(current => current + 1)} />
          : !page ? <LoadingRows count={5} label="Loading retained evidence" />
            : page.items.length ? <ul className="queue-list">{page.items.map(item => <li key={item.id}><button className={`queue-row ${item.finding_count ? 'edge-flagged' : 'edge-clear'}`} aria-current={selectedId === item.id ? 'true' : undefined} onClick={() => setChosen(item.id)} type="button">
              <span className="queue-main">
                <strong className="queue-title">{item.subject || `${humanize(item.signal_type)} signal`}</strong>
                <span className="queue-summary">{item.sender || accountName(item.account_id)}</span>
                <span className="queue-meta"><span className={item.finding_count ? 'flag-text' : ''}>{item.finding_count ? `${item.finding_count} ${item.finding_count === 1 ? 'indicator' : 'indicators'}` : 'No indicators matched'}</span> · {formatDateTime(item.received_at)}</span>
              </span>
            </button></li>)}</ul>
              : <EmptyState icon={<Icons.search />} title="No retained signals match">Broaden the filters or analyse a message to collect evidence.</EmptyState>}
        {page && !list.error && <Pagination total={page.total} offset={page.offset} limit={page.limit} busy={list.loading} onChange={offset => setFilters(current => ({ ...current, offset }))} />}
      </section>
      <section className="panel detail inspector" aria-label="Signal details" aria-busy={detailRequest.loading}>
        {detailRequest.error ? <ErrorState message={detailRequest.error} retry={() => setRevision(current => current + 1)} />
          : detail ? <>
            <header className="inspector-header"><p className="panel-meta">{humanize(detail.signal_type)} · retained evidence</p><h2>{String(detail.features.subject || `${humanize(detail.signal_type)} signal`)}</h2><p className="muted">{accountName(detail.account_id)} · {sources.find(source => source.id === detail.source_id)?.name || 'Registered source'}</p></header>
            <div className={`outcome ${detail.findings.length ? 'is-flagged' : ''}`}><strong>{detail.findings.length ? `${detail.findings.length} configured ${detail.findings.length === 1 ? 'indicator' : 'indicators'} matched` : 'No configured indicators matched'}</strong><p>{detail.findings.length ? 'Inspect the rule evidence and the linked incident before making a decision.' : 'This result does not certify safety. It covers only the collected fields and configured rules at ingestion.'}</p></div>
            <dl className="fact-row"><div><dt>Occurred</dt><dd>{formatDateTime(detail.occurred_at)}</dd></div><div><dt>Received locally</dt><dd>{formatDateTime(detail.received_at)}</dd></div></dl>
            {detail.findings.length > 0 && <><h3>Matched rules</h3><div className="finding-list">{detail.findings.map(finding => <section className="finding" key={finding.id || finding.rule_code}><header><code>{finding.rule_code}</code><strong>{finding.title}</strong><span className="finding-weights">Weight {finding.weight?.toFixed(2)} · configured confidence {finding.confidence?.toFixed(2)}</span></header><EvidenceValues features={typeof finding.evidence === 'object' ? finding.evidence : { evidence: finding.evidence }} /></section>)}</div></>}
            {detail.incidents.length > 0 && <div className="stack-actions">{detail.incidents.map(incident => <button className="button button-primary" key={incident.id} onClick={() => onInspect(incident.id)} type="button">Review linked incident</button>)}</div>}
            <details className="disclosure" open><summary>Normalised observations</summary><EvidenceValues features={detail.features} /></details>
            <p className="field-help"><Icons.lock />Full message bodies and attachments are excluded. This view shows stored observations and does not re-score old evidence.</p>
          </> : selectedId ? <LoadingRows count={5} label="Loading signal details" />
            : <EmptyState icon={<Icons.search />} title="Select a signal">Inspect the source observations and the detection result.</EmptyState>}
      </section>
    </div>
  </div>
}
