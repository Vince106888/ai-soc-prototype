import { useEffect, useState } from 'react'
import { api } from './api'
import { Icons } from './icons'
import { PrivacyBoundaryArt, WelcomeStory } from './illustrations'
import { Brand, InlineNotice } from './ui'
import type { AuthSession } from './types'

type Notice = { tone: 'warning' | 'danger'; title: string; message: string }

function signInNotice(search: string): Notice | null {
  const query = new URLSearchParams(search)
  const result = query.get('signin')
  if (!result) return null
  if (result === 'cancelled') {
    return {
      tone: 'warning',
      title: 'Google sign-in was cancelled',
      message: 'Nothing was changed. You can try again, or ask the service operator for help if the window keeps closing.',
    }
  }
  const reason = query.get('reason') ?? ''
  const messages: Record<string, Notice> = {
    clock: {
      tone: 'danger',
      title: 'The server clock is out of step with Google',
      message: 'Ask the service operator to synchronise the server time, then try signing in again.',
    },
    expired: {
      tone: 'danger',
      title: 'That sign-in attempt expired',
      message: 'Open this page directly and complete Google sign-in in the same browser. Do not continue from an embedded preview.',
    },
    identity: {
      tone: 'danger',
      title: 'Google’s identity response could not be verified',
      message: 'Try once more. If it repeats, contact the service operator so they can check the sign-in configuration.',
    },
    permissions: {
      tone: 'danger',
      title: 'Google returned unexpected permissions',
      message: 'The service operator needs to review the Google client setup. Gmail access is not required for sign-in.',
    },
    provider: {
      tone: 'danger',
      title: 'Google could not complete the exchange',
      message: 'Try again in a moment. If it repeats, the service operator needs to check connectivity and the Google client settings.',
    },
    not_allowed: {
      tone: 'warning',
      title: 'This account does not have access',
      message: 'Use an allowed Google account, or ask the service operator to add this identity.',
    },
    configuration: {
      tone: 'danger',
      title: 'Google sign-in is not fully configured',
      message: 'Contact the service operator. Selected-message analysis is still available when a local workspace is offered.',
    },
    unavailable: {
      tone: 'danger',
      title: 'Sign-in is temporarily unavailable',
      message: 'Try again shortly. If the problem continues, contact the service operator.',
    },
  }
  return messages[reason] ?? {
    tone: 'danger',
    title: 'Sign-in could not be completed',
    message: 'Try again. If it repeats, contact the service operator with the time of the attempt; do not send a token or authorisation code.',
  }
}

