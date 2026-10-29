import { useState } from 'react'
import { api } from './api'
import type { Account, Credentials, PostureAnswers, PostureResult } from './types'

type App = { name: string; full_mailbox_access: boolean; from_known_developer: boolean }

function Choice<T extends string>({ name, legend, value, options, onChange }: { name: string; legend: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void }) {
  return <fieldset><legend>{legend}</legend>{options.map(([option, label]) => <label key={option}><input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />{label}</label>)}</fieldset>
}

export function PostureCheck({ credentials, accounts, onComplete }: { credentials: Credentials; accounts: Account[]; onComplete?: () => void }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [mfa, setMfa] = useState<PostureAnswers['mfa']>('unsure')
  const [forwarding, setForwarding] = useState<PostureAnswers['forwarding']>('unsure')
  const [forwardingDomain, setForwardingDomain] = useState('')
  const [apps, setApps] = useState<App[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PostureResult | null>(null)
  const selected = accountId || accounts[0]?.id || ''

  const submit = async () => {
    setBusy(true); setError(''); setResult(null)
    try {
      const response = await api.postureCheck(credentials, selected, { mfa, forwarding, forwarding_domain: forwardingDomain.trim(), apps: apps.filter(app => app.name.trim()).map(app => ({ ...app, name: app.name.trim() })) })
      setResult(response)
      onComplete?.()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not record the posture check.')
    } finally {
      setBusy(false)
    }
  }

  if (!accounts.length) return <section className="panel posture-check"><h2>Account security self-check</h2><p>Add a monitored account first, then answer a few questions about its settings.</p></section>

  const findings = result?.ingestion.finding_count ?? 0
  return <section className="panel posture-check" aria-labelledby="posture-heading">
    <div className="posture-intro"><h2 id="posture-heading">Account security self-check</h2><p>Personal Gmail access cannot read sign-in protection, forwarding or app permissions. Answer from your account’s security settings and LindaBiz checks the answers with the same rules. Results are labelled self-reported. Choose “Not sure” rather than guessing.</p></div>
    <form onSubmit={event => { event.preventDefault(); void submit() }} className="posture-form">
      <label>Account<select value={selected} onChange={event => setAccountId(event.target.value)}>{accounts.map(account => <option key={account.id} value={account.id}>{account.display_name || account.email || account.id}</option>)}</select></label>
      <Choice name="mfa" legend="Is 2-Step Verification (a second sign-in step) turned on?" value={mfa} onChange={setMfa} options={[['on', 'Yes'], ['off', 'No'], ['unsure', 'Not sure']]} />
      <Choice name="forwarding" legend="Is email automatically forwarded to another address?" value={forwarding} onChange={setForwarding} options={[['none', 'No forwarding'], ['approved', 'Yes, to an address I set up and approve'], ['unapproved', 'Yes, and I don’t recognise or approve it'], ['unsure', 'Not sure']]} />
      {(forwarding === 'approved' || forwarding === 'unapproved') && <label><span className="label-text">Forwarding domain <span>(optional, for example example.com)</span></span><input value={forwardingDomain} maxLength={253} onChange={event => setForwardingDomain(event.target.value)} /></label>}
      <fieldset><legend>Third-party apps with access to the account</legend>
        {apps.map((app, index) => <div className="posture-app" key={index}>
          <label className="sr-only" htmlFor={`posture-app-${index}`}>App name</label>
          <input id={`posture-app-${index}`} value={app.name} maxLength={200} placeholder="App name" onChange={event => setApps(current => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
          <label><input type="checkbox" checked={app.full_mailbox_access} onChange={event => setApps(current => current.map((item, i) => i === index ? { ...item, full_mailbox_access: event.target.checked } : item))} />Can read or manage all email</label>
          <label><input type="checkbox" checked={app.from_known_developer} onChange={event => setApps(current => current.map((item, i) => i === index ? { ...item, from_known_developer: event.target.checked } : item))} />I know and trust the developer</label>
        </div>)}
        {apps.length < 10 && <button type="button" className="button button-secondary" onClick={() => setApps(current => [...current, { name: '', full_mailbox_access: false, from_known_developer: true }])}>Add an app</button>}
      </fieldset>
      <button className="button button-primary" disabled={busy || !selected}>{busy ? 'Checking…' : 'Run self-check'}</button>
    </form>
    {error && <p role="alert" className="form-error">{error}</p>}
    {result && <p className="posture-result" role="status">{findings ? `${findings} setting${findings === 1 ? '' : 's'} need attention. Open Incidents to see why and what to change.` : 'No risky settings were reported.'}{result.skipped.length ? ` Skipped (not sure): ${result.skipped.join(', ')}.` : ''}</p>}
  </section>
}
