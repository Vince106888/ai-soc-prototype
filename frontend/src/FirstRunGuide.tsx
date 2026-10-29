import { Icons } from './icons'
import type { Overview, Source } from './types'

export const GUIDE_VERSION = 'v1'

export function guideStorageKey(workspaceId: string) {
  return `sentinelsme.onboarding.${workspaceId || 'local'}.${GUIDE_VERSION}`
}

export function shouldShowGuide(workspaceId: string) {
  try {
    return localStorage.getItem(guideStorageKey(workspaceId)) !== 'dismissed'
  } catch {
    return true
  }
}

export function rememberGuideDismissed(workspaceId: string) {
  try {
    localStorage.setItem(guideStorageKey(workspaceId), 'dismissed')
  } catch {
    // A blocked localStorage should not prevent the user from working.
  }
}

export function forgetGuideDismissed(workspaceId: string) {
  try {
    localStorage.removeItem(guideStorageKey(workspaceId))
  } catch {
    // A blocked localStorage should not prevent the user from working.
  }
}

export function FirstRunGuide({
  overview,
  sources,
  onAnalyse,
  onReview,
  onConnectGmail,
  onDismiss,
}: {
  overview: Overview | null
  sources: Source[]
  onAnalyse: () => void
  onReview: () => void
  onConnectGmail: () => void
  onDismiss: () => void
}) {
  const hasEvidence = (overview?.retained_signals ?? 0) > 0
  const hasIncidentHistory = Boolean(
    overview && (
      overview.incidents.active +
      overview.incidents.under_review +
      overview.incidents.resolved +
      overview.incidents.false_positive
    ) > 0,
  )
  const gmailConnected = sources.some((source) => source.source_type === 'gmail' && source.status === 'active')
  const complete = [hasEvidence, hasIncidentHistory, gmailConnected].filter(Boolean).length

  return (
    <section className="first-run-guide" aria-labelledby="first-run-title">
      <div className="first-run-heading">
        <div>
          <p className="eyebrow">Getting started</p>
          <h2 id="first-run-title">Start with one message you are allowed to inspect</h2>
          <p>Selected-message analysis works without Gmail. Connect a mailbox later, only if your deployment supports it.</p>
        </div>
        <button className="button button-quiet button-small" onClick={onDismiss} type="button">
          Dismiss guide
        </button>
      </div>

      <ol className="first-run-steps">
        <li className={hasEvidence ? 'complete' : 'current'}>
          <span className="first-run-step-icon" aria-hidden="true">{hasEvidence ? <Icons.check /> : '1'}</span>
          <div>
            <span className="first-run-step-state">{hasEvidence ? 'Done' : 'Start here'}</span>
            <strong>Analyse a selected message</strong>
            <p>Use a message you own or are authorised to review. Try the labelled synthetic example first.</p>
            {!hasEvidence && <button className="link-button" onClick={onAnalyse} type="button">Analyse selected message<Icons.arrow /></button>}
          </div>
        </li>
        <li className={hasIncidentHistory ? 'complete' : hasEvidence ? 'current' : ''}>
          <span className="first-run-step-icon" aria-hidden="true">{hasIncidentHistory ? <Icons.check /> : '2'}</span>
          <div>
            <span className="first-run-step-state">{hasIncidentHistory ? 'Done' : hasEvidence ? 'Next' : 'Later'}</span>
            <strong>Review the evidence behind an incident</strong>
            <p>Open the matched rules, score, explanation source and audit trail before recording a decision.</p>
            {hasIncidentHistory && <button className="link-button" onClick={onReview} type="button">Open incidents<Icons.arrow /></button>}
          </div>
        </li>
        <li className={gmailConnected ? 'complete' : 'optional'}>
          <span className="first-run-step-icon" aria-hidden="true">{gmailConnected ? <Icons.check /> : '3'}</span>
          <div>
            <span className="first-run-step-state">{gmailConnected ? 'Connected' : 'Optional'}</span>
            <strong>Connect Gmail for a bounded sample</strong>
            <p>Gmail needs separate read-only consent. Collection is on demand, not continuous monitoring.</p>
            {!gmailConnected && <button className="link-button" onClick={onConnectGmail} type="button">Review Gmail connection<Icons.arrow /></button>}
          </div>
        </li>
      </ol>

      <footer className="first-run-footer">
        <span>{complete} of 3 steps complete</span>
        <div className="first-run-progress" role="progressbar" aria-label="Getting started progress" aria-valuemin={0} aria-valuemax={3} aria-valuenow={complete}>
          <i style={{ width: `${(complete / 3) * 100}%` }} />
        </div>
        <a href="/privacy">Privacy boundary</a>
      </footer>
    </section>
  )
}
