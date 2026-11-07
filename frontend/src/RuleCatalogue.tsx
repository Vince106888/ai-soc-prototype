import { useEffect, useState } from 'react'
import { api } from './api'
import type { Credentials, DetectionRule } from './types'
import { humanize } from './utils'
import { Icons } from './icons'
import { PageHeader } from './ui'

export function RuleCatalogue({ credentials }: { credentials: Credentials }) {
  const [rules, setRules] = useState<DetectionRule[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [type, setType] = useState('')
  const enabledLabel = loading ? 'Checking enabled rules…' : error ? 'Enabled rule count unavailable' : `${rules.filter(rule => rule.enabled).length} enabled rules`
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    api.rules(credentials, controller.signal).then(result => { if (!controller.signal.aborted) setRules(result) }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load rules.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [credentials, revision])
  return <div className="page rules-page"><PageHeader eyebrow="Detection engine" title="Detection catalogue" description="Inspect the rules that create findings in your workspace." actions={<button className="button button-secondary" disabled={loading} onClick={() => setRevision(current => current + 1)}><Icons.refresh />Refresh</button>} /><section className="panel rules-intro"><div><strong>{enabledLabel}</strong><p>The number of enabled rules does not establish detection accuracy. Weights set review priority; confidence is configured and uncalibrated.</p></div><label>Signal type<select value={type} onChange={event => setType(event.target.value)}><option value="">All signal types</option>{[...new Set(rules.map(rule => rule.signal_type))].map(signal => <option key={signal} value={signal}>{humanize(signal)}</option>)}</select></label></section>{loading ? <p role="status">Loading detection catalogue…</p> : error ? <p role="alert" className="form-error">{error}</p> : <section className="panel rule-catalogue"><div className="rule-columns" aria-hidden="true"><span>Rule / detection</span><span>Signal</span><span>Weight</span><span>Confidence</span><span>Status</span></div>{rules.filter(rule => !type || rule.signal_type === type).map(rule => <details className="rule-record" key={rule.code}><summary><span><code>{rule.code}</code><strong>{rule.title}</strong><small>version {rule.version}</small></span><span>{humanize(rule.signal_type)}</span><span>{rule.weight.toFixed(2)}</span><span>{rule.confidence.toFixed(2)}</span><span className={`badge status ${rule.enabled ? 'status-completed' : 'status-disconnected'}`}>{rule.enabled ? 'Enabled' : 'Disabled'}</span></summary><div className="matcher-detail"><h3>Matcher configuration</h3><pre>{JSON.stringify(rule.configuration,null,2)}</pre></div></details>)}</section>}</div>
}
