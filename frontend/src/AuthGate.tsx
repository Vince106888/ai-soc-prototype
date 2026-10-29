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
    return result === 'cancelled' ? 'Google sign-in was cancelled. You can try again.' : result === 'failed' ? 'Sign-in could not be completed. Please try again or contact the service operator.' : ''
  })
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('signin')) window.history.replaceState(null, '', window.location.pathname)
  }, [])
  const begin = async () => {
    setBusy(true); setError('')
    try {
      const result = await api.login()
      const destination = new URL(result.authorization_url)
      if (destination.origin !== 'https://accounts.google.com') throw new Error('Google sign-in is unavailable. Ask the service operator to check setup.')
      window.location.assign(destination.href)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start sign-in.'); setBusy(false) }
  }
  const localStart = (workspace = `workspace-${crypto.randomUUID()}`, apiKey = '') => {
    try {
      sessionStorage.setItem('sentinelsme.tenantId', workspace)
      if (apiKey) sessionStorage.setItem('sentinelsme.apiKey', apiKey)
      else sessionStorage.removeItem('sentinelsme.apiKey')
      onLocalStart()
    } catch { setError('This browser must allow session storage to open a local workspace.') }
  }
  return <main id="main-content" className="onboarding-shell">
    <header className="onboarding-brand"><Icons.shield /><strong>Sentinel<span>SME</span></strong><span className="onboarding-mode">{pilot ? (session.invitation_only ? 'Private access' : 'Private workspaces') : 'Local workspace'}</span></header>
    <div className="onboarding-layout">
      <section className="onboarding-intro"><p className="eyebrow">Email security, with evidence</p><h1>Your workspace.<br />A clearer view of email risk.</h1><p>Collect a sample, understand the indicators, and decide what needs attention.</p>
        <ol className="onboarding-steps">
          <li><span>1</span><div><strong>{pilot ? 'Sign in with Google' : 'Open a local workspace'}</strong><p>{pilot ? 'Your Google account gets its own private workspace automatically.' : 'Open a workspace without Google credentials.'}</p></div></li>
          <li><span>2</span><div><strong>Choose what to analyse</strong><p>Connect Gmail with separate read-only consent, or analyse a selected email.</p></div></li>
          <li><span>3</span><div><strong>Review the evidence</strong><p>See the matched rules and record your review decisions.</p></div></li>
        </ol>
        <p className="onboarding-boundary"><Icons.lock />Message bodies and attachments are not retained. Gmail scans require your separate consent.</p>
      </section>
      <section className="panel onboarding-entry" aria-labelledby="welcome-title"><span className="state-icon"><Icons.lock /></span><h2 id="welcome-title">{pilot ? 'Welcome to SentinelSME' : 'Try the console'}</h2>
        <p>{pilot ? 'Sign in with Google to open your private workspace. Your first sign-in creates your account.' : 'Use synthetic or authorised samples. Local workspace selection provides no user authentication.'}</p>
        {pilot ? <>
          {!session.configured && <p className="setup-message" role="status">Sign-in setup is awaiting the operator. The service operator needs to finish configuring Google sign-in.</p>}
          <button className="button button-primary button-full" disabled={busy || !session.configured} onClick={() => void begin()}><Icons.lock />{busy ? 'Opening Google…' : 'Sign in with Google'}</button>
          <p className="field-help">Sign-in uses your verified email address. Gmail access is requested separately, only if you choose to connect it.</p>
          {session.invitation_only && <p className="onboarding-invite">Access is limited to accounts invited by the service operator.</p>}
        </> : <>
          <button className="button button-primary button-full" onClick={() => localStart()}>Open local workspace<Icons.arrow /></button>
          <details className="onboarding-advanced"><summary>Open an existing local workspace</summary><form onSubmit={event => { event.preventDefault(); if (tenant.trim()) localStart(tenant.trim(), key.trim()) }}>
            <label htmlFor="local-tenant">Workspace ID</label><input id="local-tenant" value={tenant} onChange={event => setTenant(event.target.value)} required maxLength={100} />
            <label htmlFor="local-key">Deployment key <span>(if required)</span></label><input id="local-key" type="password" value={key} onChange={event => setKey(event.target.value)} autoComplete="off" />
            <button className="button button-secondary button-full" type="submit" disabled={!tenant.trim()}>Open workspace</button>
          </form></details>
        </>}
        {(error || notice) && <p className="form-error" role="alert">{error || notice}</p>}
      </section>
    </div>
    <footer className="onboarding-footer">Evidence-backed email security · private workspaces · human decisions · <a href="/privacy">Privacy</a> · <a href="/terms">Terms of use</a></footer>
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
  if (window.location.pathname === '/privacy' || window.location.pathname === '/terms') {
    const privacy = window.location.pathname === '/privacy'
    return <main id="main-content" className="onboarding-shell"><a href="/">← Back to SentinelSME</a><article className="panel onboarding-entry"><h1>{privacy ? 'Privacy and your data' : 'Using SentinelSME'}</h1>{privacy ? <>
      <h2>Your private workspace</h2><p>Google sign-in supplies your verified email address and account identifier. Your workspace is assigned on the server and is accessible through your signed-in account. Service operators with infrastructure access can administer stored data.</p>
      <h2>What is retained</h2><p>We store minimised email and account indicators, rule findings, incidents, review decisions, and audit records. Message bodies and attachments are not retained. Submitted links are analysed as text and are never opened by the service.</p>
      <h2>Optional services</h2><p>Gmail access needs separate read-only consent and is available only when configured by the operator. Stored provider credentials are encrypted. Optional AI receives redacted structured findings and cannot change findings or scores.</p>
      <h2>Retention and deletion</h2><p>Production evidence is retained for {session.evidence_retention_days ?? 30} days from case creation; expired cases are deleted as a whole. Connections remain until disconnected or deleted. You can delete your account and workspace in Your account. Private backups may retain older data until the operator expires them; deletion receipts must be reapplied before a restored database serves users. Removing this app account does not itself revoke permissions in Google settings.</p>
    </> : <>
      <h2>Authorised use</h2><p>Analyse only messages and account data you own or have permission to inspect. Do not submit passwords, secret keys, attachments, or unrelated sensitive information.</p>
      <h2>Understand the assessment</h2><p>Findings are deterministic indicators requiring human review. Scores set review priority; they are not probabilities of an attack. A result with no matched indicators does not establish that a message is safe. AI explanations may be unavailable and do not create evidence.</p>
      <h2>You control decisions</h2><p>SentinelSME does not block mail, change account settings, revoke access, or perform remediation. Verify recommendations through your provider and organisation's procedures. Coverage is limited to the information supplied or explicitly collected with your consent.</p>
    </>}<h2>Contact</h2>{session.operator_contact ? <p>Contact the service operator at <a href={`mailto:${session.operator_contact}`}>{session.operator_contact}</a> for support or data requests.</p> : <p>The deployment operator provides support and handles data requests.</p>}</article></main>
  }
  if (session.mode === 'google' && session.user) return <Dashboard key={session.user.id} session={session} onSignOut={signOut} />
  if (session.mode === 'local' && localReady) return <Dashboard onLocalDisconnect={() => setLocalReady(false)} />
  return <Welcome session={session} onLocalStart={() => setLocalReady(true)} />
}
