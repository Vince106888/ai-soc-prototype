import { useState } from 'react'
import { api } from './api'
import type { Credentials, GmailConfiguration, Source } from './types'
import { GmailSchedule } from './GmailSchedule'

export function GmailConnection({ credentials, configuration, sources, onRefresh }: {
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
  const gmailSources = sources.filter(source => source.source_type === 'gmail')
  const activeGmailSources = gmailSources.filter(source => source.status === 'active')
  const connectionStatus = !configuration?.configured ? 'Setup required' : activeGmailSources.length ? 'Connected · read-only' : gmailSources.length ? 'Reconnect required' : 'Ready for consent'
  const validSample = Number.isInteger(limit) && limit >= 1 && limit <= 50 && Number.isInteger(days) && days >= 1 && days <= 30
  const connect = async () => {
    setBusy('connect'); setMessage('')
    try {
      const result = await api.gmailConsent(credentials, email, acknowledged)
      window.location.assign(result.authorization_url)
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not begin Google consent.'); setBusy('') }
  }
  const scan = async (sourceId: string) => {
    setBusy(sourceId); setMessage('')
    try {
      const result = await api.gmailScan(credentials, sourceId, limit, days, acknowledged)
      setMessage(`Examined ${result.examined_count} messages: ${result.imported_count} new, ${result.duplicate_count} already imported, ${result.finding_count} new findings. This was a bounded inbox sample.`)
      await onRefresh()
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Gmail scan failed.'); await onRefresh() }
    finally { setBusy('') }
  }
  const connectForm = <form className="gmail-connect-form" onSubmit={event => { event.preventDefault(); void connect() }}><label>Gmail address<input type="email" required readOnly={Boolean(credentials.userEmail)} maxLength={320} placeholder="Your Gmail address" value={email} onChange={event => setEmail(event.target.value)} /></label><button type="submit" className="button button-primary" disabled={!configuration?.configured || !acknowledged || Boolean(busy)}>{busy === 'connect' ? 'Opening Google…' : 'Connect Gmail'}</button></form>
  return <section className="panel gmail-panel">
    <div className="panel-heading"><div><p className="eyebrow">Live email · on demand</p><h2>{activeGmailSources.length ? 'Gmail is connected' : gmailSources.length ? 'Reconnect Gmail' : 'Connect your Gmail'}</h2></div><span className={`connection-pill ${configuration?.configured ? 'ready' : ''}`}>{connectionStatus}</span></div>
    <p>Read-only access lets SentinelSME inspect a recent inbox sample you choose to run. Minimal email evidence stays in the local database; message bodies and attachments are not retained.</p>
    <div className="gmail-boundary"><span>Email indicators only</span><span>Scheduling requires opt-in</span><span>Seven-day trial retention</span></div>
    {!configuration?.configured && <div className="setup-message"><strong>{credentials.userEmail ? 'Gmail setup is awaiting the operator' : 'Google OAuth credentials are needed'}</strong><p>{credentials.userEmail ? 'You can analyse a selected email while the pilot operator completes Gmail setup.' : 'Configure your Web OAuth client ID and secret, and a token encryption key. Follow the local Gmail setup guide, then restart the API.'}</p></div>}
    {!configuration?.configured && !credentials.userEmail && <details className="gmail-setup-details"><summary>Local setup instructions</summary><p>In PowerShell at the project folder, run:</p><code>. .\scripts\configure-gmail.ps1 -StartApi</code><p>The script reads the client secret with hidden input and starts the API. In your Google Web OAuth client, register this redirect URI:</p><code>http://127.0.0.1:5173/api/v1/gmail/callback</code><p>Refresh this page after the API restarts, then continue with Google.</p></details>}
    {activeGmailSources.length > 0 ? <><p>{activeGmailSources.length} connected {activeGmailSources.length === 1 ? 'Gmail source' : 'Gmail sources'}. Manage connections in Accounts &amp; sources.</p>{!credentials.userEmail && <details><summary>Connect another Gmail account</summary>{connectForm}</details>}</> : connectForm}
    <label className="check-field"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /><span>I authorise read-only analysis of my Gmail inbox sample and seven-day local retention of minimal evidence. I can disconnect and delete the local data at any time.</span></label>
    {gmailSources.length > 0 && <div className="gmail-scan-controls"><label>Maximum messages<input type="number" min={1} max={50} step={1} value={limit} onChange={event => setLimit(Number(event.target.value))} /></label><label>Recent days<input type="number" min={1} max={30} step={1} value={days} onChange={event => setDays(Number(event.target.value))} /></label>{gmailSources.map(source => <button key={source.id} className="button button-primary" disabled={source.status !== 'active' || !acknowledged || Boolean(busy) || !validSample} onClick={() => void scan(source.id)}>{busy === source.id ? 'Reading inbox sample…' : `Scan ${source.name}`}</button>)}</div>}
    {message && <p className="operation-message" role="status">{message}</p>}
    {activeGmailSources.map(source => <GmailSchedule key={source.id} credentials={credentials} source={source} />)}
  </section>
}
