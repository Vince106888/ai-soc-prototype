import { useEffect, useRef } from 'react'
import { IncidentDetail } from '../IncidentDetail'
import { Pagination } from '../EvidenceWorkspace'
import { Icons } from '../icons'
import type { Account, Incident, IncidentFilters, IncidentStatus, TrustChoice } from '../types'
import { EmptyState, ErrorState, LoadingRows, PageHeader, SeverityBadge, StatusBadge, severities } from '../ui/primitives'
import { accountLabel, humanize, incidentTitle, relativeTime, scorePercent } from '../utils'

const statuses: IncidentStatus[] = ['new', 'under_review', 'resolved', 'false_positive']

function IncidentRow({ incident, account, selected, onSelect }: { incident: Incident; account: string; selected: boolean; onSelect: () => void }) {
  const time = incident.detected_at ?? incident.last_seen_at ?? incident.created_at ?? incident.updated_at
  const explanation = typeof incident.explanation === 'string' ? incident.explanation : incident.explanation?.what_happened
  const score = scorePercent(incident.score)
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (selected) ref.current?.scrollIntoView?.({ block: 'nearest' }) }, [selected])
  return <li>
    <button ref={ref} aria-current={selected ? 'true' : undefined} className={`queue-row edge-${incident.severity}`} onClick={onSelect} type="button">
      <span className="queue-main">
        <span className="queue-badges"><SeverityBadge severity={incident.severity} /><StatusBadge status={incident.status} /></span>
        <strong className="queue-title">{incidentTitle(incident)}</strong>
        <span className="queue-summary">{incident.summary || explanation || 'Security activity requires review.'}</span>
        <span className="queue-meta">{account} · {relativeTime(time)}</span>
      </span>
      {score !== undefined && <span className="queue-score"><strong>{score}</strong><small>priority<span className="sr-only"> score out of 100</span></small></span>}
    </button>
  </li>
}

