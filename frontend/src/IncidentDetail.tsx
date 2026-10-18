import { useState, type KeyboardEvent } from 'react'
import type { Incident, IncidentStatus, TrustChoice } from './types'
import { EvidenceValues } from './EvidenceWorkspace'
import { formatDateTime, formatUtc, humanize, incidentTitle, scorePercent } from './utils'
import { Icons } from './icons'
import { SeverityBadge, StatusBadge } from './ui/primitives'

const transitions: Record<IncidentStatus, IncidentStatus[]> = { new: ['under_review', 'false_positive'], under_review: ['resolved', 'false_positive'], resolved: ['under_review'], false_positive: [] }
const tabs = ['Overview', 'Evidence', 'Activity'] as const
type Tab = typeof tabs[number]

/**
 * The incident's evidence chain, left to right: what was observed, which
 * rules matched, the deterministic priority, who wrote the explanation and
 * the human decision. Each step opens the tab that substantiates it.
 */
function EvidenceChain({ incident, onOpen }: { incident: Incident; onOpen: (tab: Tab) => void }) {
  const findings = incident.findings ?? []
  const signals = incident.signals ?? []
  const codes = [...new Set(findings.map(finding => finding.rule_code).filter(Boolean))] as string[]
  const explanation = typeof incident.explanation === 'object' ? incident.explanation : null
  const score = scorePercent(incident.score)
  const decided = incident.status === 'resolved' || incident.status === 'false_positive'
  const steps: Array<{ label: string; value: string; detail: string; tab: Tab; tone?: string }> = [
    { label: 'Observed', value: `${signals.length} ${signals.length === 1 ? 'signal' : 'signals'}`, detail: 'Source observations', tab: 'Evidence' },
    { label: 'Matched', value: `${findings.length} ${findings.length === 1 ? 'rule' : 'rules'}`, detail: codes.slice(0, 3).join(', ') + (codes.length > 3 ? ` +${codes.length - 3}` : '') || 'No rule codes returned', tab: 'Evidence' },
    { label: 'Priority', value: score === undefined ? 'Not scored' : `${score} of 100`, detail: '1 − ∏(1 − weight)', tab: 'Evidence', tone: incident.severity },
    { label: 'Explained by', value: explanation?.source === 'ai' ? 'Local model' : 'Template', detail: explanation?.source === 'ai' ? 'From findings only' : 'Fixed wording', tab: 'Overview' },
    { label: 'Decision', value: humanize(incident.status), detail: decided ? 'Recorded by a reviewer' : 'Waiting for you', tab: 'Activity', tone: decided ? 'done' : 'pending' },
  ]
  return <ol className="evidence-chain" aria-label="Evidence chain">
    {steps.map(step => <li key={step.label} className={step.tone ? `chain-${step.tone}` : undefined}>
      <button type="button" onClick={() => onOpen(step.tab)} aria-label={`${step.label}: ${step.value}. Open ${step.tab.toLowerCase()} details`}>
        <span className="chain-label">{step.label}</span>
        <strong className="chain-value">{step.value}</strong>
        <span className="chain-detail">{step.detail}</span>
      </button>
    </li>)}
  </ol>
}

