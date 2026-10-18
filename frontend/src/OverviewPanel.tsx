import type { Account, CapabilityProfile, Incident, Overview, ScanJob, Source } from './types'
import { accountLabel, formatDateTime, humanize, incidentTitle, relativeTime, scorePercent } from './utils'
import { Icons } from './icons'
import { EmptyState, Notice, PageHeader, Panel, PanelHeading, SeverityBadge, StatusBadge, severities } from './ui/primitives'

type Destination = 'incidents' | 'sources' | 'analysis' | 'evidence' | 'protection'

function ActivityChart({ activity }: { activity: Overview['activity'] }) {
  const maximum = Math.max(1, ...activity.map(day => Math.max(day.signals, day.incidents)))
  const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' })
  const total = activity.reduce((sum, day) => ({ signals: sum.signals + day.signals, incidents: sum.incidents + day.incidents }), { signals: 0, incidents: 0 })
  return <>
    <div className="chart-head"><p className="chart-total"><strong>{total.signals}</strong> signals and <strong>{total.incidents}</strong> incidents retained this week</p><ul className="legend" aria-label="Legend"><li><i className="swatch swatch-signals" />Signals</li><li><i className="swatch swatch-incidents" />Incidents</li></ul></div>
    <div className="bar-chart" role="group" aria-label="Seven-day retained activity. Exact daily counts are in the table below.">
      <div className="bar-grid" aria-hidden="true"><span /><span /><span /></div>
      {activity.map(day => <div className="bar-day" key={day.day} tabIndex={0} role="img" aria-label={`${day.day}: ${day.signals} signals, ${day.incidents} incidents`}>
        <div className="bar-pair">
          <span className="bar bar-signals" style={{ height: `${(day.signals / maximum) * 100}%` }} />
          <span className="bar bar-incidents" style={{ height: `${(day.incidents / maximum) * 100}%` }} />
        </div>
        <span className="bar-label">{weekday(day.day)}</span>
        <span className="bar-tip" aria-hidden="true"><strong>{weekday(day.day)} {day.day.slice(5)}</strong><span><i className="swatch swatch-signals" />{day.signals} signals</span><span><i className="swatch swatch-incidents" />{day.incidents} incidents</span></span>
      </div>)}
    </div>
    <details className="chart-data"><summary>Show daily counts as a table</summary><div className="table-wrap"><table className="data-table"><thead><tr><th scope="col">Date (UTC)</th><th scope="col" className="num">Signals</th><th scope="col" className="num">Incidents</th></tr></thead><tbody>{activity.map(day => <tr key={day.day}><td>{day.day}</td><td className="num">{day.signals}</td><td className="num">{day.incidents}</td></tr>)}</tbody></table></div></details>
  </>
}

