import { useCallback, useEffect, useRef, useState } from 'react'
import Dashboard from './App'
import { api } from './api'
import { Icons } from './icons'
import { Brand, InlineNotice } from './ui'
import { Welcome } from './Welcome'
import { ApiError, type AuthSession } from './types'

function hasLocalWorkspace() {
  try {
    return Boolean(sessionStorage.getItem('lindabiz.tenantId'))
  } catch {
    return false
  }
}

function LegalPage({ session, privacy }: { session: AuthSession; privacy: boolean }) {
  useEffect(() => {
    document.title = `${privacy ? 'Privacy' : 'Terms'} · LindaBiz`
  }, [privacy])

  return (
    <div className="legal-shell">
      <a className="skip-link" href="#legal-main">Skip to main content</a>
      <header className="legal-header">
        <a href="/" className="welcome-home" aria-label="LindaBiz home"><Brand subtitle="Evidence-led email security" /></a>
        <nav aria-label="Legal pages">
          <a href="/">Back to product</a>
          <a href="/privacy" aria-current={privacy ? 'page' : undefined}>Privacy</a>
          <a href="/terms" aria-current={!privacy ? 'page' : undefined}>Terms</a>
        </nav>
      </header>
      <main id="legal-main" className="legal-main">
        <header className="legal-intro">
          <p className="eyebrow">Product boundary</p>
          <h1>{privacy ? 'Privacy and your data' : 'Using LindaBiz'}</h1>
          <p>
            {privacy
              ? 'What the workspace stores, why it stores it, and how to delete it.'
              : 'How to use the product responsibly and interpret an evidence-backed assessment.'}
          </p>
        </header>
        <article className="legal-document">
          {privacy ? (
            <>
              <section>
                <h2>Your private workspace</h2>
                <p>Google sign-in supplies your verified email address and account identifier. The server assigns a private workspace to your signed-in identity. Service operators with infrastructure access can administer stored data.</p>
              </section>
              <section>
                <h2>What is retained</h2>
                <p>We store minimised email and account indicators, rule findings, incidents, review decisions, recommendations and audit records. Message bodies and attachments are not retained. Submitted links are analysed as text and are never opened by the service.</p>
              </section>
              <section>
                <h2>Optional services</h2>
                <p>Gmail access needs separate read-only consent and is available only when configured by the operator. Stored provider credentials are encrypted. Optional AI receives redacted structured findings and cannot create findings or change scores.</p>
              </section>
              <section>
                <h2>Retention and deletion</h2>
                <p>Production evidence is retained for {session.evidence_retention_days ?? 30} days from case creation; expired cases are deleted as a whole. Connections remain until disconnected or deleted. You can delete your account and workspace in Your account. Private backups may retain older data until the operator expires them; deletion receipts must be reapplied before a restored database serves users. Removing this app account does not itself revoke permissions in Google settings.</p>
              </section>
            </>
          ) : (
            <>
              <section>
                <h2>Authorised use</h2>
                <p>Analyse only messages and account data you own or have permission to inspect. Do not submit passwords, secret keys, attachments, or unrelated sensitive information.</p>
              </section>
              <section>
                <h2>Understand the assessment</h2>
                <p>Findings are deterministic indicators requiring human review. Scores set review priority; they are not probabilities of an attack. A result with no matched indicators does not establish that a message is safe. AI explanations may be unavailable and do not create evidence.</p>
              </section>
              <section>
                <h2>You control decisions</h2>
                <p>LindaBiz does not block mail, change account settings, revoke access, or perform remediation. Verify recommendations through your provider and organisation’s procedures. Coverage is limited to the information supplied or explicitly collected with your consent.</p>
              </section>
            </>
          )}
          <section>
            <h2>Contact</h2>
            {session.operator_contact ? (
              <p>Contact the service operator at <a href={`mailto:${session.operator_contact}`}>{session.operator_contact}</a> for support or data requests.</p>
            ) : (
              <p>The deployment operator provides support and handles data requests.</p>
            )}
          </section>
        </article>
      </main>
      <footer className="legal-footer"><Brand /><span>Private evidence · human review · deterministic detection</span></footer>
    </div>
  )
}

export default function AuthGate() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [error, setError] = useState('')
  const [localReady, setLocalReady] = useState(hasLocalWorkspace)
  const generation = useRef(0)
  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++generation.current
    setError('')
    try {
      const result = await api.session(signal)
      if (!signal?.aborted && current === generation.current) setSession(result)
    } catch (reason) {
      if (!signal?.aborted && current === generation.current) {
        setError(reason instanceof Error ? reason.message : 'Could not check sign-in.')
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    const refresh = () => void load()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [load])

  useEffect(() => {
    const expired = () => {
      generation.current++
      setSession((current) => current ? { ...current, user: null, csrf_token: '' } : null)
    }
    window.addEventListener('lindabiz:session-expired', expired)
    return () => window.removeEventListener('lindabiz:session-expired', expired)
  }, [])

  useEffect(() => {
    if (!session?.user || !session.expires_at) return
    const remaining = Date.parse(session.expires_at) - Date.now()
    if (!Number.isFinite(remaining)) return
    const timer = window.setTimeout(() => {
      generation.current++
      setSession((current) => current ? { ...current, user: null, csrf_token: '' } : null)
    }, Math.max(0, remaining))
    return () => window.clearTimeout(timer)
  }, [session])

  const signOut = async () => {
    if (!session?.user) return
    try {
      await api.logout({ apiKey: '', tenantId: session.user.workspace_id, csrfToken: session.csrf_token })
    } catch (reason) {
      if (!(reason instanceof ApiError && reason.status === 401)) throw reason
    }
    generation.current++
    setSession({ ...session, user: null, csrf_token: '' })
    setLocalReady(false)
    try {
      sessionStorage.removeItem('lindabiz.tenantId')
      sessionStorage.removeItem('lindabiz.apiKey')
    } catch {
      // The server session is already invalidated.
    }
  }

  if (error) {
    return (
      <main id="main-content" className="app-status-page">
        <span className="state-icon error-icon" aria-hidden="true"><Icons.alert /></span>
        <h1>We could not check your session</h1>
        <InlineNotice tone="danger" title="Session check failed">{error}</InlineNotice>
        <button className="button button-primary" onClick={() => void load()}>Try again</button>
      </main>
    )
  }
  if (!session) {
    return (
      <main id="main-content" className="app-status-page" role="status">
        <span className="loading-mark" aria-hidden="true"><Icons.shield /></span>
        <p>Checking your workspace…</p>
      </main>
    )
  }
  if (window.location.pathname === '/privacy' || window.location.pathname === '/terms') {
    return <LegalPage session={session} privacy={window.location.pathname === '/privacy'} />
  }
  if (session.mode === 'google' && session.user) return <Dashboard key={session.user.id} session={session} onSignOut={signOut} />
  if (session.mode === 'local' && localReady) return <Dashboard onLocalDisconnect={() => setLocalReady(false)} />
  return <Welcome session={session} onLocalStart={() => setLocalReady(true)} />
}
