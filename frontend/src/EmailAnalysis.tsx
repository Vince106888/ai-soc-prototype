import { useState, type FormEvent } from 'react'
import { Icons } from './icons'
import { InlineNotice, Panel } from './ui'
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

export function EmailAnalysis({
  accounts,
  sources,
  onAnalyze,
  onInspect,
}: {
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
  const source = sources.find((item) => item.account_id === accountId && item.status === 'active' && item.source_type === 'controlled' && item.capabilities?.includes('email'))
  const incidentIds = [...new Set(result?.items.flatMap((item) => item.incident_ids) ?? [])]

  const example = (suspicious: boolean) => {
    setSender(suspicious ? 'notice@billing-example.test' : 'team@example.test')
    setReplyTo(suspicious ? 'help@other-example.test' : 'team@example.test')
    setDisplayName(suspicious ? 'Account support' : 'Example team')
    setSubject(suspicious ? 'Verify your account immediately' : 'Meeting agenda for Monday')
    setBody(suspicious
      ? 'Your account is suspended. Confirm your identity at https://secure.example.test/verify. This is a synthetic example.'
      : 'The meeting starts at 10. Please bring the draft agenda. This is a synthetic example.')
    setAuth({ spf: '', dkim: '', dmarc: '' })
    setResult(null)
    setError('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!acknowledged) return
    const claimedDomains = domains.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
    if (claimedDomains.length > 20 || claimedDomains.some((domain) => domain.length > 253 || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain))) {
      setError('Enter up to 20 trusted domain names, without email addresses or URL paths.')
      return
    }
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const completed = await onAnalyze({
        accountId,
        accountEmail,
        sourceId: source?.id ?? '',
        sender,
        replyTo,
        displayName,
        subject,
        body,
        claimedDomains,
        ...auth,
      })
      setResult(completed)
      if (completed.accountId) {
        setAccountId(completed.accountId)
        setAccountEmail('')
      }
      setBody('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Email analysis failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="analysis-layout">
      <Panel className="analysis-form-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Selected message</p>
            <h2>Inspect one message</h2>
          </div>
          <span className="status-pill info"><Icons.lock aria-hidden="true" />Local processing</span>
        </div>
        <p className="muted-copy">Paste only the message you want to assess. Remove unrelated private information first. Links are parsed without being opened.</p>

        <div className="sample-strip">
          <div><strong>Need a safe first run?</strong><span>Load a clearly labelled synthetic example.</span></div>
          <div className="example-actions">
            <button className="button button-secondary button-small" onClick={() => example(true)} type="button">Synthetic suspicious message</button>
            <button className="button button-quiet button-small" onClick={() => example(false)} type="button">Synthetic routine message</button>
          </div>
        </div>

        <form className="analysis-form" onSubmit={(event) => void submit(event)} aria-busy={busy}>
          <fieldset className="form-section">
            <legend>Workspace account</legend>
            <p className="field-help">Evidence is attached to one account in your private workspace.</p>
            {accounts.length ? (
              <label htmlFor="analysis-account">Account
                <select id="analysis-account" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.display_name || account.email || account.id}</option>)}
                  <option value="">Create another account</option>
                </select>
              </label>
            ) : null}
            {!accountId && (
              <label htmlFor="analysis-account-email">Account email
                <input id="analysis-account-email" autoComplete="email" type="email" maxLength={320} required value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} placeholder="you@example.test" />
                <span className="field-help">Use the address the evidence belongs to, not the sender address.</span>
              </label>
            )}
          </fieldset>

          <fieldset className="form-section">
            <legend>Message identity</legend>
            <div className="form-grid">
              <label htmlFor="analysis-sender">Sender address
                <input id="analysis-sender" type="email" maxLength={320} required value={sender} onChange={(event) => setSender(event.target.value)} placeholder="sender@example.test" autoComplete="off" />
              </label>
              <label htmlFor="analysis-reply-to">Reply-to address <span>(optional)</span>
                <input id="analysis-reply-to" type="email" maxLength={320} value={replyTo} onChange={(event) => setReplyTo(event.target.value)} placeholder="reply@example.test" autoComplete="off" />
              </label>
              <label htmlFor="analysis-display-name">Sender display name
                <input id="analysis-display-name" maxLength={200} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Account support" autoComplete="off" />
              </label>
              <label htmlFor="analysis-subject">Subject
                <input id="analysis-subject" maxLength={998} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Message subject" autoComplete="off" />
              </label>
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>Message text</legend>
            <label htmlFor="analysis-body">Selected message text
              <textarea id="analysis-body" maxLength={100000} rows={8} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Paste selected text. Remove unrelated private information first." aria-describedby="analysis-body-help" />
              <span id="analysis-body-help" className="field-help">The body is processed transiently to derive configured phrase matches. Full bodies and attachments are not retained.</span>
            </label>
          </fieldset>

          <details className="form-disclosure">
            <summary>Sender context <span>(optional)</span></summary>
            <label htmlFor="analysis-domains">Trusted domains
              <input id="analysis-domains" value={domains} onChange={(event) => setDomains(event.target.value)} maxLength={1000} placeholder="example.test, supplier.test" />
              <span className="field-help">Supply known domains to check for lookalike senders. No domain is inferred from the account address.</span>
            </label>
          </details>

          <details className="form-disclosure">
            <summary>Authentication results <span>(optional)</span></summary>
            <p className="field-help">Copy these from the provider’s message details. Leave unknown checks blank.</p>
            <div className="auth-grid">
              {(['spf', 'dkim', 'dmarc'] as const).map((key) => (
                <label key={key}>{key.toUpperCase()}
                  <select value={auth[key]} onChange={(event) => setAuth((current) => ({ ...current, [key]: event.target.value }))}>
                    <option value="">Not supplied</option>
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                    <option value="softfail">Soft fail</option>
                    <option value="none">None</option>
                  </select>
                </label>
              ))}
            </div>
          </details>

          <label className="check-field">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
            <span>I own or am authorised to analyse this selected message. I understand that minimised evidence is saved in my workspace.</span>
          </label>
          {error && <InlineNotice tone="danger" title="Analysis could not be completed">{error}</InlineNotice>}
          <div className="form-actions">
            <button className="button button-primary" type="submit" disabled={busy || !acknowledged}>
              {busy ? <><span className="button-spinner" aria-hidden="true" />Analysing…</> : <><Icons.scan />Analyse selected message</>}
            </button>
            <span className="field-help">{busy ? 'Applying deterministic rules and recording minimised evidence.' : 'No message is sent to an external AI service.'}</span>
          </div>
        </form>
      </Panel>

      <aside className="analysis-side">
        {result ? (
          <Panel className="result-card" aria-live="polite">
            <p className="eyebrow">Analysis complete</p>
            <h2>{result.finding_count ? `${result.finding_count} ${result.finding_count === 1 ? 'indicator' : 'indicators'} matched` : 'No configured indicators matched'}</h2>
            <p>{result.finding_count ? 'Review the matched rules and supporting evidence before deciding whether the message is suspicious.' : 'This result covers the supplied fields and current rules. It does not certify that the message is safe.'}</p>
            <div className="result-counts">
              <span><strong>{result.imported_count}</strong> imported</span>
              <span><strong>{result.duplicate_count}</strong> duplicates</span>
            </div>
            {incidentIds.length ? (
              <div className="result-actions">
                {incidentIds.map((id) => <button key={id} className="button button-primary" onClick={() => onInspect(id)}>Review incident evidence<Icons.arrow /></button>)}
              </div>
            ) : <p className="inline-note"><Icons.info aria-hidden="true" />No incident was created for this result. The minimised signal remains available in Evidence.</p>}
          </Panel>
        ) : (
          <Panel className="result-placeholder">
            <span className="state-icon"><Icons.scan aria-hidden="true" /></span>
            <h2>Your evidence summary will appear here</h2>
            <p>You will see matched indicators, duplicate handling, and a direct link to any incident that needs review.</p>
          </Panel>
        )}

        <Panel className="analysis-guide">
          <p className="eyebrow">What is checked</p>
          <h2>Evidence before a verdict</h2>
          <ol>
            <li><strong>Sender identity</strong><p>Reply-to mismatch, recognised brand conflict, and declared lookalike domains.</p></li>
            <li><strong>Message and links</strong><p>Configured urgency phrases, shortened links, and credential-themed hosts.</p></li>
            <li><strong>Authentication</strong><p>Supplied SPF, DKIM and DMARC failures. Unknown results stay unknown.</p></li>
            <li><strong>Payment redirection</strong><p>Changed payment details combined with a configured payment instruction.</p></li>
            <li><strong>Human review</strong><p>Trace each indicator to its rule, weight and evidence, then record your decision.</p></li>
          </ol>
          <p className="privacy-caption"><Icons.lock aria-hidden="true" />No attachment execution, URL fetching or automatic mailbox changes.</p>
        </Panel>
      </aside>
    </div>
  )
}
