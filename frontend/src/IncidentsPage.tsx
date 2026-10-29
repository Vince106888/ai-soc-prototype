import { useState } from 'react'
import { EmptyWorkspaceArt } from './illustrations'
import { IncidentDetail } from './IncidentDetail'
import { Icons } from './icons'
import { Pagination } from './EvidenceWorkspace'
import {
  EmptyState,
  ErrorState,
  FilterChip,
  LoadingRows,
  PageHeader,
  Panel,
  SeverityBadge,
  StatusBadge,
} from './ui'
import type { Account, Incident, IncidentFilters, IncidentStatus, Severity, TrustChoice } from './types'
import { accountLabel, humanize, incidentTitle, relativeTime, scorePercent } from './utils'

const statuses: IncidentStatus[] = ['new', 'under_review', 'resolved', 'false_positive']
const severities: Severity[] = ['critical', 'high', 'medium', 'low']

function IncidentRow({ incident, account, onSelect, selected = false }: { incident: Incident; account: Account | undefined; onSelect: () => void; selected?: boolean }) {
  const time = incident.detected_at ?? incident.last_seen_at ?? incident.created_at ?? incident.updated_at
  const explanation = typeof incident.explanation === 'string' ? incident.explanation : incident.explanation?.what_happened
  const displayedScore = scorePercent(incident.score)
  return (
    <button
      aria-current={selected ? 'true' : undefined}
      className={`incident-row ${selected ? 'is-selected' : ''}`}
      onClick={onSelect}
      type="button"
    >
      <span className={`severity-line severity-bg-${incident.severity}`} aria-hidden="true" />
      <span className="incident-main">
        <span className="incident-topline"><SeverityBadge severity={incident.severity} /><StatusBadge status={incident.status} /></span>
        <strong>{incidentTitle(incident)}</strong>
        <span className="incident-summary">{incident.summary || explanation || 'Security activity requires review.'}</span>
        <span className="incident-meta"><span>{account ? accountLabel(account) : incident.source || incident.account_name || 'Workspace account'}</span><span>·</span><span>{relativeTime(time)}</span></span>
      </span>
      {displayedScore !== undefined && <span className="risk-score"><strong>{displayedScore}</strong><small>priority</small></span>}
      <Icons.arrow className="row-arrow" aria-hidden="true" />
    </button>
  )
}

