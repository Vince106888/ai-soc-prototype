import { useId, useState } from 'react'
import { EvidenceValues } from './EvidenceWorkspace'
import { Icons } from './icons'
import { InlineNotice, SeverityBadge, StatusBadge } from './ui'
import type { Incident, IncidentStatus, TrustChoice } from './types'
import { formatDateTime, formatUtc, humanize, incidentTitle, scorePercent } from './utils'

const transitions: Record<IncidentStatus, IncidentStatus[]> = {
  new: ['under_review', 'false_positive'],
  under_review: ['resolved', 'false_positive'],
  resolved: ['under_review'],
  false_positive: [],
}

const tabs = ['Overview', 'Evidence', 'Activity'] as const
type Tab = typeof tabs[number]

export function IncidentDetail({
  incident,
  loading,
  onStatus,
  statusBusy,
  aiAvailable = false,
  onExplain,
  explainBusy = false,
}: {
  incident: Incident
  loading: boolean
  onStatus: (status: IncidentStatus, note: string, trust?: TrustChoice) => Promise<boolean>
  statusBusy: boolean
  aiAvailable?: boolean
  onExplain?: () => Promise<void>
  explainBusy?: boolean
}) {
  const id = useId()
  const [tab, setTab] = useState<Tab>('Overview')
  const [nextStatus, setNextStatus] = useState(incident.status)
  const [note, setNote] = useState('')
  const [trust, setTrust] = useState<TrustChoice>('none')
  const hasEmailSender = (incident.signals ?? []).some((signal) => signal.signal_type === 'email' && Boolean(signal.features?.sender))
  const findings = incident.findings ?? []
  const actions = (incident.recommendations ?? incident.recommended_actions ?? []).map((item) => typeof item === 'string' ? item : item.action)
  const explanation = typeof incident.explanation === 'object' ? incident.explanation : null
  const score = scorePercent(incident.score)
  const modelWritten = explanation?.source === 'ai'
  const reasons = explanation?.reasons ?? []
  const warningLabel = explanation?.warning_level ? `${explanation.warning_signs ?? reasons.length} warning ${(explanation.warning_signs ?? reasons.length) === 1 ? 'sign' : 'signs'} visible` : null

  const selectTab = (next: Tab) => {
    setTab(next)
    document.getElementById(`${id}-tab-${next}`)?.focus()
  }

  return (
    <article className="case-detail" aria-busy={loading}>
      <header className="case-header">
        <div className="case-kicker">
          <SeverityBadge severity={incident.severity} />
          <StatusBadge status={incident.status} />
          <details className="record-id">
            <summary>Case {incident.id.slice(0, 8)}</summary>
            <code>{incident.id}</code>
          </details>
        </div>
        <h2>{incidentTitle(incident)}</h2>
        <p>{incident.summary}</p>
        <div className="case-metrics">
          <div>
            <span>Review priority</span>
            <strong>{score ?? '—'}<small> / 100</small></strong>
            <div className={`priority-track score-${incident.severity}`} aria-hidden="true"><i style={{ width: `${score ?? 0}%` }} /></div>
            <small>Priority, not attack probability</small>
          </div>
          <div><span>Matched findings</span><strong>{findings.length}</strong><small>Deterministic rules</small></div>
          <div><span>Latest evidence</span><strong className="metric-date">{formatDateTime(incident.last_seen_at)}</strong><small>{formatUtc(incident.last_seen_at)}</small></div>
        </div>
      </header>

      <div className="case-trace" aria-label="Evidence chain">
        <div><Icons.mail aria-hidden="true" /><span><strong>{incident.signals?.length ?? 0}</strong> signals</span></div>
        <Icons.arrow aria-hidden="true" />
        <div><Icons.shield aria-hidden="true" /><span><strong>{findings.length}</strong> rules matched</span></div>
        <Icons.arrow aria-hidden="true" />
        <div><Icons.alert aria-hidden="true" /><span><strong>{incident.severity}</strong> incident</span></div>
        <Icons.arrow aria-hidden="true" />
        <div><Icons.user aria-hidden="true" /><span><strong>Human</strong> review</span></div>
      </div>

      <div className="case-tabs" role="tablist" aria-label="Incident detail sections">
        {tabs.map((item) => (
          <button
            id={`${id}-tab-${item}`}
            key={item}
            role="tab"
            aria-controls={`${id}-panel-${item}`}
            aria-selected={tab === item}
            tabIndex={tab === item ? 0 : -1}
            onKeyDown={(event) => {
              const index = tabs.indexOf(item)
              const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
              const next = event.key === 'Home'
                ? tabs[0]
                : event.key === 'End'
                  ? tabs.at(-1)
                  : delta
                    ? tabs[(index + delta + tabs.length) % tabs.length]
                    : null
              if (next) {
                event.preventDefault()
                selectTab(next)
              }
            }}
            className={tab === item ? 'selected' : ''}
            onClick={() => setTab(item)}
            type="button"
          >
            {item}{item === 'Evidence' && <span>{findings.length}</span>}
          </button>
        ))}
      </div>

      <div id={`${id}-panel-${tab}`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} className="case-tab-content">
        {tab === 'Overview' && (
          <>
            <section className="case-summary">
              <div className="explanation-heading">
                <div><p className="eyebrow">Investigation brief</p><h3>What happened</h3></div>
                {modelWritten ? (
                  <span className="status-pill ai"><Icons.sparkle aria-hidden="true" />AI-generated explanation</span>
                ) : (
                  <span className="status-pill info"><Icons.shield aria-hidden="true" />Deterministic template</span>
                )}
              </div>
              {modelWritten && (
                <InlineNotice tone="info" title="Explanation source">
                  This prose was generated from the structured findings in the Evidence tab. Rules, score and response guidance are unchanged.
                </InlineNotice>
              )}
              {!modelWritten && aiAvailable && onExplain && incident.status !== 'false_positive' && (
                <button type="button" className="button button-secondary explain-button" disabled={explainBusy || incident.explanation_job?.status === 'queued' || incident.explanation_job?.status === 'running'} onClick={() => void onExplain()}>
                  <Icons.sparkle aria-hidden="true" />
                  {incident.explanation_job?.status === 'queued' ? 'Explanation queued…' : incident.explanation_job?.status === 'running' ? 'Preparing explanation…' : explainBusy ? 'Requesting explanation…' : 'Explain in plain language (local model)'}
                </button>
              )}
              <p>{explanation?.what_happened ?? incident.summary ?? incidentTitle(incident)}</p>
              <h3>Why it matters</h3>
              <p>{explanation?.why_it_matters ?? 'Review the observed evidence against the account’s expected activity.'}</p>
              {warningLabel && <p className={`warning-signs warning-${explanation?.warning_level}`}><strong>{warningLabel}.</strong> {explanation?.warning_note}</p>}
              {reasons.length > 0 && (
                <section className="reason-list" aria-label="Why each warning sign was flagged">
                  <h3>Why each sign was flagged</h3>
                  <ul>
                    {reasons.map((reason) => (
                      <li key={reason.rule_code}>
                        <strong>{reason.indicator}</strong>
                        <p>{reason.why}</p>
                        <p className="legitimate-if"><span>Could be legitimate if:</span> {reason.legitimate_if}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <div className="next-step">
                <Icons.arrow aria-hidden="true" />
                <div><strong>Recommended next step</strong><p>{explanation?.next_step ?? actions[0] ?? 'Validate the evidence and record your review decision.'}</p></div>
              </div>
            </section>

            <div className="case-response">
              <section>
                <h3>Response guidance</h3>
                <p className="field-help">Advisory only. SentinelSME will not change your account or perform remediation.</p>
                <ol className="action-list">
                  {actions.map((action, index) => <li key={`${action}-${index}`}><span>{index + 1}</span><p>{action}</p></li>)}
                </ol>
              </section>
              <section>
                <h3>Record your decision</h3>
                <form className="status-form" onSubmit={(event) => {
                  event.preventDefault()
                  void onStatus(nextStatus, note, nextStatus === 'false_positive' ? trust : 'none').then((completed) => {
                    if (completed) {
                      setNote('')
                      setTrust('none')
                    }
                  })
                }}>
                  <label htmlFor={`${id}-next-status`}>Status</label>
                  <select id={`${id}-next-status`} value={nextStatus} onChange={(event) => setNextStatus(event.target.value as IncidentStatus)}>
                    {[incident.status, ...transitions[incident.status]].map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
                  </select>
                  <label htmlFor={`${id}-status-note`}>Review note <span>(optional)</span></label>
                  <textarea id={`${id}-status-note`} maxLength={500} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What did you verify?" />
                  {nextStatus === 'false_positive' && hasEmailSender && (
                    <>
                      <label htmlFor={`${id}-trust-sender`}>Trust this sender for future email <span>(optional)</span></label>
                      <select id={`${id}-trust-sender`} value={trust} onChange={(event) => setTrust(event.target.value as TrustChoice)}>
                        <option value="none">Don’t change trusted senders</option>
                        <option value="address">Trust this exact address</option>
                        <option value="domain">Trust the whole sender domain</option>
                      </select>
                      <p className="muted-copy">Trusted senders skip urgent-wording, link and reply-to checks on new email. Authentication, lookalike and payment-change checks still run.</p>
                    </>
                  )}
                  <button className="button button-primary" disabled={statusBusy || nextStatus === incident.status} type="submit">
                    {statusBusy ? 'Updating…' : 'Update incident'}
                  </button>
                  {!transitions[incident.status].length && <p className="muted-copy">False-positive incidents have no further transitions.</p>}
                </form>
              </section>
            </div>
          </>
        )}

        {tab === 'Evidence' && (
          <>
            <div className="evidence-explainer">
              <Icons.shield aria-hidden="true" />
              <p>Score = 1 − product(1 − weight). It sets review priority, not attack probability. Confidence values are configured and uncalibrated.</p>
            </div>
            <div className="case-finding-list">
              {findings.map((finding) => (
                <section key={finding.id ?? finding.rule_code}>
                  <header><code>{finding.rule_code}</code><strong>{finding.title}</strong><span>Weight {finding.weight?.toFixed(2)} · confidence {finding.confidence?.toFixed(2)}</span></header>
                  <EvidenceValues features={typeof finding.evidence === 'object' ? finding.evidence : { evidence: finding.evidence }} />
                </section>
              ))}
            </div>
            <h3>Correlation context</h3>
            <p>Account {incident.account_id} · key {incident.correlation_key} · 30-minute evidence window.</p>
            <h3>Source observations</h3>
            <div className="signal-cards">
              {incident.signals?.map((signal) => (
                <details key={signal.id}>
                  <summary><strong>{humanize(signal.signal_type)}</strong><span>{formatDateTime(signal.occurred_at)}</span></summary>
                  <EvidenceValues features={signal.features} />
                </details>
              ))}
            </div>
          </>
        )}

        {tab === 'Activity' && (
          <>
            <h3>Audit history</h3>
            {incident.audit?.length ? (
              <ol className="timeline">
                {incident.audit.map((entry, index) => (
                  <li key={entry.id ?? index}>
                    <span className="timeline-dot" aria-hidden="true" />
                    <div>
                      <strong>{humanize(entry.action ?? 'Incident updated')}</strong>
                      {(entry.note || entry.detail) && <p>{entry.note || entry.detail}</p>}
                      <small>{entry.actor ?? 'SentinelSME'} · {formatDateTime(entry.created_at ?? entry.timestamp)}</small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="muted-copy">No audit entries were returned.</p>}
          </>
        )}
      </div>
      <footer className="case-footer"><Icons.lock aria-hidden="true" /><span>Private evidence · {modelWritten ? 'AI-generated explanation' : 'deterministic template'} · human review</span></footer>
    </article>
  )
}
