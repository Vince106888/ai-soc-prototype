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
  const chain = [
    ['Signal', 'A message or account event you chose to collect'],
    ['Rule', 'A fixed, published check that matched it'],
    ['Priority', 'A deterministic score that orders the queue'],
    ['Explanation', 'Plain wording drawn only from the findings'],
    ['Decision', 'Yours, recorded in the audit trail'],
  ]
  return <main id="main-content" className="welcome">
    <header className="welcome-bar"><span className="brand-mark" aria-hidden="true"><Icons.shield /></span><strong>SentinelSME</strong><span className="badge">{pilot ? 'Invited pilot' : 'Local research demo'}</span></header>
    <div className="welcome-layout">
      <section className="welcome-intro">
        <h1>See why an email was flagged, then decide for yourself.</h1>
        <p className="welcome-lead">SentinelSME checks the email you choose against published rules and shows every step from evidence to recommendation. Nothing is hidden behind a score.</p>
        <ol className="welcome-chain" aria-label="How a finding is built">{chain.map(([name, detail]) => <li key={name}><strong>{name}</strong><span>{detail}</span></li>)}</ol>
        <p className="field-help"><Icons.lock />Message bodies and attachments are not retained. Gmail scans need your separate consent.</p>
      </section>
      <section className="panel welcome-entry" aria-labelledby="welcome-title">
        <h2 id="welcome-title">{pilot ? 'Sign in to your workspace' : 'Try the console'}</h2>
        <p className="muted">{pilot ? 'Use the Google account your pilot operator invited. No workspace ID or deployment key is needed.' : 'Use synthetic or authorised samples. Local workspace selection provides no user authentication.'}</p>
        {pilot ? <>
          {!session.configured && <p className="notice notice-warning setup-message" role="status">Sign-in setup is awaiting the operator. Google credentials, a registered callback and an invitation list are required.</p>}
          <button className="button button-primary button-full" disabled={busy || !session.configured} onClick={() => void begin()} type="button"><Icons.lock />{busy ? 'Opening Google…' : 'Sign in with Google'}</button>
          <p className="field-help">Sign-in uses your verified email address. Gmail access is requested separately, only if you choose to connect it.</p>
          <p className="field-help">Need access? Ask the pilot operator to add your Google email. Public registration is not enabled.</p>
        </> : <>
          <ol className="welcome-steps">
            <li><strong>Open a local workspace</strong><span>A fresh demonstration workspace, no Google account needed.</span></li>
            <li><strong>Analyse an email</strong><span>Paste a synthetic example or connect Gmail later.</span></li>
            <li><strong>Review the evidence</strong><span>Follow each finding to its rule and record your decision.</span></li>
          </ol>
          <button className="button button-primary button-full" onClick={() => localStart()} type="button">Start a local demo<Icons.arrow /></button>
          <details className="disclosure"><summary>Open an existing local workspace</summary><form className="form-stack" onSubmit={event => { event.preventDefault(); if (tenant.trim()) localStart(tenant.trim(), key.trim()) }}>
            <div className="field"><label htmlFor="local-tenant">Workspace ID</label><input id="local-tenant" value={tenant} onChange={event => setTenant(event.target.value)} required maxLength={100} /></div>
            <div className="field"><label htmlFor="local-key">Deployment key <span className="optional">if required</span></label><input id="local-key" type="password" value={key} onChange={event => setKey(event.target.value)} autoComplete="off" /></div>
            <button className="button button-secondary button-full" type="submit" disabled={!tenant.trim()}>Open workspace</button>
          </form></details>
        </>}
        {(error || notice) && <p className="form-error" role="alert">{error || notice}</p>}
      </section>
    </div>
    <footer className="welcome-footer">Defensive research prototype. Findings are evidence-backed; decisions are advisory and yours.</footer>
  </main>
}

export default function AuthGate() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [error, setError] = useState('')
  const [localReady, setLocalReady] = useState(hasLocalWorkspace)
  const generation = useRef(0)
  const load = useCallback((signal?: AbortSignal) => {
    const current = ++generation.current
    return api.session(signal).then(
      result => { if (!signal?.aborted && current === generation.current) { setSession(result); setError('') } },
      reason => { if (!signal?.aborted && current === generation.current) setError(reason instanceof Error ? reason.message : 'Could not check sign-in.') },
    )
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
    window.history.replaceState(null, '', window.location.pathname)
    try { sessionStorage.removeItem('sentinelsme.tenantId'); sessionStorage.removeItem('sentinelsme.apiKey') } catch { /* App session is already invalidated server-side. */ }
  }
  if (error) return <main id="main-content" className="boot-status"><Icons.alert /><h1>We couldn’t check your session</h1><p role="alert">{error}</p><button className="button button-primary" onClick={() => { setError(''); void load() }} type="button">Try again</button></main>
  if (!session) return <main id="main-content" className="boot-status" role="status"><Icons.shield /><p>Checking your workspace…</p></main>
  if (session.mode === 'google' && session.user) return <Dashboard key={session.user.id} session={session} onSignOut={signOut} />
  if (session.mode === 'local' && localReady) return <Dashboard onLocalDisconnect={() => setLocalReady(false)} />
  return <Welcome session={session} onLocalStart={() => setLocalReady(true)} />
}
