import { useEffect, useState } from 'react'
import { api } from './api'
import type { Credentials, TrustedSender } from './types'
import { formatDateTime } from './utils'

export function TrustedSenders({ credentials }: { credentials: Credentials }) {
  const [items, setItems] = useState<TrustedSender[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [kind, setKind] = useState<'domain' | 'address'>('domain')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    api.trustedSenders(credentials, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setItems(result); setError('') } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load trusted senders.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [credentials, revision])

  const add = async () => {
    setBusy(true); setError('')
    try {
      await api.addTrustedSender(credentials, { kind, value: value.trim(), note: note.trim() })
      setValue(''); setNote('')
      setRevision(current => current + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add the trusted sender.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (item: TrustedSender) => {
    setBusy(true); setError('')
    try {
      await api.removeTrustedSender(credentials, item.id)
      setRevision(current => current + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove the trusted sender.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="panel trusted-senders" aria-labelledby="trusted-heading">
    <div className="trusted-intro">
      <h2 id="trusted-heading">Trusted senders</h2>
      <p>Suppliers and contacts you know. New email from them skips urgent-wording, link and reply-to checks, and lookalikes of these domains are flagged. Authentication, brand, payment-change and new-sender checks always run, because a trusted supplier’s mailbox can be taken over.</p>
    </div>
    <form className="trusted-form" onSubmit={event => { event.preventDefault(); void add() }}>
      <label>Type<select value={kind} onChange={event => setKind(event.target.value as 'domain' | 'address')}><option value="domain">Whole domain</option><option value="address">Exact address</option></select></label>
      <label>{kind === 'domain' ? 'Domain' : 'Email address'}<input required value={value} maxLength={320} onChange={event => setValue(event.target.value)} placeholder={kind === 'domain' ? 'supplier.co.ke' : 'accounts@supplier.co.ke'} /></label>
      <label><span className="label-text">Note <span>(optional)</span></span><input value={note} maxLength={200} onChange={event => setNote(event.target.value)} placeholder="Main stationery supplier" /></label>
      <button className="button button-primary" disabled={busy || !value.trim()}>Add</button>
    </form>
    {error && <p role="alert" className="form-error">{error}</p>}
    {loading ? <p role="status">Loading trusted senders…</p> : items.length ? <ul className="trusted-list">{items.map(item => <li key={item.id}><span className="badge">{item.kind === 'domain' ? 'Domain' : 'Address'}</span><code>{item.value}</code>{item.note && <span className="muted-copy">{item.note}</span>}<small>Added {formatDateTime(item.created_at)}</small><button type="button" className="button button-secondary" disabled={busy} onClick={() => void remove(item)} aria-label={`Remove ${item.value}`}>Remove</button></li>)}</ul> : <p className="muted-copy">No trusted senders yet. You can add one here or when marking an email incident as a false positive.</p>}
  </section>
}