export function OverviewPanel({ overview, incidents, accounts, sources, profile, jobs, loading, error, onRefresh, onInspect, onNavigate }: {
  overview: Overview | null; incidents: Incident[]; accounts: Account[]; sources: Source[]; profile: CapabilityProfile | null; jobs: ScanJob[]
  loading: boolean; error: string; onRefresh: () => void; onInspect: (id: string) => void
  onNavigate: (section: Destination) => void
}) {
  const active = incidents.filter(incident => ['new', 'under_review'].includes(incident.status))
  const gmail = sources.filter(source => source.source_type === 'gmail' && source.status === 'active')
  const bySeverity = severities.map(severity => ({ severity, count: active.filter(incident => incident.severity === severity).length }))
  const counted = bySeverity.reduce((sum, item) => sum + item.count, 0)
  const ledger = [
    { label: 'Open incidents', value: overview?.incidents.active, caption: 'Awaiting a decision', tone: 'open' },
    { label: 'Critical', value: overview?.incidents.critical, caption: 'Review these first', tone: 'critical' },
    { label: 'Under review', value: overview?.incidents.under_review, caption: 'Being investigated', tone: 'review' },
    { label: 'Retained signals', value: overview?.retained_signals, caption: 'Evidence on file', tone: 'neutral' },
  ]
  const show = (value?: number) => loading && value === undefined ? '…' : value ?? '—'
  const accountName = (incident: Incident) => accountLabel(accounts.find(account => account.id === incident.account_id) ?? { id: incident.account_id ?? '' })

  return <div className="page overview-page">
    <PageHeader title="Overview" lead="What needs a decision now, and how much evidence the workspace holds." actions={<button className="button button-secondary" disabled={loading} onClick={onRefresh} type="button"><Icons.refresh />Refresh</button>} />

    <Notice tone={gmail.length ? 'success' : 'info'} title={gmail.length ? 'Gmail sampling is connected' : 'This workspace uses controlled data'} action={<button className="button button-secondary" onClick={() => onNavigate('analysis')} type="button">{gmail.length ? 'Run a sample' : 'Set up Gmail'}</button>}>
      {gmail.length ? 'Request an inbox sample to collect new evidence. Continuous monitoring is not enabled.' : profile?.gmail?.configured ? 'Google setup is ready. Connect a mailbox to run a read-only inbox sample.' : 'Analyse selected messages now. Gmail sampling needs local Google setup first.'}
    </Notice>

    <dl className="ledger" aria-label="Workspace totals">{ledger.map(item => <div className={`ledger-item ledger-${item.tone}`} key={item.label}><dt>{item.label}</dt><dd><span className="ledger-value">{show(item.value)}</span><span className="ledger-caption">{item.caption}</span></dd></div>)}</dl>

    <div className="overview-grid">
      <Panel labelledBy="attention-heading" className="attention">
        <PanelHeading id="attention-heading" title="Needs your attention" meta="Open incidents, highest priority first" action={<button className="button button-ghost" onClick={() => onNavigate('incidents')} type="button">All incidents<Icons.arrow /></button>} />
        {counted > 0 && <div className="severity-mix">
          <div className="mix-bar" aria-hidden="true">{bySeverity.filter(item => item.count).map(item => <span key={item.severity} className={`mix-${item.severity}`} style={{ flexGrow: item.count }} />)}</div>
          <ul className="mix-legend" aria-label="Open incidents by severity">{bySeverity.map(item => <li key={item.severity} className={item.count ? '' : 'is-zero'}><i className={`mix-key mix-${item.severity}`} aria-hidden="true" />{humanize(item.severity)} <strong>{item.count}</strong></li>)}</ul>
        </div>}
        {error ? <p className="form-error" role="alert">{error}</p>
          : loading && !active.length ? <p className="muted">Loading incident evidence…</p>
            : active.length ? <ul className="attention-list">{active.slice(0, 6).map(incident => <li key={incident.id}><button className={`attention-row edge-${incident.severity}`} onClick={() => onInspect(incident.id)} type="button">
              <span className="attention-identity"><strong>{incidentTitle(incident)}</strong><small>{accountName(incident)} · {relativeTime(incident.last_seen_at)}</small></span>
              <span className="attention-priority"><span className="attention-score">{scorePercent(incident.score) ?? '—'}</span><SeverityBadge severity={incident.severity} /></span>
              <StatusBadge status={incident.status} />
              <Icons.arrow className="row-arrow" />
            </button></li>)}</ul>
              : <EmptyState icon={<Icons.scan />} title={overview?.retained_signals ? 'No open incidents in this view' : 'Collect your first evidence'} action={<button className="button button-primary" onClick={() => onNavigate('analysis')} type="button">Analyse email</button>}>{overview?.retained_signals ? 'Review the retained sample and the detector limits. An empty queue does not establish safety.' : 'Analyse a selected email or connect Gmail for a recent inbox sample.'}</EmptyState>}
        <p className="panel-footnote"><Icons.lock />Scores set review order. Every decision you record stays in the audit trail.</p>
      </Panel>

      <div className="overview-side">
        <Panel labelledBy="collection-heading">
          <PanelHeading id="collection-heading" title="Collection" />
          <dl className="facts"><div><dt>Registered accounts</dt><dd>{overview?.accounts ?? '—'}</dd></div><div><dt>Active sources</dt><dd>{overview?.active_sources ?? '—'}</dd></div><div><dt>Gmail connections</dt><dd>{gmail.length}</dd></div><div><dt>Latest analysis</dt><dd>{overview?.latest_job ? humanize(overview.latest_job.status) : 'None yet'}</dd></div></dl>
          <div className="stack-actions"><button className="button button-secondary" onClick={() => onNavigate('sources')} type="button">Manage accounts & sources</button><button className="button button-ghost" onClick={() => onNavigate('protection')} type="button">What is covered<Icons.arrow /></button></div>
        </Panel>
        <Panel labelledBy="recent-heading">
          <PanelHeading id="recent-heading" title="Recent analyses" action={<button className="button button-ghost" onClick={() => onNavigate('evidence')} type="button">Evidence<Icons.arrow /></button>} />
          {jobs.length ? <ul className="job-list">{jobs.slice(0, 3).map(job => <li key={job.id}><div><strong>{sources.find(source => source.id === job.source_id)?.name ?? 'Registered source'}</strong><small>{formatDateTime(job.created_at)}</small><span>{job.imported_count} imported · {job.finding_count} findings · {job.duplicate_count} duplicates</span></div><StatusBadge status={job.status} /></li>)}</ul> : <p className="muted">No analysis has been recorded.</p>}
        </Panel>
      </div>
    </div>

    <Panel labelledBy="activity-heading" className="activity">
      <PanelHeading id="activity-heading" title="Retained activity" meta="Last 7 days, UTC" />
      {overview ? overview.activity.length ? <ActivityChart activity={overview.activity} /> : <p className="muted">No activity has been retained in the last seven days.</p> : <p className="muted">Activity appears once workspace totals load.</p>}
    </Panel>
    {accounts.some(account => account.delete_after) && <p className="field-help"><Icons.clock />{accounts.filter(account => account.delete_after).map(account => `${accountLabel(account)}: local trial ends ${formatDateTime(account.delete_after ?? undefined)}`).join(' · ')}</p>}
  </div>
}
