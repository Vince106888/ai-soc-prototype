import { useState, type FormEvent } from 'react'
import type { Account, IngestionResult, Source } from './types'

export interface EmailDraft {
  accountId: string
  accountEmail: string
  sourceId: string
  sender: string
  replyTo: string
  displayName: string
  subject: string
  body: string
  spf: string
  dkim: string
  dmarc: string
  claimedDomains?: string[]
}

export function EmailAnalysis({ accounts, sources, onAnalyze, onInspect }: {
  accounts: Account[]
  sources: Source[]
  onAnalyze: (draft: EmailDraft) => Promise<IngestionResult & { accountId?: string }>
  onInspect: (id: string) => void
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [accountEmail, setAccountEmail] = useState('')
  const [sender, setSender] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [domains, setDomains] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [auth, setAuth] = useState({ spf: '', dkim: '', dmarc: '' })
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<IngestionResult | null>(null)
  const source = sources.find(item => item.account_id === accountId && item.status === 'active' && item.source_type === 'controlled' && item.capabilities?.includes('email'))
  const example = (suspicious: boolean) => {
    setSender(suspicious ? 'notice@billing-example.test' : 'team@example.test')
    setReplyTo(suspicious ? 'help@other-example.test' : 'team@example.test')
    setDisplayName(suspicious ? 'Account support' : 'Example team')
    setSubject(suspicious ? 'Verify your account immediately' : 'Meeting agenda for Monday')
    setBody(suspicious ? 'Confirm your identity at https://secure.example.test/verify. This is a synthetic example.' : 'The meeting starts at 10. Please bring the draft agenda. This is a synthetic example.')
    setAuth({ spf: '', dkim: '', dmarc: '' }); setResult(null)
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!acknowledged) return
    const claimedDomains = domains.split(',').map(item => item.trim().toLowerCase()).filter(Boolean)
    if (claimedDomains.length > 20 || claimedDomains.some(domain => domain.length > 253 || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain))) {
      setError('Enter up to 20 trusted domain names, without email addresses or URL paths.')
      return
    }
    setBusy(true); setError(''); setResult(null)
    try {
      const completed = await onAnalyze({ accountId, accountEmail, sourceId: source?.id ?? '', sender, replyTo, displayName, subject, body, claimedDomains, ...auth })
      setResult(completed)
      if (completed.accountId) { setAccountId(completed.accountId); setAccountEmail('') }
      setBody('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Email analysis failed.') }
    finally { setBusy(false) }
  }
  const incidentIds = [...new Set(result?.items.flatMap(item => item.incident_ids) ?? [])]
  return <div className="analysis-layout">
    <section className="panel analysis-form-panel">
      <div className="panel-heading"><div><h2>Inspect a message</h2><p className="panel-meta">Processed on this computer</p></div></div>
      <p className="muted">Copy only the email you want to assess. Links are parsed without being opened, and the body is reduced to matched phrases before storage.</p>
      <div className="example-actions"><span>Try a synthetic example</span><button className="button button-secondary" onClick={() => example(true)}>Suspicious message</button><button className="button button-secondary" onClick={() => example(false)}>Routine message</button></div>
      <form className="analysis-form" onSubmit={event => void submit(event)}>
        <label>Account<select value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">Add a local account</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.display_name || account.email}</option>)}</select></label>
        {!accountId && <label>Account email<input autoComplete="email" type="email" maxLength={320} required value={accountEmail} onChange={event => setAccountEmail(event.target.value)} placeholder="Your email address" /></label>}
        <div className="form-grid"><label>Sender address<input type="email" maxLength={320} required value={sender} onChange={event => setSender(event.target.value)} /></label><label>Reply-to address (optional)<input type="email" maxLength={320} value={replyTo} onChange={event => setReplyTo(event.target.value)} /></label></div>
        <div className="form-grid"><label>Sender display name<input maxLength={200} value={displayName} onChange={event => setDisplayName(event.target.value)} /></label><label>Subject<input maxLength={998} value={subject} onChange={event => setSubject(event.target.value)} /></label></div>
        <label>Selected message text<textarea maxLength={100000} rows={7} value={body} onChange={event => setBody(event.target.value)} placeholder="Paste selected text. Remove unrelated private information first." /></label>
        <details><summary>Sender context (optional)</summary><label className="context-label">Trusted domains<input value={domains} onChange={event=>setDomains(event.target.value)} maxLength={1000} placeholder="example.test, supplier.test" /></label><p className="muted">Supply known domains to check for lookalike senders. No domain is inferred from the account address.</p></details><details><summary>Authentication results (optional)</summary><p className="muted">Copy these from the provider’s message details. Leave unknown checks blank.</p><div className="auth-grid">{(['spf', 'dkim', 'dmarc'] as const).map(key => <label key={key}>{key.toUpperCase()}<select value={auth[key]} onChange={event => setAuth(current => ({ ...current, [key]: event.target.value }))}><option value="">Not supplied</option><option value="pass">Pass</option><option value="fail">Fail</option><option value="softfail">Soft fail</option><option value="none">None</option></select></label>)}</div></details>
        <label className="consent"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /><span>I own or am authorised to analyse this selected email. I understand that minimal evidence is saved locally.</span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary" type="submit" disabled={busy || !acknowledged}>{busy ? 'Analysing…' : 'Analyse selected email'}</button>
      </form>
    </section>
    <aside className="analysis-side">
      {result && <section className={`panel result-card ${result.finding_count ? "is-flagged" : ""}`} role="status"><p className="panel-meta">Analysis complete</p><h2>{result.finding_count ? `${result.finding_count} indicators found` : 'No configured indicators matched'}</h2><p>{result.finding_count ? 'Review the observed evidence before deciding whether the message is suspicious.' : 'This result covers the supplied fields and current rules. It does not certify that the email is safe.'}</p><div className="result-counts"><span><strong>{result.imported_count}</strong> imported</span><span><strong>{result.duplicate_count}</strong> duplicates</span></div>{incidentIds.map(id => <button key={id} className="button button-primary" onClick={() => onInspect(id)}>Review incident evidence</button>)}</section>}
      <section className="panel analysis-guide"><h2>What is checked</h2><p className="panel-meta">Evidence first, then your verdict</p><ol><li><strong>Sender identity</strong><p>Reply-to mismatch, recognised brand conflict, and declared lookalike domains.</p></li><li><strong>Message and links</strong><p>Configured urgency phrases, shortened links, and credential-themed hosts.</p></li><li><strong>Authentication</strong><p>Supplied SPF, DKIM, and DMARC failures. Unknown results stay unknown.</p></li><li><strong>Payment redirection</strong><p>Changed payment details combined with a configured payment instruction.</p></li><li><strong>Human review</strong><p>Trace each indicator to its rule, weight, and evidence, then record your decision.</p></li></ol><p className="privacy-caption">No attachment execution, URL fetching, or automatic mailbox changes.</p></section>
    </aside>
  </div>
}
