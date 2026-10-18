import { useCallback, useEffect, useRef, useState } from 'react'
import Dashboard from './App'
import { api } from './api'
import { Icons } from './icons'
import { ApiError, type AuthSession } from './types'

function hasLocalWorkspace() {
  try { return Boolean(sessionStorage.getItem('sentinelsme.tenantId')) } catch { return false }
}

function Welcome({ session, onLocalStart }: { session: AuthSession; onLocalStart: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tenant, setTenant] = useState('')
  const [key, setKey] = useState('')
  const pilot = session.mode === 'google'
  const [notice] = useState(() => {
    const result = new URLSearchParams(window.location.search).get('signin')
    return result === 'cancelled' ? 'Google sign-in was cancelled. You can try again.' : result === 'failed' ? 'Sign-in could not be completed. Check that the operator has invited this Google account, then try again.' : ''
  })
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('signin')) window.history.replaceState(null, '', window.location.pathname)
  }, [])
  const begin = async () => {
    setBusy(true); setError('')
    try {
      const result = await api.login()
      const destination = new URL(result.authorization_url)
      if (destination.origin !== 'https://accounts.google.com') throw new Error('Google sign-in is unavailable. Ask the pilot operator to check setup.')
      window.location.assign(destination.href)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start sign-in.'); setBusy(false) }
  }
  const localStart = (workspace = `demo-${crypto.randomUUID()}`, apiKey = '') => {
    try {
      sessionStorage.setItem('sentinelsme.tenantId', workspace)
      if (apiKey) sessionStorage.setItem('sentinelsme.apiKey', apiKey)
      else sessionStorage.removeItem('sentinelsme.apiKey')
      onLocalStart()
    } catch { setError('This browser must allow session storage to open a local workspace.') }
  }
  return <main id="main-content" className="onboarding-shell">
    <header className="onboarding-brand"><Icons.shield /><strong>Sentinel<span>SME</span></strong><span className="onboarding-mode">{pilot ? 'Invited pilot' : 'Local research demo'}</span></header>
    <div className="onboarding-layout">
      <section className="onboarding-intro"><p className="eyebrow">Email security, with evidence</p><h1>Your workspace.<br />A clearer view of email risk.</h1><p>Collect a sample, understand the indicators, and decide what needs attention.</p>
        <ol className="onboarding-steps">
          <li><span>1</span><div><strong>{pilot ? 'Sign in with Google' : 'Open a local workspace'}</strong><p>{pilot ? 'An invited account gets its own workspace automatically.' : 'Start a demonstration without Google credentials.'}</p></div></li>
          <li><span>2</span><div><strong>Choose what to analyse</strong><p>Connect Gmail with separate read-only consent, or analyse a selected email.</p></div></li>
          <li><span>3</span><div><strong>Review the evidence</strong><p>See the matched rules and record your review decisions.</p></div></li>
        </ol>
        <p className="onboarding-boundary"><Icons.lock />Message bodies and attachments are not retained. Gmail scans require your separate consent.</p>
      </section>
      <section className="panel onboarding-entry" aria-labelledby="welcome-title"><span className="state-icon"><Icons.lock /></span><h2 id="welcome-title">{pilot ? 'Welcome to SentinelSME' : 'Try the console'}</h2>
        <p>{pilot ? 'Use the Google account invited by your pilot operator. No workspace ID or deployment key is needed.' : 'Use synthetic or authorised samples. Local workspace selection provides no user authentication.'}</p>
        {pilot ? <>
          {!session.configured && <p className="setup-message" role="status">Sign-in setup is awaiting the operator. Google credentials, a registered callback and an invitation list are required.</p>}
          <button className="button button-primary button-full" disabled={busy || !session.configured} onClick={() => void begin()}><Icons.lock />{busy ? 'Opening Google…' : 'Sign in with Google'}</button>
          <p className="field-help">Sign-in uses your verified email address. Gmail access is requested separately, only if you choose to connect it.</p>
          <p className="onboarding-invite">Need access? Ask the pilot operator to add your Google email. Public registration is not enabled.</p>
        </> : <>
          <button className="button button-primary button-full" onClick={() => localStart()}>Start a local demo<Icons.arrow /></button>
          <details className="onboarding-advanced"><summary>Open an existing local workspace</summary><form onSubmit={event => { event.preventDefault(); if (tenant.trim()) localStart(tenant.trim(), key.trim()) }}>
            <label htmlFor="local-tenant">Workspace ID</label><input id="local-tenant" value={tenant} onChange={event => setTenant(event.target.value)} required maxLength={100} />
            <label htmlFor="local-key">Deployment key <span>(if required)</span></label><input id="local-key" type="password" value={key} onChange={event => setKey(event.target.value)} autoComplete="off" />
            <button className="button button-secondary button-full" type="submit" disabled={!tenant.trim()}>Open workspace</button>
          </form></details>
        </>}
        {(error || notice) && <p className="form-error" role="alert">{error || notice}</p>}
      </section>
    </div>
    <footer className="onboarding-footer">Defensive research prototype · evidence-backed findings · advisory decisions</footer>
  </main>
}

export default function AuthGate() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [error, setError] = useState('')
  const [localReady, setLocalReady] = useState(hasLocalWorkspace)
  const generation = useRef(0)
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current
    setError('')
    try { const result = await api.session(signal); if (!signal?.aborted && current === generation.current) setSession(result) }
    catch (reason) { if (!signal?.aborted && current === generation.current) setError(reason instanceof Error ? reason.message : 'Could not check sign-in.') }
  }, [])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])
  useEffect(() => {
    const refresh = () => { void load() }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [load])
  useEffect(() => {
    const expired = () => { generation.current++; setSession(current => current ? { ...current, user: null, csrf_token: '' } : null) }
    window.addEventListener('sentinelsme:session-expired', expired)
    return () => window.removeEventListener('sentinelsme:session-expired', expired)
  }, [])
  useEffect(() => {
    if (!session?.user || !session.expires_at) return
    const remaining = Date.parse(session.expires_at) - Date.now()
    if (!Number.isFinite(remaining)) return
    const timer = window.setTimeout(() => { generation.current++; setSession(current => current ? { ...current, user: null, csrf_token: '' } : null) }, Math.max(0, remaining))
    return () => window.clearTimeout(timer)
  }, [session])
  const signOut = async () => {
    if (!session?.user) return
    try { await api.logout({ apiKey: '', tenantId: session.user.workspace_id, csrfToken: session.csrf_token }) }
    catch (reason) { if (!(reason instanceof ApiError && reason.status === 401)) throw reason }
    generation.current++
    setSession({ ...session, user: null, csrf_token: '' }); setLocalReady(false)
    try { sessionStorage.removeItem('sentinelsme.tenantId'); sessionStorage.removeItem('sentinelsme.apiKey') } catch { /* App session is already invalidated server-side. */ }
  }
  if (error) return <main id="main-content" className="onboarding-status"><Icons.alert /><h1>We couldn’t check your session</h1><p role="alert">{error}</p><button className="button button-primary" onClick={() => void load()}>Try again</button></main>
  if (!session) return <main id="main-content" className="onboarding-status" role="status"><Icons.shield /><p>Checking your workspace…</p></main>
  if (session.mode === 'google' && session.user) return <Dashboard key={session.user.id} session={session} onSignOut={signOut} />
  if (session.mode === 'local' && localReady) return <Dashboard onLocalDisconnect={() => setLocalReady(false)} />
  return <Welcome session={session} onLocalStart={() => setLocalReady(true)} />
}
