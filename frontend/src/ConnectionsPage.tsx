import { Icons } from './icons'
import { GmailFlowArt } from './illustrations'
import { EmptyState, InlineNotice, LoadingRows, PageHeader, Panel, SectionHeading, StatusBadge } from './ui'
import type { Account, CapabilityProfile, Overview, ScanJob, Source } from './types'
import { accountLabel, formatDateTime, humanize, relativeTime } from './utils'

export function ConnectionsPage({
  overview,
  accounts,
  sources,
  profile,
  jobs,
  loading,
  error,
  onRefresh,
  onAddSource,
  onAnalyse,
  onConnectGmail,
  onDeleteAccount,
  onChangeSourceStatus,
  operationBusy,
}: {
  overview: Overview | null
  accounts: Account[]
  sources: Source[]
  profile: CapabilityProfile | null
  jobs: ScanJob[]
  loading: boolean
  error: string
  onRefresh: () => void
  onAddSource: () => void
  onAnalyse: () => void
  onConnectGmail: () => void
  onDeleteAccount: (account: Account) => void
  onChangeSourceStatus: (source: Source) => void
  operationBusy: string
}) {
  const controlledEmail = sources.filter((source) =>
    source.source_type === 'controlled' &&
    source.status === 'active' &&
    source.capabilities?.includes('email'),
  )
  const gmailSources = sources.filter((source) => source.source_type === 'gmail')
  const activeGmail = gmailSources.filter((source) => source.status === 'active')
  const latestJob = jobs[0]
  const gmailLastScan = gmailSources
    .map((source) => source.last_scan_at)
    .filter(Boolean)
    .sort()
    .at(-1)

  return (
    <div className="page connections-page">
      <PageHeader
        eyebrow="Workspace access"
        title="Connections"
        description="Choose where evidence comes from. Selected-message analysis works without a mailbox connection."
        actions={<>
          <button className="button button-secondary" disabled={loading} onClick={onRefresh}><Icons.refresh />{loading ? 'Refreshing…' : 'Refresh'}</button>
          <button className="button button-primary" onClick={onAddSource}><Icons.building />Add controlled source</button>
        </>}
      />

      {error && <InlineNotice tone="danger" title="Some connection data is unavailable">{error}</InlineNotice>}

      <div className="connection-cards">
        <article className="connection-card">
          <span className="connection-card-icon"><Icons.mail aria-hidden="true" /></span>
          <div className="connection-card-heading">
            <div><span className="eyebrow">Safest default</span><h2>Selected messages</h2></div>
            <span className="status-pill success"><Icons.check aria-hidden="true" />Ready</span>
          </div>
          <p>Analyse a message you own or are authorised to inspect. No Google connection is required.</p>
          <dl className="connection-facts">
            <div><dt>Active email sources</dt><dd>{controlledEmail.length}</dd></div>
            <div><dt>Evidence retained</dt><dd>{overview?.retained_signals ?? 0} signals</dd></div>
          </dl>
          <button className="button button-primary" onClick={onAnalyse}><Icons.scan />Analyse selected message</button>
        </article>

        <article className={`connection-card gmail-connection-card ${activeGmail.length ? 'is-connected' : ''}`}>
          <span className="connection-card-icon"><Icons.key aria-hidden="true" /></span>
          <div className="connection-card-heading">
            <div><span className="eyebrow">Optional · on demand</span><h2>Gmail samples</h2></div>
            <span className={`status-pill ${activeGmail.length ? 'success' : profile?.gmail?.configured ? 'info' : 'neutral'}`}>
              {activeGmail.length ? <Icons.check aria-hidden="true" /> : <Icons.info aria-hidden="true" />}
              {activeGmail.length ? 'Connected' : profile?.gmail?.configured ? 'Ready for consent' : 'Setup required'}
            </span>
          </div>
          <p>Read-only access lets you collect a bounded inbox sample you explicitly request. This is not continuous monitoring.</p>
          <dl className="connection-facts">
            <div><dt>Permission</dt><dd>Read-only sample</dd></div>
            <div><dt>Last collection</dt><dd>{gmailLastScan ? formatDateTime(gmailLastScan) : 'Not yet collected'}</dd></div>
          </dl>
          {!profile?.gmail?.configured && (
            <p className="inline-note"><Icons.info aria-hidden="true" />Gmail is not configured for this deployment. Selected-message analysis remains available.</p>
          )}
          <button className="button button-secondary" onClick={onConnectGmail}>
            <Icons.key />{activeGmail.length ? 'Manage Gmail sample' : 'Review Gmail connection'}
          </button>
        </article>

        <article className="connection-card">
          <span className="connection-card-icon"><Icons.activity aria-hidden="true" /></span>
          <div className="connection-card-heading">
            <div><span className="eyebrow">Collection status</span><h2>Workspace</h2></div>
            <span className="status-pill neutral">{accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}</span>
          </div>
          <p>Review processed data and analysis history. A queued job is not evidence that a mailbox was scanned.</p>
          <dl className="connection-facts">
            <div><dt>Active sources</dt><dd>{overview?.active_sources ?? sources.filter((source) => source.status === 'active').length}</dd></div>
            <div><dt>Latest analysis</dt><dd>{latestJob ? relativeTime(latestJob.created_at) : 'None yet'}</dd></div>
          </dl>
          <button className="button button-secondary" onClick={onAddSource}><Icons.building />Register a source</button>
        </article>
      </div>

      <div className="connections-layout">
        <Panel className="connections-list-panel">
          <SectionHeading eyebrow="Accounts and sources" title="What is connected" meta={<span>{sources.filter((source) => source.status === 'active').length} active</span>} />
          {loading ? <LoadingRows count={4} label="Loading connections" /> : accounts.length ? (
            <div className="source-groups">
              {accounts.map((account) => {
                const label = accountLabel(account)
                const accountSources = sources.filter((source) => source.account_id === account.id)
                return (
                  <section className="source-group" key={account.id}>
                    <header>
                      <span className="account-avatar" aria-hidden="true">{label.slice(0, 2).toUpperCase()}</span>
                      <div><strong>{label}</strong><small>{account.email || account.provider || account.id}</small></div>
                      <button className="link-button danger-link" onClick={() => onDeleteAccount(account)} type="button">Delete local data</button>
                    </header>
                    {account.delete_after && <p className="retention-note"><Icons.clock aria-hidden="true" />Local trial data expires {formatDateTime(account.delete_after)}.</p>}
                    {accountSources.length ? (
                      <div className="source-list">
                        {accountSources.map((source) => (
                          <article className="source-card" key={source.id}>
                            <span className={`source-type-icon ${source.source_type === 'gmail' ? 'gmail' : ''}`} aria-hidden="true">
                              {source.source_type === 'gmail' ? <Icons.key /> : <Icons.mail />}
                            </span>
                            <div className="source-card-copy">
                              <strong>{source.name}</strong>
                              <span>{humanize(source.source_type || 'controlled')} · {source.capabilities?.length ?? 0} signal types</span>
                              <small>{source.last_scan_at ? `Last collection ${relativeTime(source.last_scan_at)}` : overview?.source_activity[source.id] ? `${overview.source_activity[source.id].signal_count} signals · ${relativeTime(overview.source_activity[source.id].last_received_at)}` : 'No signals processed'}</small>
                            </div>
                            <div className="source-actions">
                              <StatusBadge status={source.status || 'unknown'} />
                              <button
                                className="button button-quiet button-small"
                                disabled={operationBusy === `source-${source.id}`}
                                onClick={() => onChangeSourceStatus(source)}
                                type="button"
                              >
                                {operationBusy === `source-${source.id}` ? 'Updating…' : source.status === 'active' ? 'Disconnect' : source.source_type === 'gmail' ? 'Reconnect in Analyse' : 'Activate'}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : <p className="inline-note"><Icons.info aria-hidden="true" />No source registered for this account.</p>}
                  </section>
                )
              })}
            </div>
          ) : (
            <EmptyState
              title="No controlled sources yet"
              description="You can analyse a selected message now; a source is created automatically for the account you attach it to."
              action={<button className="button button-primary" onClick={onAnalyse}>Analyse selected message</button>}
              secondaryAction={<button className="button button-secondary" onClick={onAddSource}>Add controlled source</button>}
              icon={<Icons.building />}
            />
          )}
        </Panel>

        <div className="connections-side">
          <Panel className="connection-boundary-panel">
            <SectionHeading eyebrow="Permission boundary" title="Read-only by design" />
            <GmailFlowArt />
            <ul className="boundary-list">
              <li><Icons.check aria-hidden="true" />Collect only a bounded inbox sample you request.</li>
              <li><Icons.check aria-hidden="true" />Never send, delete, quarantine or modify mail.</li>
              <li><Icons.check aria-hidden="true" />Exclude attachments and do not open submitted links.</li>
              <li><Icons.check aria-hidden="true" />Retain minimised evidence, not full message bodies.</li>
            </ul>
            <p className="privacy-caption">Gmail permission is separate from sign-in. A configured Google client is not a connected mailbox.</p>
          </Panel>

          <Panel className="operations-panel">
            <SectionHeading eyebrow="Processing history" title="Recent analyses" meta={<span>{jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}</span>} />
            {loading ? <LoadingRows count={3} label="Loading analysis history" /> : jobs.length ? (
              <div className="scan-history">
                {jobs.slice(0, 8).map((job) => {
                  const source = sources.find((item) => item.id === job.source_id)
                  return (
                    <article className="scan-row" key={job.id}>
                      <span className={`scan-status scan-status-${job.status}`} aria-hidden="true"><Icons.scan /></span>
                      <div className="scan-main">
                        <strong>{source?.name || 'Registered source'}</strong>
                        <span>{humanize(job.trigger)} analysis · {formatDateTime(job.created_at)}</span>
                        {job.error && <small className="scan-error">{job.error}</small>}
                      </div>
                      <div className="scan-counts">
                        <span><strong>{job.imported_count}</strong> imported</span>
                        <span><strong>{job.finding_count}</strong> findings</span>
                      </div>
                      <StatusBadge status={job.status} />
                    </article>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                className="compact-state"
                title="No analysis yet"
                description="Analyse a selected email to create the first evidence record."
                action={<button className="button button-primary" onClick={onAnalyse}>Analyse selected message</button>}
                icon={<Icons.scan />}
              />
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
