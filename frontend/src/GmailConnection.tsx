import { useState } from 'react'
import { api } from './api'
import { GmailSchedule } from './GmailSchedule'
import { Icons } from './icons'
import { GmailFlowArt } from './illustrations'
import { InlineNotice, Panel, SectionHeading } from './ui'
import type { Credentials, GmailConfiguration, Source } from './types'
import { formatDateTime } from './utils'

export function GmailConnection({
  credentials,
  configuration,
  sources,
  onRefresh,
}: {
  credentials: Credentials
  configuration: GmailConfiguration | undefined
  sources: Source[]
  onRefresh: () => Promise<void>
}) {
  const [email, setEmail] = useState(credentials.userEmail ?? '')
  const [acknowledged, setAcknowledged] = useState(false)
  const [limit, setLimit] = useState(20)
  const [days, setDays] = useState(7)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<'info' | 'success' | 'danger'>('info')
  const callbackUrl = `${window.location.origin}/api/v1/gmail/callback`
  const gmailSources = sources.filter((source) => source.source_type === 'gmail')
  const activeGmailSources = gmailSources.filter((source) => source.status === 'active')
  const connectionStatus = !configuration?.configured ? 'Setup required' : activeGmailSources.length ? 'Connected · read-only' : gmailSources.length ? 'Reconnect required' : 'Ready for consent'
  const validSample = Number.isInteger(limit) && limit >= 1 && limit <= 50 && Number.isInteger(days) && days >= 1 && days <= 30
  const lastCollection = activeGmailSources
    .map((source) => source.last_scan_at)
    .filter(Boolean)
    .sort()
    .at(-1)

  const connect = async () => {
    setBusy('connect')
    setMessage('')
    try {
      const result = await api.gmailConsent(credentials, email, acknowledged)
      window.location.assign(result.authorization_url)
    } catch (reason) {
      setMessageTone('danger')
      setMessage(reason instanceof Error ? reason.message : 'Could not begin Google consent.')
      setBusy('')
    }
  }

  const scan = async (sourceId: string) => {
    setBusy(sourceId)
    setMessage('')
    try {
      const result = await api.gmailScan(credentials, sourceId, limit, days, acknowledged)
      setMessageTone('success')
      setMessage(`Examined ${result.examined_count} messages: ${result.imported_count} new, ${result.duplicate_count} already imported, ${result.finding_count} new findings. This was a bounded inbox sample.`)
      await onRefresh()
    } catch (reason) {
      setMessageTone('danger')
      setMessage(reason instanceof Error ? reason.message : 'Gmail scan failed. Check the connection and try again with a smaller sample.')
      await onRefresh()
    } finally {
      setBusy('')
    }
  }

  const connectForm = (
    <form className="gmail-connect-form" onSubmit={(event) => {
      event.preventDefault()
      void connect()
    }}>
      <label htmlFor="gmail-email">Gmail address
        <input id="gmail-email" type="email" required readOnly={Boolean(credentials.userEmail)} maxLength={320} placeholder="you@example.test" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
      </label>
      <button type="submit" className="button button-primary" disabled={!configuration?.configured || !acknowledged || Boolean(busy)}>
        <Icons.key aria-hidden="true" />{busy === 'connect' ? 'Opening Google…' : activeGmailSources.length ? 'Connect another Gmail account' : 'Continue with Google'}
      </button>
    </form>
  )

  return (
    <div className="gmail-workspace">
      <Panel className="gmail-panel">
        <SectionHeading
          eyebrow="Live email · on demand"
          title={activeGmailSources.length ? 'Gmail is connected' : gmailSources.length ? 'Reconnect Gmail' : 'Connect Gmail when you are ready'}
          meta={<span className={`connection-pill ${configuration?.configured ? 'ready' : ''}`}>{connectionStatus}</span>}
        />
        <p className="gmail-lede">Read-only access lets LindaBiz inspect a recent inbox sample you explicitly request. Minimal email evidence stays in your workspace; message bodies and attachments are not retained.</p>

        <div className="gmail-permission-grid">
          <div><Icons.check aria-hidden="true" /><strong>What it can read</strong><span>A bounded inbox sample you request</span></div>
          <div><Icons.close aria-hidden="true" /><strong>What it cannot do</strong><span>Send, delete, quarantine or modify mail</span></div>
          <div><Icons.lock aria-hidden="true" /><strong>What is retained</strong><span>Minimised evidence, not full bodies or attachments</span></div>
        </div>

        {!configuration?.configured && (
          <InlineNotice tone="warning" title="Gmail is not configured for this deployment">
            Selected-message analysis remains fully available. The service operator must configure a Google Web OAuth client and token encryption before Gmail consent can start.
          </InlineNotice>
        )}

        {!configuration?.configured && !credentials.userEmail && (
          <details className="gmail-setup-details">
            <summary>Operator setup details</summary>
            <p>In PowerShell at the project folder, run the local setup helper. Do not paste a client secret into the browser or source code.</p>
            <code>. .\scripts\configure-gmail.ps1 -StartApi</code>
            <p>Register this redirect URI in the Google Web OAuth client:</p>
            <code>{callbackUrl}</code>
            <p>Restart the API after configuration, then refresh this page.</p>
          </details>
        )}

        <div className="gmail-connection-state">
          <div>
            <span className="eyebrow">Connection state</span>
            <strong>{connectionStatus}</strong>
            <p>{lastCollection ? `Last successful collection ${formatDateTime(lastCollection)}.` : 'No successful collection has been recorded.'}</p>
          </div>
          {activeGmailSources.length > 0 && <span className="status-pill success"><Icons.check aria-hidden="true" />Read-only</span>}
        </div>

        {activeGmailSources.length > 0 ? (
          <>
            <p className="muted-copy">{activeGmailSources.length} connected {activeGmailSources.length === 1 ? 'Gmail source' : 'Gmail sources'}. Manage disconnection in Connections.</p>
            {!credentials.userEmail && <details><summary>Connect another Gmail account</summary>{connectForm}</details>}
          </>
        ) : connectForm}

        <label className="check-field">
          <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} aria-describedby="gmail-consent-help" />
          <span id="gmail-consent-help">I authorise read-only analysis of my Gmail inbox sample and {configuration?.trial === false ? `${configuration.evidence_retention_days ?? 30}-day retention` : 'seven-day local retention'} of minimal evidence. I can disconnect and delete the retained data at any time.</span>
        </label>

        {gmailSources.length > 0 && (
          <div className="gmail-scan-panel">
            <div>
              <span className="eyebrow">Bounded sample</span>
              <h3>Choose a small, explicit collection</h3>
              <p>Limits apply to each request. A larger inbox can contain unexamined messages.</p>
            </div>
            <div className="gmail-scan-controls">
              <label htmlFor="gmail-limit">Maximum messages
                <input id="gmail-limit" type="number" min={1} max={50} step={1} value={limit} onChange={(event) => setLimit(Number(event.target.value))} inputMode="numeric" />
              </label>
              <label htmlFor="gmail-days">Recent days
                <input id="gmail-days" type="number" min={1} max={30} step={1} value={days} onChange={(event) => setDays(Number(event.target.value))} inputMode="numeric" />
              </label>
              {gmailSources.map((source) => (
                <button key={source.id} className="button button-primary" disabled={source.status !== 'active' || !acknowledged || Boolean(busy) || !validSample} onClick={() => void scan(source.id)} type="button">
                  {busy === source.id ? <><span className="button-spinner" aria-hidden="true" />Reading inbox sample…</> : <><Icons.scan aria-hidden="true" />Scan {source.name}</>}
                </button>
              ))}
            </div>
          </div>
        )}

        {message && <InlineNotice tone={messageTone} title={messageTone === 'danger' ? 'Gmail operation failed' : messageTone === 'success' ? 'Gmail sample complete' : undefined}>{message}</InlineNotice>}
        {activeGmailSources.map((source) => <GmailSchedule key={source.id} credentials={credentials} source={source} />)}
      </Panel>

      <aside className="gmail-side">
        <Panel className="gmail-visual-panel">
          <GmailFlowArt />
          <h2>Consent before collection</h2>
          <p>Signing in with Google does not grant mailbox access. Gmail permission is requested separately and remains read-only.</p>
          <ul className="boundary-list">
            <li><Icons.check aria-hidden="true" />You choose when a sample runs.</li>
            <li><Icons.check aria-hidden="true" />Spam, trash, sent mail and attachments are excluded.</li>
            <li><Icons.check aria-hidden="true" />Message text is reduced to matched phrases and link hostnames.</li>
            <li><Icons.check aria-hidden="true" />No continuous monitoring or automatic remediation.</li>
          </ul>
        </Panel>
        <Panel className="gmail-help-panel">
          <SectionHeading eyebrow="If something fails" title="Recovery guidance" />
          <details>
            <summary>Google consent did not finish</summary>
            <p>Return to this page and start again in the same browser. If the deployment reports an expired or cancelled attempt, no mailbox data was collected.</p>
          </details>
          <details>
            <summary>The connection needs to be restored</summary>
            <p>Open Connections, disconnect the stale source, then return here and complete Google consent again. Disconnecting also attempts provider revocation.</p>
          </details>
          <details>
            <summary>The sample failed</summary>
            <p>Try fewer messages and fewer days. The service rejects oversized or incomplete samples rather than importing a partial batch.</p>
          </details>
          <p className="privacy-caption">Never share an authorisation code, token or client secret in a support request.</p>
        </Panel>
      </aside>
    </div>
  )
}
