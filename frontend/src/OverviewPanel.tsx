import { Icons } from './icons'
import { EmptyWorkspaceArt } from './illustrations'
import { EmptyState, InlineNotice, MetricCard, PageHeader, Panel, SectionHeading } from './ui'
import type { Account, CapabilityProfile, Incident, Overview, ScanJob, Source } from './types'
import { accountLabel, formatDateTime, incidentTitle, relativeTime, scorePercent } from './utils'

export function OverviewPanel({
  overview,
  incidents,
  accounts,
  sources,
  profile,
  jobs,
  loading,
  error,
  onRefresh,
  onInspect,
  onNavigate,
  onConnectGmail,
  onMetric,
}: {
  overview: Overview | null
  incidents: Incident[]
  accounts: Account[]
  sources: Source[]
  profile: CapabilityProfile | null
  jobs: ScanJob[]
  loading: boolean
  error: string
  onRefresh: () => void
  onInspect: (id: string) => void
  onMetric?: (metric: 'open' | 'critical' | 'review' | 'signals') => void
  onConnectGmail?: () => void
  onNavigate: (section: 'incidents' | 'coverage' | 'analysis' | 'evidence' | 'protection') => void
}) {
  const active = incidents.filter((incident) => ['new', 'under_review'].includes(incident.status))
  const gmailConnected = sources.filter((source) => source.source_type === 'gmail' && source.status === 'active')
  const highestPriority = active[0]
  const maximum = Math.max(1, ...overview?.activity.map((day) => Math.max(day.signals, day.incidents)) ?? [1])
  const nextAction = highestPriority
    ? {
        label: 'Review the highest-priority incident',
        copy: `${incidentTitle(highestPriority)} needs a human decision. Open the evidence before acting.`,
        cta: 'Review incident',
        run: () => onInspect(highestPriority.id),
      }
    : !overview?.retained_signals
      ? {
          label: 'Start with one selected message',
          copy: 'Use a message you own or are authorised to inspect. The labelled synthetic example is available if you want a safe first run.',
          cta: 'Analyse selected message',
          run: () => onNavigate('analysis'),
        }
      : {
          label: 'Review the evidence you have',
          copy: 'No open incidents are shown. Check the retained evidence and detector coverage before drawing conclusions.',
          cta: 'Open evidence',
          run: () => onNavigate('evidence'),
        }

  const metrics = [
    { label: 'Open incidents', value: overview?.incidents.active, caption: 'Awaiting a decision', tone: 'amber' as const, action: 'open' as const, icon: <Icons.alert /> },
    { label: 'Critical priority', value: overview?.incidents.critical, caption: 'Review first', tone: 'red' as const, action: 'critical' as const, icon: <Icons.alert /> },
    { label: 'Under review', value: overview?.incidents.under_review, caption: 'Investigation in progress', tone: 'blue' as const, action: 'review' as const, icon: <Icons.activity /> },
    { label: 'Retained signals', value: overview?.retained_signals, caption: 'Minimised evidence', tone: 'neutral' as const, action: 'signals' as const, icon: <Icons.mail /> },
  ]

  return (
    <div className="page page-overview">
      <PageHeader
        eyebrow="Workspace overview"
        title="Security overview"
        description="See what needs attention, understand the evidence, and choose the next safe action."
        actions={<>
          <button className="button button-secondary" disabled={loading} onClick={onRefresh}><Icons.refresh />{loading ? 'Refreshing…' : 'Refresh'}</button>
          <button className="button button-primary" onClick={() => onNavigate('analysis')}><Icons.scan />Analyse selected message</button>
        </>}
      />

      <section className="overview-next-action" aria-labelledby="next-action-title">
        <div className="next-action-icon" aria-hidden="true"><Icons.arrow /></div>
        <div>
          <p className="eyebrow">Next best action</p>
          <h2 id="next-action-title">{nextAction.label}</h2>
          <p>{nextAction.copy}</p>
        </div>
        <button className="button button-primary" onClick={nextAction.run}>{nextAction.cta}<Icons.arrow /></button>
      </section>

      <div className="overview-scope">
        <div>
          <span className={`status-pill ${gmailConnected.length ? 'success' : 'info'}`}>
            {gmailConnected.length ? <Icons.check aria-hidden="true" /> : <Icons.info aria-hidden="true" />}
            {gmailConnected.length ? 'Gmail sample connected' : 'Selected-message analysis ready'}
          </span>
          <p>{gmailConnected.length ? 'Collection runs only when you request a sample. Continuous monitoring is not enabled.' : profile?.gmail?.configured ? 'Gmail is configured. Connect it when you want a bounded read-only sample.' : 'Gmail connection is unavailable for this deployment. Selected-message analysis remains available.'}</p>
        </div>
        <button className="link-button" onClick={() => gmailConnected.length ? onNavigate('analysis') : onConnectGmail?.()}>{gmailConnected.length ? 'Run another sample' : 'Review Gmail connection'}<Icons.arrow /></button>
      </div>

      <div className="stats-grid">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.action}
            label={metric.label}
            value={metric.value}
            caption={metric.caption}
            tone={metric.tone}
            icon={metric.icon}
            busy={loading}
            onClick={() => {
              if (onMetric) onMetric(metric.action)
              else onNavigate(metric.action === 'signals' ? 'evidence' : 'incidents')
            }}
          />
        ))}
      </div>

      <div className="overview-primary">
        <Panel className="queue-panel">
          <SectionHeading
            eyebrow="Incident triage"
            title="Needs your attention"
            meta={<span>{active.length} open</span>}
            action={<button className="link-button" onClick={() => onNavigate('incidents')}>All incidents<Icons.arrow /></button>}
          />
          {error ? <InlineNotice tone="danger" title="Could not load the review queue">{error}</InlineNotice> : loading ? (
            <div className="overview-loading" role="status" aria-label="Loading priority incidents">
              <span /><span /><span />
            </div>
          ) : active.length ? (
            <div className="triage-table">
              <div className="triage-columns" aria-hidden="true"><span>Incident / account</span><span>Priority</span><span>Status</span><span /></div>
              {active.slice(0, 5).map((incident) => (
                <button className="overview-incident" key={incident.id} onClick={() => onInspect(incident.id)} type="button">
                  <span className="triage-identity">
                    <strong>{incidentTitle(incident)}</strong>
                    <small>{accountLabel(accounts.find((account) => account.id === incident.account_id) ?? { id: incident.account_id ?? '' })} · {relativeTime(incident.last_seen_at)}</small>
                  </span>
                  <span className="triage-priority">
                    <span className={`severity-dot severity-bg-${incident.severity}`} aria-hidden="true" />
                    <strong>{scorePercent(incident.score)}</strong>
                    <small>{incident.severity} priority</small>
                  </span>
                  <span className={`badge status status-${incident.status}`}>{incident.status.replaceAll('_', ' ')}</span>
                  <Icons.arrow aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title={overview?.retained_signals ? 'No open incidents in this view' : 'Collect your first evidence'}
              description={overview?.retained_signals ? 'Review the retained evidence and coverage limits. An empty queue does not establish that the workspace is safe.' : 'Analyse a selected message or request a Gmail sample when a connection is available.'}
              action={<button className="button button-primary" onClick={() => onNavigate('analysis')}>Analyse selected message</button>}
              secondaryAction={overview?.retained_signals ? <button className="button button-secondary" onClick={() => onNavigate('evidence')}>Browse evidence</button> : undefined}
              icon={<EmptyWorkspaceArt />}
              className="overview-empty"
            />
          )}
          <footer className="panel-footer"><Icons.lock aria-hidden="true" /><span>Priority orders review. It is not the probability that an attack occurred.</span></footer>
        </Panel>

        <div className="overview-side">
          <Panel className="collection-panel">
            <SectionHeading eyebrow="Collection status" title="Workspace evidence" />
            <dl className="collection-facts">
              <div><dt>Registered accounts</dt><dd>{overview?.accounts ?? '—'}</dd></div>
              <div><dt>Active sources</dt><dd>{overview?.active_sources ?? '—'}</dd></div>
              <div><dt>Gmail connections</dt><dd>{gmailConnected.length}</dd></div>
              <div><dt>Latest analysis</dt><dd>{overview?.latest_job?.status ?? 'No analysis'}</dd></div>
            </dl>
            <button className="button button-secondary button-full" onClick={() => onNavigate('coverage')}>Manage connections</button>
            <button className="link-button coverage-link" onClick={() => onNavigate('protection')}>See protection coverage<Icons.arrow /></button>
          </Panel>

          <Panel className="privacy-card">
            <span className="privacy-card-icon"><Icons.lock aria-hidden="true" /></span>
            <div>
              <h2>Evidence, not the whole message</h2>
              <p>Full bodies and attachments are outside the persistent boundary. Rules create findings; AI may explain them but cannot change them.</p>
            </div>
            <a className="link-button" href="/privacy">Read the privacy boundary<Icons.arrow /></a>
          </Panel>
        </div>
      </div>

      <div className="overview-secondary">
        <Panel className="activity-panel">
          <SectionHeading
            eyebrow="Last 7 days · UTC"
            title="Retained activity"
            meta={<span className="chart-legend"><i className="legend-signal" />Signals<i className="legend-incident" />Incidents</span>}
          />
          {overview ? (
            <>
              <div className="activity-grid" role="img" aria-label="Seven-day retained activity. Exact daily counts are available in the data table below.">
                {overview.activity.map((day) => (
                  <div className="activity-day" key={day.day}>
                    <div className="activity-bars">
                      <span className="signal-bar" style={{ height: `${Math.max(4, day.signals / maximum * 100)}px` }} />
                      <span className="incident-bar" style={{ height: `${Math.max(4, day.incidents / maximum * 100)}px` }} />
                    </div>
                    <strong>{day.signals} / {day.incidents}</strong>
                    <span>{new Date(day.day + 'T12:00:00Z').toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' })}</span>
                  </div>
                ))}
              </div>
              <details className="chart-data">
                <summary>View daily counts</summary>
                <table><thead><tr><th>Date (UTC)</th><th>Signals</th><th>Incidents</th></tr></thead>
                  <tbody>{overview.activity.map((day) => <tr key={day.day}><td>{day.day}</td><td>{day.signals}</td><td>{day.incidents}</td></tr>)}</tbody>
                </table>
              </details>
            </>
          ) : <p className="muted-copy">Activity is unavailable until workspace totals load.</p>}
        </Panel>

        <Panel className="recent-activity">
          <SectionHeading eyebrow="Processing history" title="Recent analyses" action={<button className="link-button" onClick={() => onNavigate('evidence')}>Browse evidence<Icons.arrow /></button>} />
          {jobs.length ? jobs.slice(0, 3).map((job) => (
            <article key={job.id}>
              <span className={`job-dot status-${job.status}`} aria-hidden="true" />
              <div>
                <strong>{sources.find((source) => source.id === job.source_id)?.name ?? 'Registered source'}</strong>
                <small>{formatDateTime(job.created_at)}</small>
                <p>{job.imported_count} imported · {job.finding_count} findings · {job.duplicate_count} duplicates</p>
              </div>
              <span className={`badge status status-${job.status}`}>{job.status}</span>
            </article>
          )) : <p className="muted-copy">No analysis has been recorded.</p>}
        </Panel>
      </div>

      {accounts.some((account) => account.delete_after) && (
        <p className="retention-note">
          {accounts.filter((account) => account.delete_after).map((account) => `${accountLabel(account)}: local trial ends ${formatDateTime(account.delete_after ?? undefined)}`).join(' · ')}
        </p>
      )}
    </div>
  )
}
