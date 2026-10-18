import { useState, type ReactNode } from 'react'
import type { CapabilityProfile, Source } from './types'
import { Icons } from './icons'
import { Notice, PageHeader } from './ui/primitives'

const protectionAreas = [
  { name: 'Inbound email', category: 'Email security', state: 'Sample analysis', summary: 'Sender, language, link-host and authentication indicators.', detail: 'Selected messages and bounded Gmail inbox samples. No mail-delivery interception or continuous monitoring.', rules: 'EMAIL-001–006 · URL-001–002' },
  { name: 'Account takeover', category: 'Identity', state: 'Controlled signals', summary: 'Correlate supplied sign-in, forwarding, MFA and grant indicators.', detail: 'Personal Gmail read-only permission does not expose account posture. Live administrator telemetry is required.', rules: 'SIGNIN-001 · MFA-001 · FORWARD-001 · OAUTH-001' },
  { name: 'Brand impersonation', category: 'Email security', state: 'Rule indicators', summary: 'Recognised display names and declared lookalike domains.', detail: 'Brand/domain checks require the relevant context. No visual logo or sender relationship modelling.', rules: 'EMAIL-003 · EMAIL-004' },
  { name: 'BEC / payment redirection', category: 'Email security', state: 'Rule indicators', summary: 'Changed payment details combined with a payment instruction.', detail: 'A narrow phrase rule, not proof of fraud or broad BEC protection. Confirm changes through an independent trusted channel.', rules: 'EMAIL-006' },
  { name: 'DMARC observations', category: 'Email security', state: 'Message evidence', summary: 'Display supplied SPF, DKIM and DMARC results.', detail: 'Per-message observations only. No aggregate reports, domain posture monitoring or independent signature verification.', rules: 'EMAIL-005' },
  { name: 'Outbound mail', category: 'Mail operations', state: 'Not implemented', summary: 'No outbound scanning or data-loss prevention.', detail: 'Requires an outbound delivery integration, policy model and evaluation.', rules: '' },
  { name: 'Internal mail', category: 'Mail operations', state: 'Not implemented', summary: 'No internal routing or sender relationship model.', detail: 'An inbox sample cannot establish internal mail protection. Requires managed-domain telemetry.', rules: '' },
  { name: 'Attachment / malware analysis', category: 'Mail operations', state: 'Outside current scope', summary: 'Attachments are not downloaded, retained or executed.', detail: 'No malware, ransomware or zero-day verdict is available. A reviewed external inspection boundary would be necessary.', rules: '' },
  { name: 'Email encryption', category: 'Mail operations', state: 'Not implemented', summary: 'OAuth token encryption is not email encryption.', detail: 'Message encryption requires delivery integration and key lifecycle management.', rules: '' },
  { name: 'Graymail & signatures', category: 'Mail operations', state: 'Not implemented', summary: 'No bulk-mail management or signature insertion.', detail: 'Mail-administration features are separate from evidence-backed incident investigation.', rules: '' },
]

export function ProtectionCoverage({ profile, sources, onAnalyse, children }: { profile: CapabilityProfile | null; sources: Source[]; onAnalyse: () => void; children?: ReactNode }) {
  const [category, setCategory] = useState('All capabilities')
  const gmail = sources.filter(source => source.status === 'active' && source.source_type === 'gmail')
  const unavailable = (state: string) => state.includes('Not') || state.includes('Outside')
  const visible = protectionAreas.filter(area => category === 'All capabilities' || area.category === category)
  const available = protectionAreas.filter(area => !unavailable(area.state)).length
  return <div className="page coverage-page">
    <PageHeader title="Protection coverage" lead={`What SentinelSME can assess today, where its evidence comes from, and what it does not do. ${available} of ${protectionAreas.length} areas have an implemented check.`} actions={<button className="button button-primary" onClick={onAnalyse} type="button"><Icons.mail />Analyse email</button>} />
    <Notice tone={gmail.length ? 'success' : 'info'} title={gmail.length ? `${gmail.length} Gmail source${gmail.length === 1 ? '' : 's'} connected for samples` : 'No live mailbox connected'}>{gmail.length ? 'Collection runs when you request a sample. Mail delivery stays with your provider.' : profile?.gmail?.configured ? 'Google setup is ready. Connect an account to collect a read-only sample.' : 'Controlled analysis is available. Gmail needs local credentials and your consent.'}</Notice>
    <div className="segmented" role="group" aria-label="Capability category">{['All capabilities', 'Email security', 'Identity', 'Mail operations'].map(item => <button aria-pressed={category === item} key={item} onClick={() => setCategory(item)} type="button">{item}</button>)}</div>
    <ul className="coverage-list">{visible.map(area => <li className={`coverage-item ${unavailable(area.state) ? 'is-missing' : 'is-present'}`} key={area.name}>
      <div className="coverage-state"><span className="coverage-mark" aria-hidden="true">{unavailable(area.state) ? <Icons.close /> : <Icons.check />}</span><span>{area.state}</span></div>
      <div className="coverage-body"><h2>{area.name}</h2><p>{area.summary}</p><details className="disclosure"><summary>Coverage details</summary><p>{area.detail}</p>{area.rules && <p><code>{area.rules}</code></p>}</details></div>
      <span className="coverage-category">{area.category}</span>
    </li>)}</ul>
    <section className="panel" aria-labelledby="platforms-heading"><div className="panel-heading"><div><h2 id="platforms-heading">Email platforms</h2></div></div><dl className="platform-list"><div><dt>Personal Gmail</dt><dd><strong>{gmail.length ? 'Connected · bounded samples' : profile?.gmail?.configured ? 'Ready for consent' : 'Setup required'}</strong><span>Email indicators only; no administrator account telemetry.</span></dd></div><div><dt>Google Workspace</dt><dd><strong>Administrator integration pending</strong><span>Requires managed-domain authorisation and supported APIs.</span></dd></div><div><dt>Microsoft 365</dt><dd><strong>Connector not implemented</strong><span>Requires a separate Microsoft Graph integration.</span></dd></div></dl></section>
    {children}
  </div>
}