export function IncidentsPage({
  incidents,
  total,
  accounts,
  filters,
  selectedId,
  selected,
  loading,
  detailLoading,
  error,
  detailError,
  compactNavigation,
  statusBusy,
  aiAvailable,
  explainBusy,
  onChangeFilters,
  onSelect,
  onPage,
  onAnalyse,
  onRetry,
  onStatus,
  onExplain,
}: {
  incidents: Incident[]
  total: number
  accounts: Account[]
  filters: IncidentFilters
  selectedId: string
  selected: Incident | null
  loading: boolean
  detailLoading: boolean
  error: string
  detailError: string
  compactNavigation: boolean
  statusBusy: boolean
  aiAvailable: boolean
  explainBusy: boolean
  onChangeFilters: (patch: Partial<IncidentFilters>) => void
  onSelect: (id: string) => void
  onPage: (offset: number) => void
  onAnalyse: () => void
  onRetry: () => void
  onStatus: (status: IncidentStatus, note: string, trust?: TrustChoice) => Promise<boolean>
  onExplain: () => Promise<void>
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterCount = [
    filters.severity,
    filters.status,
    filters.accountId,
    filters.q,
    filters.seenFrom,
    filters.seenTo,
    filters.openOnly,
  ].filter(Boolean).length
  const clearFilters = () => {
    onChangeFilters({ severity: '', status: '', q: '', accountId: '', seenFrom: '', seenTo: '', openOnly: false })
  }

  return (
    <div className="page page-incidents">
      <PageHeader
        eyebrow="Response workspace"
        title="Incidents"
        description="Review cases in priority order, inspect the deterministic evidence, and record a human decision."
        compact
        actions={<>
          {compactNavigation && (
            <button className="button button-secondary" aria-label="Toggle incident filters" aria-controls="incident-filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((current) => !current)}>
              <Icons.search />Filters{filterCount ? ` · ${filterCount}` : ''}
            </button>
          )}
          <button className="button button-primary" onClick={onAnalyse}><Icons.scan />Analyse selected message</button>
        </>}
      />

      <div id="incident-filters" hidden={compactNavigation && !filtersOpen}>
        <Panel className="filter-bar">
          <label><span>Severity</span>
            <select aria-label="Severity" onChange={(event) => onChangeFilters({ severity: event.target.value })} value={filters.severity}>
              <option value="">All severities</option>
              {severities.map((severity) => <option key={severity} value={severity}>{humanize(severity)}</option>)}
            </select>
          </label>
          <label><span>Status</span>
            <select aria-label="Status" onChange={(event) => onChangeFilters({ status: event.target.value })} value={filters.status}>
              <option value="">All statuses</option>
              {statuses.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
            </select>
          </label>
          <label><span>Account</span>
            <select aria-label="Account" value={filters.accountId ?? ''} onChange={(event) => onChangeFilters({ accountId: event.target.value })}>
              <option value="">All accounts</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
            </select>
          </label>
          <label><span>Latest evidence from</span>
            <input type="datetime-local" aria-label="Latest evidence from" value={filters.seenFrom ?? ''} onChange={(event) => onChangeFilters({ seenFrom: event.target.value })} />
          </label>
          <label><span>Latest evidence until</span>
            <input type="datetime-local" aria-label="Latest evidence until" min={filters.seenFrom} value={filters.seenTo ?? ''} onChange={(event) => onChangeFilters({ seenTo: event.target.value })} />
          </label>
          <span className="result-count" aria-live="polite">{total} {total === 1 ? 'incident' : 'incidents'}</span>
        </Panel>
      </div>

      {filterCount > 0 && (
        <div className="active-filters" aria-label="Active filters">
          <span>Active filters</span>
          {filters.severity && <FilterChip label={`Severity: ${humanize(filters.severity)}`} onRemove={() => onChangeFilters({ severity: '' })} />}
          {filters.status && <FilterChip label={`Status: ${humanize(filters.status)}`} onRemove={() => onChangeFilters({ status: '' })} />}
          {filters.accountId && <FilterChip label={`Account: ${accountLabel(accounts.find((account) => account.id === filters.accountId) ?? { id: filters.accountId })}`} onRemove={() => onChangeFilters({ accountId: '' })} />}
          {filters.q && <FilterChip label={`Search: ${filters.q}`} onRemove={() => onChangeFilters({ q: '' })} />}
          {filters.seenFrom && <FilterChip label={`From: ${filters.seenFrom}`} onRemove={() => onChangeFilters({ seenFrom: '' })} />}
          {filters.seenTo && <FilterChip label={`Until: ${filters.seenTo}`} onRemove={() => onChangeFilters({ seenTo: '' })} />}
          {filters.openOnly && <FilterChip label="Open cases only" onRemove={() => onChangeFilters({ openOnly: false })} />}
          <button className="link-button" onClick={clearFilters} type="button">Clear all</button>
        </div>
      )}

      <div className="incident-workspace">
        <Panel className="incident-rail" aria-label="Incident results">
          <div className="incident-rail-heading">
            <span>Priority order</span>
            <span>{total} results</span>
          </div>
          {loading ? <LoadingRows count={6} label="Loading incidents" /> : error ? (
            <ErrorState message={error} retry={onRetry} />
          ) : incidents.length ? (
            <div className="incident-list">
              {incidents.map((incident) => (
                <IncidentRow
                  key={incident.id}
                  incident={incident}
                  account={accounts.find((account) => account.id === incident.account_id)}
                  selected={incident.id === selectedId}
                  onSelect={() => onSelect(incident.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={filterCount ? 'No incidents match these filters' : 'No incidents in this view'}
              description={filterCount ? 'Remove one or more filters to widen the results. A filtered empty state does not establish safety.' : 'Analyse a selected message to create evidence. An empty queue does not establish that the workspace is safe.'}
              action={filterCount ? <button className="button button-secondary" onClick={clearFilters}>Clear filters</button> : <button className="button button-primary" onClick={onAnalyse}>Analyse selected message</button>}
              icon={<EmptyWorkspaceArt />}
              className="compact-state"
            />
          )}
          {!loading && !error && total > 0 && (
            <Pagination total={total} offset={filters.offset ?? 0} limit={25} busy={loading} onChange={onPage} />
          )}
        </Panel>

        <Panel className="detail-panel" aria-label="Selected incident">
          {detailLoading ? <LoadingRows count={6} label="Loading incident detail" /> : detailError ? (
            <ErrorState message={detailError} retry={onRetry} />
          ) : selected ? (
            <IncidentDetail
              key={`${selected.id}:${selected.status}`}
              incident={selected}
              loading={detailLoading}
              onStatus={onStatus}
              statusBusy={statusBusy}
              aiAvailable={aiAvailable}
              onExplain={onExplain}
              explainBusy={explainBusy}
            />
          ) : (
            <EmptyState
              title="Select an incident"
              description="Choose a record to review its evidence, explanation source and response guidance."
              icon={<Icons.alert />}
              className="detail-placeholder"
            />
          )}
        </Panel>
      </div>
    </div>
  )
}
