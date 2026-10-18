import { Icons } from '../icons'
import type { Account, CapabilityProfile, Overview, ScanJob, Source } from '../types'
import { EmptyState, LoadingRows, Notice, PageHeader, Panel, PanelHeading, StatusBadge } from '../ui/primitives'
import { accountLabel, formatDateTime, humanize, relativeTime, type TelemetryCoverage } from '../utils'

function capabilityRows(profile: CapabilityProfile | null) {
  if (!profile) return []
  return [
    ...profile.signal_types.map(signal => ({ id: `signal-${signal}`, name: `${humanize(signal)} detection`, description: `Analyses ${humanize(signal).toLowerCase()} signals.`, enabled: true })),
    { id: 'controlled-ingestion', name: 'Controlled ingestion', description: `Up to ${profile.maximum_batch_size} signals per batch.`, enabled: profile.controlled_ingestion },
    { id: 'template-explanations', name: 'Template explanations', description: 'Deterministic, auditable incident wording.', enabled: profile.template_explanations },
    { id: 'ai-explanations', name: 'Local-model explanations', description: 'Optional plain-language wording from a model on this computer, with template fallback.', enabled: profile.ai_explanations },
  ]
}

export function SourcesPage({ loading, accounts, sources, jobs, overview, capabilities, telemetry, busy, onAddSource, onAnalyse, onToggleSource, onDelete }: {
  loading: boolean
  accounts: Account[]
  sources: Source[]
  jobs: ScanJob[]
  overview: Overview | null
  capabilities: CapabilityProfile | null
  telemetry: TelemetryCoverage
  busy: string
  onAddSource: () => void
  onAnalyse: () => void
  onToggleSource: (source: Source) => void
  onDelete: (account: Account) => void
}) {
  const rows = capabilityRows(capabilities)
  return <div className="page sources-page">
    <PageHeader title="Accounts & sources" lead="Where evidence comes from, what each source may send, and how to remove it." actions={<><button className="button button-secondary" onClick={onAddSource} type="button">Add source</button><button className="button button-primary" onClick={onAnalyse} type="button"><Icons.mail />Analyse email</button></>} />
    {!loading && telemetry.mode === 'none' && <Notice tone="warning" title="No live monitoring" action={<button className="button button-secondary" onClick={onAddSource} type="button">Add source</button>}>{capabilities?.controlled_ingestion ? 'This workspace accepts controlled data only. Add or activate a source to collect evidence.' : 'Add a selected-data source or connect Gmail for on-demand analysis.'}</Notice>}

    <div className="two-column">
      <Panel labelledBy="accounts-heading">
        <PanelHeading id="accounts-heading" title="Registered accounts" meta={`${telemetry.activeSourceCount} active ${telemetry.activeSourceCount === 1 ? 'source' : 'sources'}`} />
        {loading && !accounts.length ? <LoadingRows /> : accounts.length ? <div className="account-list">{accounts.map(account => {
          const label = accountLabel(account)
          const accountSources = sources.filter(source => source.account_id === account.id)
          return <section className="account" key={account.id} aria-label={label}>
            <header><span className="avatar" aria-hidden="true">{label.slice(0, 2).toUpperCase()}</span><div><strong>{label}</strong><small>{account.email || account.provider || account.id}</small></div><button className="button button-ghost button-small danger-text" onClick={() => onDelete(account)} type="button">Delete local data</button></header>
            {account.delete_after && <p className="field-help"><Icons.clock />Local trial data expires {formatDateTime(account.delete_after)}.</p>}
            {accountSources.length ? <ul className="source-list">{accountSources.map(source => {
              const activity = overview?.source_activity[source.id]
              const working = busy === `source-${source.id}`
              return <li className="source" key={source.id}>
                <div><strong>{source.name}</strong><span>{humanize(source.source_type || 'controlled')} · {source.capabilities?.length ?? 0} signal types</span><small>{activity ? `${activity.signal_count} signals · last ${relativeTime(activity.last_received_at)}` : 'No signals processed yet'}</small></div>
                <div className="source-actions"><StatusBadge status={source.status || 'unknown'} /><button className="button button-ghost button-small" disabled={working} onClick={() => onToggleSource(source)} type="button">{working ? 'Updating…' : source.status === 'active' ? 'Disconnect' : source.source_type === 'gmail' ? 'Reconnect Gmail' : 'Activate'}</button></div>
              </li>
            })}</ul> : <p className="muted">No source registered for this account.</p>}
          </section>
        })}</div> : <EmptyState icon={<Icons.building />} title="Add your first controlled source" action={<button className="button button-primary" onClick={onAddSource} type="button">Add source</button>}>Create an account and choose the signal types SentinelSME may accept for it.</EmptyState>}
      </Panel>

      <Panel labelledBy="capabilities-heading">
        <PanelHeading id="capabilities-heading" title="Engine capabilities" meta={`${rows.filter(row => row.enabled).length} supported by ${capabilities?.service || 'SentinelSME'}`} />
        {loading && !rows.length ? <LoadingRows /> : rows.length ? <>
          <ul className="capability-list">{rows.map(row => {
            const connected = row.id.startsWith('signal-') && telemetry.activeCapabilities.includes(row.id.replace('signal-', ''))
            return <li key={row.id} className={row.enabled ? '' : 'is-off'}><span className={`capability-state ${connected ? 'is-on' : row.enabled ? 'is-ready' : 'is-off'}`}>{connected ? 'Receiving' : row.enabled ? 'Available' : 'Off'}</span><div><strong>{row.name}</strong><p>{row.description}</p></div></li>
          })}</ul>
          {capabilities && <dl className="fact-row"><div><dt>Correlation window</dt><dd>{capabilities.correlation_window_minutes} min</dd></div><div><dt>Source types</dt><dd>{capabilities.source_types.length}</dd></div><div><dt>Live connectors</dt><dd>{capabilities.live_connectors.length}</dd></div><div><dt>Content retention</dt><dd>{capabilities.privacy.stores_full_bodies || capabilities.privacy.stores_attachments ? 'Enabled' : 'No bodies or attachments'}</dd></div></dl>}
        </> : <EmptyState title="No capability profile">The API did not report its supported detection contract.</EmptyState>}
      </Panel>
    </div>

    <Panel labelledBy="history-heading" className="history">
      <PanelHeading id="history-heading" title="Analysis history" meta={`${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}, newest first`} />
      {loading && !jobs.length ? <LoadingRows /> : jobs.length ? <div className="table-wrap"><table className="data-table">
        <thead><tr><th scope="col">Source</th><th scope="col">Started</th><th scope="col" className="num">Imported</th><th scope="col" className="num">Findings</th><th scope="col" className="num">Duplicates</th><th scope="col">Result</th></tr></thead>
        <tbody>{jobs.slice(0, 12).map(job => <tr key={job.id}><td><strong>{sources.find(item => item.id === job.source_id)?.name || 'Controlled source'}</strong><small>{humanize(job.trigger)} scan</small>{job.error && <small className="danger-text">{job.error}</small>}</td><td>{formatDateTime(job.created_at)}</td><td className="num">{job.imported_count}</td><td className="num">{job.finding_count}</td><td className="num">{job.duplicate_count}</td><td><StatusBadge status={job.status} />{job.status === 'failed' && <button className="button button-ghost button-small" onClick={onAnalyse} type="button">Run again</button>}</td></tr>)}</tbody>
      </table></div> : <EmptyState icon={<Icons.scan />} title="No analysis yet">Inspect a selected email or run a Gmail inbox sample.</EmptyState>}
    </Panel>
  </div>
}
