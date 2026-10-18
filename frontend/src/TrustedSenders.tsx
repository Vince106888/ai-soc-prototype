import { useState } from 'react'
import { api } from './api'
import type { Credentials } from './types'
import { formatDateTime } from './utils'
import { useRequest } from './ui/hooks'

export function TrustedSenders({ credentials }: { credentials: Credentials }) {
  const [kind, setKind] = useState<'domain' | 'address'>('domain')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [revision, setRevision] = useState(0)
  const request = useRequest(JSON.stringify([credentials, revision]), signal => api.trustedSenders(credentials, signal), 'Could not load trusted senders.')
  const items = request.data ?? request.previous ?? []
  const error = actionError || request.error

  const run = async (action: () => Promise<unknown>, fallback: string, after?: () => void) => {
    setBusy(true); setActionError('')
    try { await action(); after?.(); setRevision(current => current + 1) }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : fallback) }
    finally { setBusy(false) }
  }

  return <section className="panel trusted-senders" aria-labelledby="trusted-heading">
    <div className="panel-heading"><div><h2 id="trusted-heading">Trusted senders</h2><p className="panel-meta">Suppliers and contacts you know</p></div></div>
    <p className="muted">New email from a trusted sender skips urgent-wording, link and reply-to checks, and lookalikes of trusted domains are flagged. Authentication, brand, payment-change and new-sender checks always run, because a trusted supplier’s mailbox can be taken over.</p>
    <form className="inline-form" onSubmit={event => { event.preventDefault(); void run(() => api.addTrustedSender(credentials, { kind, value: value.trim(), note: note.trim() }), 'Could not add the trusted sender.', () => { setValue(''); setNote('') }) }}>
      <div className="field"><label htmlFor="trusted-kind">Type</label><select id="trusted-kind" value={kind} onChange={event => setKind(event.target.value as 'domain' | 'address')}><option value="domain">Whole domain</option><option value="address">Exact address</option></select></div>
      <div className="field field-grow"><label htmlFor="trusted-value">{kind === 'domain' ? 'Domain' : 'Email address'}</label><input id="trusted-value" required value={value} maxLength={320} onChange={event => setValue(event.target.value)} placeholder={kind === 'domain' ? 'supplier.co.ke' : 'accounts@supplier.co.ke'} /></div>
      <div className="field field-grow"><label htmlFor="trusted-note">Note <span className="optional">optional</span></label><input id="trusted-note" value={note} maxLength={200} onChange={event => setNote(event.target.value)} placeholder="Main stationery supplier" /></div>
      <button className="button button-primary" disabled={busy || !value.trim()} type="submit">Add</button>
    </form>
    {error && <p role="alert" className="form-error">{error}</p>}
    {request.loading && !items.length ? <p role="status" className="muted">Loading trusted senders…</p> : items.length ? <ul className="trusted-list">{items.map(item => <li key={item.id}>
      <span className="badge">{item.kind === 'domain' ? 'Domain' : 'Address'}</span>
      <div><code>{item.value}</code>{item.note && <span className="muted">{item.note}</span>}<small>Added {formatDateTime(item.created_at)}</small></div>
      <button type="button" className="button button-ghost button-small" disabled={busy} onClick={() => void run(() => api.removeTrustedSender(credentials, item.id), 'Could not remove the trusted sender.')} aria-label={`Remove ${item.value}`}>Remove</button>
    </li>)}</ul> : <p className="muted">No trusted senders yet. Add one here, or when you mark an email incident as a false positive.</p>}
  </section>
}