export function Welcome({ session, onLocalStart }: { session: AuthSession; onLocalStart: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tenant, setTenant] = useState('')
  const [key, setKey] = useState('')
  const [notice, setNotice] = useState<Notice | null>(() => signInNotice(window.location.search))
  const pilot = session.mode === 'google'

  useEffect(() => {
    document.title = 'SentinelSME · Evidence-led email security'
    if (new URLSearchParams(window.location.search).has('signin')) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  const begin = async () => {
    setBusy(true)
    setError('')
    setNotice(null)
    try {
      const result = await api.login()
      const destination = new URL(result.authorization_url)
      if (destination.origin !== 'https://accounts.google.com') {
        throw new Error('Google sign-in is unavailable. Ask the service operator to check the sign-in setup.')
      }
      window.location.assign(destination.href)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start sign-in.')
      setBusy(false)
    }
  }

  const localStart = (workspace = `workspace-${crypto.randomUUID()}`, apiKey = '') => {
    try {
      sessionStorage.setItem('sentinelsme.tenantId', workspace)
      if (apiKey) sessionStorage.setItem('sentinelsme.apiKey', apiKey)
      else sessionStorage.removeItem('sentinelsme.apiKey')
      onLocalStart()
    } catch {
      setError('This browser must allow session storage to open a local workspace.')
    }
  }

  return (
    <div className="welcome-shell">
      <a className="skip-link" href="#welcome-main">Skip to main content</a>
      <header className="welcome-header">
        <a className="welcome-home" href="/" aria-label="SentinelSME home"><Brand subtitle="Evidence-led email security" /></a>
        <nav aria-label="Product information">
          <a href="#how-it-works">How it works</a>
          <a href="#privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
        <span className="welcome-mode"><span aria-hidden="true" />{pilot ? 'Private workspaces' : 'Local controlled workspace'}</span>
      </header>

      <main id="welcome-main" className="welcome-main">
        <section className="welcome-hero" aria-labelledby="welcome-title">
          <div className="welcome-hero-copy">
            <p className="eyebrow">Email security for small organisations</p>
            <h1 id="welcome-title">See the risk in email.<br /><span>Keep the evidence.</span></h1>
            <p className="welcome-lede">
              SentinelSME helps your team inspect the messages you choose, understand why a message was flagged,
              and decide what to do next. Rules make the finding. People make the decision.
            </p>

            {notice && (
              <InlineNotice tone={notice.tone} title={notice.title}>
                {notice.message}
              </InlineNotice>
            )}
            {error && <InlineNotice tone="danger" title="Sign-in could not start">{error}</InlineNotice>}

            <div className="welcome-actions">
              {pilot ? (
                <button
                  className="button button-primary button-large"
                  disabled={busy || !session.configured}
                  onClick={() => void begin()}
                  type="button"
                >
                  <Icons.key aria-hidden="true" />
                  {busy ? 'Opening Google…' : 'Sign in with Google'}
                </button>
              ) : (
                <button className="button button-primary button-large" onClick={() => localStart()} type="button">
                  Open a local workspace<Icons.arrow aria-hidden="true" />
                </button>
              )}
              <a className="button button-secondary button-large" href="#how-it-works">
                See how it works
              </a>
            </div>

            <p className="welcome-assurance">
              <Icons.lock aria-hidden="true" />
              Your first sign-in creates your private account and workspace. Gmail access is requested separately, remains optional, and is read-only.
            </p>
            {pilot && !session.configured && (
              <InlineNotice tone="warning" title="Sign-in is awaiting operator setup">
                The service operator needs to finish the Google configuration. You can still use selected-message
                analysis when a local controlled workspace is available.
              </InlineNotice>
            )}
            {pilot && session.invitation_only && (
              <p className="welcome-invite">Access is limited to accounts invited by the service operator.</p>
            )}

            {!pilot && (
              <details className="welcome-advanced">
                <summary>Open an existing local workspace</summary>
                <form onSubmit={(event) => {
                  event.preventDefault()
                  if (tenant.trim()) localStart(tenant.trim(), key.trim())
                }}>
                  <label htmlFor="local-tenant">Workspace ID</label>
                  <input id="local-tenant" value={tenant} onChange={(event) => setTenant(event.target.value)} required maxLength={100} autoComplete="organization" />
                  <label htmlFor="local-key">Deployment key <span>(only if required)</span></label>
                  <input id="local-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" />
                  <button className="button button-secondary" type="submit" disabled={!tenant.trim()}>Open workspace</button>
                </form>
                <p>Local workspaces use caller-selected partitions. They are for controlled samples on this machine, not shared production sign-in.</p>
              </details>
            )}
          </div>

          <div className="welcome-visual">
            <WelcomeStory />
            <div className="welcome-visual-caption">
              <span><Icons.shield aria-hidden="true" />Deterministic evidence</span>
              <span><Icons.user aria-hidden="true" />Human review</span>
              <span><Icons.lock aria-hidden="true" />Minimal retention</span>
            </div>
          </div>
        </section>

        <section className="welcome-value" aria-labelledby="value-title">
          <div className="welcome-section-heading">
            <p className="eyebrow">What you get</p>
            <h2 id="value-title">A clear next step, backed by evidence</h2>
            <p>Start with one message. Connect a mailbox only when you are ready and the deployment supports it.</p>
          </div>
          <div className="value-grid">
            <article>
              <span className="value-icon"><Icons.mail aria-hidden="true" /></span>
              <h3>Analyse selected messages</h3>
              <p>Inspect a message you own or are authorised to review. The safest path works without Google or an AI service.</p>
              <span className="value-note">Available without Gmail</span>
            </article>
            <article>
              <span className="value-icon"><Icons.activity aria-hidden="true" /></span>
              <h3>Review prioritised incidents</h3>
              <p>See the matched rules, evidence, score and review history. Priority helps order attention; it is not an attack probability.</p>
              <span className="value-note">Traceable evidence chain</span>
            </article>
            <article>
              <span className="value-icon"><Icons.sparkle aria-hidden="true" /></span>
              <h3>Understand without surrendering judgement</h3>
              <p>Plain-language explanations can be generated from structured findings. They cannot add evidence, change a score or act on your account.</p>
              <span className="value-note">AI explains only</span>
            </article>
          </div>
        </section>

        <section id="how-it-works" className="welcome-how" aria-labelledby="how-title">
          <div className="welcome-section-heading">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title">From message to decision in four steps</h2>
          </div>
          <ol className="how-steps">
            <li>
              <span>01</span>
              <div><strong>Choose the data</strong><p>Analyse a selected message, or connect Gmail for a bounded read-only sample. Gmail consent is separate from sign-in.</p></div>
            </li>
            <li>
              <span>02</span>
              <div><strong>Minimise and normalise</strong><p>Message bodies are reduced to matched phrases. Links become hostnames and are never opened. Attachments are excluded.</p></div>
            </li>
            <li>
              <span>03</span>
              <div><strong>Apply deterministic rules</strong><p>Versioned rules create findings with copied weights, confidence and evidence. Scoring is bounded and auditable.</p></div>
            </li>
            <li>
              <span>04</span>
              <div><strong>Review and record</strong><p>Read the explanation and recommendations, verify through a trusted channel, and record your decision in the audit trail.</p></div>
            </li>
          </ol>
        </section>

        <section id="privacy" className="welcome-trust" aria-labelledby="privacy-title">
          <div className="welcome-trust-copy">
            <p className="eyebrow">Privacy by boundary</p>
            <h2 id="privacy-title">Your message is not the product.</h2>
            <p>
              SentinelSME is designed around minimised evidence. It does not retain full message bodies or attachments,
              and it does not send mail, delete mail or change account settings.
            </p>
            <div className="trust-points">
              <div><Icons.check aria-hidden="true" /><span><strong>Separate consent</strong>Signing in does not grant Gmail access.</span></div>
              <div><Icons.check aria-hidden="true" /><span><strong>Read-only sampling</strong>Gmail collection runs only when you request a bounded sample.</span></div>
              <div><Icons.check aria-hidden="true" /><span><strong>Human control</strong>Recommendations are advisory. You decide and record the outcome.</span></div>
            </div>
            <a className="button button-secondary" href="/privacy">Read the privacy boundary</a>
          </div>
          <PrivacyBoundaryArt />
        </section>

        <section className="welcome-boundary" aria-labelledby="boundary-title">
          <div>
            <p className="eyebrow">Honest scope</p>
            <h2 id="boundary-title">What SentinelSME does not claim</h2>
          </div>
          <ul>
            <li><Icons.close aria-hidden="true" />It does not provide continuous monitoring or block mail delivery.</li>
            <li><Icons.close aria-hidden="true" />It does not inspect attachments, execute malware or fetch submitted links.</li>
            <li><Icons.close aria-hidden="true" />It does not certify a message as safe when no rule matches.</li>
            <li><Icons.close aria-hidden="true" />It does not let AI create findings, change scores or perform remediation.</li>
          </ul>
        </section>

        <section className="welcome-final">
          <div>
            <p className="eyebrow">Ready when you are</p>
            <h2>Start with a message you already have permission to review.</h2>
            <p>No Gmail connection is required for selected-message analysis.</p>
          </div>
          {pilot ? (
            <button className="button button-primary button-large" disabled={busy || !session.configured} onClick={() => void begin()} type="button">
              <Icons.key aria-hidden="true" />{busy ? 'Opening Google…' : 'Sign in with Google'}
            </button>
          ) : (
            <button className="button button-primary button-large" onClick={() => localStart()} type="button">
              Open a local workspace<Icons.arrow aria-hidden="true" />
            </button>
          )}
        </section>
      </main>

      <footer className="welcome-footer">
        <Brand />
        <p>Evidence-led email security · private workspaces · human decisions</p>
        <div><a href="/privacy">Privacy</a><a href="/terms">Terms of use</a></div>
      </footer>
    </div>
  )
}