export function IncidentsPage({ filters, incidents, total, accounts, loading, error, selected, detail, detailLoading, detailError, compact, statusBusy, explainBusy, aiAvailable, onFilters, onOffset, onSelect, onBack, onRetry, onRetryDetail, onStatus, onExplain, onAnalyse }: {
  filters: IncidentFilters
  incidents: Incident[]
  total: number
  accounts: Account[]
  loading: boolean
  error: string
  selected: string
  detail: Incident | null
  detailLoading: boolean
  detailError: string
  compact: boolean
  statusBusy: boolean
  explainBusy: boolean
  aiAvailable: boolean
  onFilters: (patch: Partial<IncidentFilters>) => void
  onOffset: (offset: number) => void
  onSelect: (id: string) => void
  onBack: () => void
  onRetry: () => void
  onRetryDetail: () => void
  onStatus: (status: IncidentStatus, note: string, trust?: TrustChoice) => Promise<boolean>
  onExplain: () => Promise<void>
  onAnalyse: () => void
}) {
  const filtered = Boolean(filters.q || filters.severity || filters.status || filters.accountId || filters.seenFrom || filters.seenTo)
  const moreFilters = Boolean(filters.accountId || filters.seenFrom || filters.seenTo)
  const showDetailOnly = compact && Boolean(selected)
  const label = (incident: Incident) => incident.account_name || accountLabel(accounts.find(account => account.id === incident.account_id) ?? { id: incident.account_id ?? '' })

  const detailView = detailLoading && !detail ? <LoadingRows count={6} label="Loading incident" />
    : detailError ? <ErrorState message={detailError} retry={onRetryDetail} />
      : detail ? <IncidentDetail key={`${detail.id}:${detail.status}`} incident={detail} loading={detailLoading} onStatus={onStatus} statusBusy={statusBusy} aiAvailable={aiAvailable} onExplain={onExplain} explainBusy={explainBusy} onBack={compact ? onBack : undefined} />
        : <EmptyState icon={<Icons.list />} title="Select an incident">Choose a case from the queue to review its evidence and record a decision. Use <kbd className="kbd">j</kbd> and <kbd className="kbd">k</kbd> to move through the queue.</EmptyState>

  return <div className={`page page-wide incidents-page ${showDetailOnly ? 'is-detail' : ''}`}>
    {!showDetailOnly && <>
      <PageHeader title="Incidents" lead="Cases ordered by severity, then priority score, then recency. Scores rank review order; they are not attack probabilities." actions={<button className="button button-secondary" onClick={onAnalyse} type="button"><Icons.mail />Analyse email</button>} />
      <section className="filter-bar" aria-label="Incident filters">
        <div className="segmented" role="group" aria-label="Severity">
          <button aria-pressed={!filters.severity} onClick={() => onFilters({ severity: '' })} type="button">All</button>
          {severities.map(severity => <button aria-pressed={filters.severity === severity} className={`seg-${severity}`} key={severity} onClick={() => onFilters({ severity })} type="button"><i aria-hidden="true" />{humanize(severity)}</button>)}
        </div>
        <div className="field field-inline"><label htmlFor="incident-status">Status</label><select id="incident-status" onChange={event => onFilters({ status: event.target.value })} value={filters.status}><option value="">All statuses</option>{statuses.map(status => <option key={status} value={status}>{humanize(status)}</option>)}</select></div>
        <details className="more-filters">
          <summary><Icons.filter />More filters{moreFilters && <><span className="dot" aria-hidden="true" /><span className="sr-only">(active)</span></>}</summary>
          <div className="more-filters-body">
            <div className="field"><label htmlFor="incident-account">Account</label><select id="incident-account" value={filters.accountId ?? ''} onChange={event => onFilters({ accountId: event.target.value })}><option value="">All accounts</option>{accounts.map(account => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</select></div>
            <div className="field"><label htmlFor="incident-from">Latest evidence from (local time)</label><input id="incident-from" type="datetime-local" value={filters.seenFrom ?? ''} onChange={event => onFilters({ seenFrom: event.target.value })} /></div>
            <div className="field"><label htmlFor="incident-to">Latest evidence until (local time)</label><input id="incident-to" type="datetime-local" min={filters.seenFrom} value={filters.seenTo ?? ''} onChange={event => onFilters({ seenTo: event.target.value })} /></div>
            {filtered && <button className="button button-ghost" onClick={() => onFilters({ severity: '', status: '', q: '', accountId: '', seenFrom: '', seenTo: '' })} type="button">Clear all filters</button>}
          </div>
        </details>
        <span className="result-count" aria-live="polite">{loading ? 'Loading…' : `${total} ${total === 1 ? 'incident' : 'incidents'}`}{filters.q ? ` matching “${filters.q}”` : ''}</span>
      </section>
    </>}
    <div className="split">
      {!showDetailOnly && <section className="panel queue" aria-label="Incident queue" aria-busy={loading}>
        {loading && !incidents.length ? <LoadingRows count={6} label="Loading incidents" />
          : error ? <ErrorState message={error} retry={onRetry} />
            : incidents.length ? <ul className="queue-list">{incidents.map(incident => <IncidentRow key={incident.id} incident={incident} account={label(incident)} selected={incident.id === selected} onSelect={() => onSelect(incident.id)} />)}</ul>
              : filtered ? <EmptyState icon={<Icons.filter />} title="No matching incidents" action={<button className="button button-secondary" onClick={() => onFilters({ severity: '', status: '', q: '', accountId: '', seenFrom: '', seenTo: '' })} type="button">Clear filters</button>}>Broaden the filters or change the search term.</EmptyState>
                : <EmptyState title="The queue is empty" action={<button className="button button-primary" onClick={onAnalyse} type="button">Analyse an email</button>}>No incident has been created yet. An empty queue alone does not establish safety; analyse an email or run a Gmail sample to collect evidence.</EmptyState>}
        <Pagination total={total} offset={filters.offset ?? 0} limit={25} busy={loading} onChange={onOffset} />
      </section>}
      {(!compact || showDetailOnly) && <section className="panel detail" aria-label="Incident detail">{detailView}</section>}
    </div>
  </div>
}
