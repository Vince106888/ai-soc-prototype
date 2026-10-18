import { useState, type ReactNode } from 'react'
import { api } from './api'
import type { Credentials } from './types'
import { humanize } from './utils'
import { Icons } from './icons'
import { useRequest } from './ui/hooks'
import { ErrorState, LoadingRows, PageHeader } from './ui/primitives'

export function RuleCatalogue({ credentials, children }: { credentials: Credentials; children?: ReactNode }) {
  const [revision, setRevision] = useState(0)
  const [type, setType] = useState('')
  const request = useRequest(JSON.stringify([credentials, revision]), signal => api.rules(credentials, signal), 'Could not load rules.')
  const rules = request.data ?? []
  const enabled = rules.filter(rule => rule.enabled).length
  const enabledLabel = request.loading ? 'Checking enabled rules…' : request.error ? 'Enabled rule count unavailable' : `${enabled} enabled ${enabled === 1 ? 'rule' : 'rules'}`
  const visible = rules.filter(rule => !type || rule.signal_type === type)
  return <div className="page rules-page">
    <PageHeader title="Detection rules" lead="The deterministic rules that create findings in this workspace, with their weights and matcher settings." actions={<button className="button button-secondary" disabled={request.loading} onClick={() => setRevision(current => current + 1)} type="button"><Icons.refresh />Refresh</button>} />
    <section className="panel rules-intro">
      <div><strong>{enabledLabel}</strong><p className="muted">The number of enabled rules does not establish detection accuracy. Weights set review priority; confidence is configured and uncalibrated.</p></div>
      <div className="field"><label htmlFor="rule-signal">Signal type</label><select id="rule-signal" value={type} onChange={event => setType(event.target.value)}><option value="">All signal types</option>{[...new Set(rules.map(rule => rule.signal_type))].map(signal => <option key={signal} value={signal}>{humanize(signal)}</option>)}</select></div>
    </section>
    {request.loading ? <LoadingRows count={5} label="Loading detection rules" /> : request.error ? <ErrorState message={request.error} retry={() => setRevision(current => current + 1)} /> : <section className="panel rule-table" aria-label="Detection rules">
      <div className="rule-columns" aria-hidden="true"><span>Rule</span><span>Signal</span><span className="num">Weight</span><span className="num">Confidence</span><span>Status</span></div>
      {visible.map(rule => <details className="rule-record" key={rule.code}>
        <summary><span className="rule-name"><code>{rule.code}</code><strong>{rule.title}</strong><small>version {rule.version}</small></span><span className="rule-signal">{humanize(rule.signal_type)}</span><span className="num">{rule.weight.toFixed(2)}</span><span className="num">{rule.confidence.toFixed(2)}</span><span className={`badge state ${rule.enabled ? 'state-completed' : 'state-disconnected'}`}>{rule.enabled ? 'Enabled' : 'Disabled'}</span></summary>
        <div className="matcher-detail"><h3>Matcher configuration</h3><pre>{JSON.stringify(rule.configuration, null, 2)}</pre></div>
      </details>)}
    </section>}
    {children}
  </div>
}
