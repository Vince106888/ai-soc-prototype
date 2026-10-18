import { useEffect, useState } from 'react'
import { api } from './api'
import type { Credentials, ScanSchedule, Source } from './types'
import { formatDateTime } from './utils'

export function GmailSchedule({ credentials, source }: { credentials: Credentials; source: Source }) {
  const [schedule, setSchedule] = useState<ScanSchedule | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [interval, setInterval] = useState(60)
  const [maximum, setMaximum] = useState(20)
  const [days, setDays] = useState(7)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    void api.schedule(credentials, source.id, controller.signal).then(value => {
      if (controller.signal.aborted) return
      setSchedule(value); setReady(true)
      if (value) { setInterval(value.interval_minutes); setMaximum(value.maximum_messages); setDays(value.recent_days) }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load schedule.') })
    return () => controller.abort()
  }, [credentials, source.id])
  const valid = Number.isInteger(interval) && interval >= 15 && interval <= 1440 && Number.isInteger(maximum) && maximum >= 1 && maximum <= 50 && Number.isInteger(days) && days >= 1 && days <= 30
  const save = async (enabled: boolean) => {
    setBusy(true); setError('')
    try {
      setSchedule(await api.saveSchedule(credentials, source.id, { enabled, acknowledged, interval_minutes: !enabled && schedule ? schedule.interval_minutes : interval, maximum_messages: !enabled && schedule ? schedule.maximum_messages : maximum, recent_days: !enabled && schedule ? schedule.recent_days : days }))
      setAcknowledged(false)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save schedule.') }
    finally { setBusy(false) }
  }
  return <details className="gmail-schedule"><summary>Scheduled samples · {source.name} · {schedule?.enabled ? 'Enabled' : 'Paused'}</summary>
    <p>Runs only while the local scan worker is running. Each run reads a bounded inbox sample. Three consecutive failures pause the schedule; disconnecting or deleting the account stops future runs.</p>
    {schedule?.enabled && <p role="status">Next eligible run: {formatDateTime(schedule.next_run_at)}. Consecutive failures: {schedule.failure_count}.</p>}
    <form onSubmit={event => { event.preventDefault(); void save(true) }}>
      <div className="gmail-scan-controls"><label>Interval (minutes)<input type="number" min={15} max={1440} value={interval} onChange={event => setInterval(Number(event.target.value))} /></label><label>Messages per run<input type="number" min={1} max={50} value={maximum} onChange={event => setMaximum(Number(event.target.value))} /></label><label>Look-back (days)<input type="number" min={1} max={30} value={days} onChange={event => setDays(Number(event.target.value))} /></label></div>
      <label className="check-field"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /><span>I separately authorise recurring read-only inbox samples with these limits and seven-day retention of minimal evidence.</span></label>
      <div className="form-actions"><button className="button button-primary" disabled={!ready || busy || !acknowledged || !valid}>{busy ? 'Saving…' : schedule?.enabled ? 'Update schedule' : 'Enable schedule'}</button><button type="button" className="button" disabled={!schedule?.enabled || busy} onClick={() => void save(false)}>Pause schedule</button></div>
    </form>
    {error && <p role="alert">{error}</p>}
  </details>
}
