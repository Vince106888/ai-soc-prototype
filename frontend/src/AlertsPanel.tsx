import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { Icons } from './icons'
import { InlineNotice, Panel, SectionHeading } from './ui'
import type { AlertItem, AlertSettings, Credentials } from './types'
import { formatDateTime } from './utils'

const levels: Array<{ value: AlertSettings['minimum_severity']; label: string }> = [
  { value: 'medium', label: 'Medium and above' },
  { value: 'high', label: 'High and above (recommended)' },
  { value: 'critical', label: 'Critical only' },
]

export function AlertsPanel({ credentials, onChanged, onOpenIncident }: { credentials: Credentials; onChanged?: () => void; onOpenIncident?: (id: string) => void }) {
  const [settings, setSettings] = useState<AlertSettings | null>(null)
  const [items, setItems] = useState<AlertItem[]>([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [nextSettings, nextItems] = await Promise.all([api.alertSettings(credentials, signal), api.alerts(credentials, false, signal)])
      if (signal?.aborted) return
      setSettings(nextSettings); setItems(nextItems); setError('')
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Could not load alerts.')
    }
  }, [credentials])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const patch = (changes: Partial<AlertSettings>) => { setSaved(false); setSettings(current => current && { ...current, ...changes }) }

  const save = async () => {
    if (!settings) return
    setBusy(true); setError(''); setSaved(false)
    try {
      setSettings(await api.saveAlertSettings(credentials, {
        minimum_severity: settings.minimum_severity,
        webhook_enabled: settings.webhook_enabled,
        webhook_url: settings.webhook_enabled ? settings.webhook_url : null,
      }))
      setSaved(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save alert settings.') }
    finally { setBusy(false) }
  }

  const markRead = async (id?: string) => {
    try { await api.markAlertRead(credentials, id); await load(); onChanged?.() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update alerts.') }
  }

  const unread = items.filter(item => !item.read).length

  return <Panel className="alerts-panel" aria-labelledby="alerts-heading">
    <SectionHeading eyebrow="Notifications" title="Alerts" meta={<span id="alerts-heading" className="sr-only">Alerts</span>} />
    <p>An in-app alert is always raised when a new or escalated incident reaches your chosen level. Alerts name the incident and matched rules only. Email alerts are not offered because email is the evidence SentinelSME analyses. They never include message text, senders or links.</p>
    {error && <InlineNotice tone="danger" title="Alerts">{error}</InlineNotice>}
    {settings && <form onSubmit={event => { event.preventDefault(); void save() }}>
      <label>Alert me for<select value={settings.minimum_severity} onChange={event => patch({ minimum_severity: event.target.value as AlertSettings['minimum_severity'] })}>{levels.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}</select></label>
      <label className="check-field"><input type="checkbox" checked={settings.webhook_enabled} onChange={event => patch({ webhook_enabled: event.target.checked })} /><span>Send to a webhook</span></label>
      {settings.webhook_enabled && <label>Webhook URL (https)<input type="url" placeholder="https://hooks.example.com/…" value={settings.webhook_url ?? ''} onChange={event => patch({ webhook_url: event.target.value })} /><small>Receives a minimal JSON summary. Private and local addresses are refused.</small></label>}
      <div className="form-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save alert settings'}</button>{saved && <span role="status">Alert settings saved.</span>}</div>
    </form>}
    <div className="alert-feed">
      <div className="panel-heading-meta"><h3>Recent alerts{unread ? ` · ${unread} unread` : ''}</h3>{unread > 0 && <button type="button" className="button" onClick={() => void markRead()}>Mark all read</button>}</div>
      {items.length === 0 ? <p>No alerts yet. They appear here when an incident reaches your chosen level.</p> : <ul>
        {items.map(item => <li key={item.id} className={item.read ? 'read' : 'unread'}>
          <Icons.alert aria-hidden="true" />
          <div><strong>{item.title}</strong> <span className={`badge severity-${item.severity}`}>{item.severity}</span><small>{formatDateTime(item.created_at)} · {item.rule_codes.join(', ') || 'No rules'}{item.webhook_status !== 'none' ? ` · webhook ${item.webhook_status}` : ''}</small></div>
          {onOpenIncident && <button type="button" className="button" onClick={() => { void markRead(item.id); onOpenIncident(item.incident_id) }}>Open incident</button>}
          {!item.read && <button type="button" className="button" aria-label={`Mark ${item.title} read`} onClick={() => void markRead(item.id)}>Mark read</button>}
        </li>)}
      </ul>}
    </div>
  </Panel>
}