export function IncidentDetail({ incident, loading, onStatus, statusBusy, aiAvailable = false, onExplain, explainBusy = false, onBack }: { incident: Incident; loading: boolean; onStatus: (status: IncidentStatus, note: string, trust?: TrustChoice) => Promise<boolean>; statusBusy: boolean; aiAvailable?: boolean; onExplain?: () => Promise<void>; explainBusy?: boolean; onBack?: () => void }) {
  const [tab, setTab] = useState<Tab>('Overview')
  const [nextStatus, setNextStatus] = useState(incident.status)
  const [note, setNote] = useState('')
  const [trust, setTrust] = useState<TrustChoice>('none')
  const hasEmailSender = (incident.signals ?? []).some(signal => signal.signal_type === 'email' && Boolean(signal.features?.sender))
  const findings = incident.findings ?? []
  const actions = (incident.recommendations ?? incident.recommended_actions ?? []).map(item => typeof item === 'string' ? item : item.action)
  const explanation = typeof incident.explanation === 'object' ? incident.explanation : null
  const score = scorePercent(incident.score)
  const modelWritten = explanation?.source === 'ai'
  const sourceLabel = modelWritten ? 'local-model' : 'template'
  const reasons = explanation?.reasons ?? []
  const signs = explanation?.warning_signs ?? reasons.length
  const warningLabel = explanation?.warning_level ? `${signs} warning ${signs === 1 ? 'sign' : 'signs'} visible` : null
  const options = [incident.status, ...transitions[incident.status]]
  const openTab = (next: Tab) => { setTab(next); document.getElementById(`case-tab-${next}`)?.focus() }
  const onTabKey = (event: KeyboardEvent, item: Tab) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const target = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : delta ? tabs[(tabs.indexOf(item) + delta + tabs.length) % tabs.length] : null
    if (target) { event.preventDefault(); openTab(target) }
  }

  return <article className="case-detail" aria-busy={loading} aria-labelledby="case-title">
    <header className="case-header">
      {onBack && <button className="button button-ghost back-button" onClick={onBack} type="button"><Icons.back />Back to queue</button>}
      <div className="case-kicker"><SeverityBadge severity={incident.severity} suffix="priority" /><StatusBadge status={incident.status} /><details className="record-id"><summary>Case {incident.id.slice(0, 8)}</summary><code>{incident.id}</code></details></div>
      <h2 id="case-title">{incidentTitle(incident)}</h2>
      {incident.summary && <p className="case-summary-line">{incident.summary}</p>}
      <dl className="case-metrics">
        <div><dt>Review priority</dt><dd><span className="metric-number">{score ?? '—'}</span><span className="metric-unit"> / 100</span><span className={`priority-meter meter-${incident.severity}`} aria-hidden="true"><i style={{ width: `${score ?? 0}%` }} /></span></dd></div>
        <div><dt>Matched findings</dt><dd><span className="metric-number">{findings.length}</span></dd></div>
        <div><dt>Latest evidence</dt><dd><span className="metric-date">{formatDateTime(incident.last_seen_at)}</span><small>{formatUtc(incident.last_seen_at)}</small></dd></div>
      </dl>
    </header>

    <EvidenceChain incident={incident} onOpen={openTab} />

    <div className="case-body">
      <div className="case-main">
        <div className="tabs" role="tablist" aria-label="Incident detail sections">{tabs.map(item => <button id={`case-tab-${item}`} aria-controls={tab === item ? `case-panel-${item}` : undefined} aria-selected={tab === item} tabIndex={tab === item ? 0 : -1} onKeyDown={event => onTabKey(event, item)} role="tab" key={item} className="tab" onClick={() => setTab(item)} type="button">{item}{item === 'Evidence' && <span className="tab-count">{findings.length}</span>}</button>)}</div>
        <div id={`case-panel-${tab}`} role="tabpanel" aria-labelledby={`case-tab-${tab}`} className="tab-panel" tabIndex={0}>
          {tab === 'Overview' && <>
            <section className="brief">
              {modelWritten
                ? <p className="explanation-source" role="note"><Icons.info />Written in plain language by the local model from the findings in the Evidence tab. Rules, score and response guidance are unchanged.</p>
                : aiAvailable && onExplain && incident.status !== 'false_positive'
                  ? <button type="button" className="button button-secondary explain-button" disabled={explainBusy} onClick={() => void onExplain()}>{explainBusy ? 'Explaining locally… this can take a minute' : 'Explain in plain language (local model)'}</button>
                  : null}
              <h3>What happened</h3>
              <p>{explanation?.what_happened ?? incident.summary ?? incidentTitle(incident)}</p>
              <h3>Why it matters</h3>
              <p>{explanation?.why_it_matters ?? 'Review the observed evidence against the account’s expected activity.'}</p>
              {warningLabel && <p className={`warning-signs warning-${explanation?.warning_level}`}><strong>{warningLabel}.</strong> {explanation?.warning_note}</p>}
            </section>
            {reasons.length > 0 && <section className="reason-list" aria-label="Why each warning sign was flagged"><h3>Why each sign was flagged</h3><ul>{reasons.map(reason => <li key={reason.rule_code}><div className="reason-head"><strong>{reason.indicator}</strong><code>{reason.rule_code}</code></div><p>{reason.why}</p><p className="legitimate-if"><span>Could be legitimate if:</span> {reason.legitimate_if}</p></li>)}</ul></section>}
            {actions.length > 0 && <section className="guidance"><h3>Response guidance</h3><ol className="action-list">{actions.map((action, index) => <li key={`${action}-${index}`}>{action}</li>)}</ol></section>}
          </>}
          {tab === 'Evidence' && <>
            <p className="inline-note"><Icons.info />Score = 1 − product(1 − weight). It sets review priority, not attack probability. Confidence values are configured and uncalibrated.</p>
            <div className="finding-list">{findings.map(finding => <section className="finding" key={finding.id ?? finding.rule_code}><header><code>{finding.rule_code}</code><strong>{finding.title}</strong><span className="finding-weights">Weight {finding.weight?.toFixed(2)} · confidence {finding.confidence?.toFixed(2)}</span></header><EvidenceValues features={typeof finding.evidence === 'object' ? finding.evidence : { evidence: finding.evidence }} /></section>)}</div>
            <h3>Correlation context</h3>
            <p className="muted">Account {incident.account_id ?? 'not recorded'} · key {incident.correlation_key ?? 'not recorded'} · 30-minute evidence window.</p>
            <h3>Source observations</h3>
            <div className="signal-cards">{incident.signals?.map(signal => <details key={signal.id}><summary><strong>{humanize(signal.signal_type)}</strong><span>{formatDateTime(signal.occurred_at)}</span></summary><EvidenceValues features={signal.features} /></details>)}</div>
          </>}
          {tab === 'Activity' && <>
            <h3>Audit history</h3>
            {incident.audit?.length ? <ol className="timeline">{incident.audit.map((entry, index) => <li key={entry.id ?? index}><span className="timeline-dot" aria-hidden="true" /><div><strong>{humanize(entry.action ?? 'Incident updated')}</strong>{(entry.note || entry.detail) && <p>{entry.note || entry.detail}</p>}<small>{entry.actor ?? 'SentinelSME'} · {formatDateTime(entry.created_at ?? entry.timestamp)}</small></div></li>)}</ol> : <p className="muted">No audit entries were returned.</p>}
          </>}
        </div>
      </div>

      <aside className="decision" aria-labelledby="decision-heading">
        <div className="next-step"><span className="next-step-label">Recommended next step</span><p>{explanation?.next_step ?? actions[0] ?? 'Validate the evidence and record your review decision.'}</p></div>
        <h3 id="decision-heading">Record your decision</h3>
        <form className="form-stack" onSubmit={event => { event.preventDefault(); void onStatus(nextStatus, note, nextStatus === 'false_positive' ? trust : 'none').then(completed => { if (completed) { setNote(''); setTrust('none') } }) }}>
          <fieldset className="status-choices" disabled={!transitions[incident.status].length}>
            <legend className="sr-only">New status</legend>
            <div className="field"><label htmlFor="next-status">Status</label><select id="next-status" value={nextStatus} onChange={event => setNextStatus(event.target.value as IncidentStatus)}>{options.map(status => <option key={status} value={status}>{status === incident.status ? `${humanize(status)} (current)` : humanize(status)}</option>)}</select></div>
          </fieldset>
          <div className="field"><label htmlFor="status-note">Review note <span className="optional">optional</span></label><textarea id="status-note" maxLength={500} rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="What did you verify, and how?" /></div>
          {nextStatus === 'false_positive' && hasEmailSender && <div className="field"><label htmlFor="trust-sender">Trust this sender for future email <span className="optional">optional</span></label><select id="trust-sender" value={trust} onChange={event => setTrust(event.target.value as TrustChoice)}><option value="none">Don’t change trusted senders</option><option value="address">Trust this exact address</option><option value="domain">Trust the whole sender domain</option></select><p className="field-help">Trusted senders skip urgent-wording, link and reply-to checks on new email. Authentication, lookalike and payment-change checks still run.</p></div>}
          <button className="button button-primary" disabled={statusBusy || nextStatus === incident.status} type="submit">{statusBusy ? 'Updating…' : 'Update incident'}</button>
          {!transitions[incident.status].length && <p className="field-help">False-positive incidents have no further transitions.</p>}
        </form>
      </aside>
    </div>
    <footer className="case-footer"><Icons.lock /><span>Local evidence · {sourceLabel} explanation · human review</span></footer>
  </article>
}
