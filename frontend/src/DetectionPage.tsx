import { Icons } from './icons'
import { ProtectionCoverage } from './ProtectionCoverage'
import { PostureCheck } from './PostureCheck'
import { RuleCatalogue } from './RuleCatalogue'
import { TrustedSenders } from './TrustedSenders'
import type { DetectionTab } from './routing'
import { PageHeader, Panel } from './ui'
import type { Account, CapabilityProfile, Credentials, Source } from './types'

const tabs: Array<{ id: DetectionTab; label: string; description: string }> = [
  { id: 'rules', label: 'Rule catalogue', description: 'Versioned deterministic rules' },
  { id: 'coverage', label: 'Coverage', description: 'What is and is not assessed' },
  { id: 'trusted', label: 'Trusted senders', description: 'Explicit user configuration' },
  { id: 'posture', label: 'Self-check', description: 'Self-reported account posture' },
]

export function DetectionPage({
  tab,
  onTabChange,
  credentials,
  profile,
  sources,
  accounts,
  onAnalyse,
  onPostureComplete,
}: {
  tab: DetectionTab
  onTabChange: (tab: DetectionTab) => void
  credentials: Credentials
  profile: CapabilityProfile | null
  sources: Source[]
  accounts: Account[]
  onAnalyse: () => void
  onPostureComplete: () => void
}) {
  const selectTab = (next: DetectionTab) => {
    onTabChange(next)
    document.getElementById(`detection-tab-${next}`)?.focus()
  }

  return (
    <div className="page detection-page">
      <PageHeader
        eyebrow="Deterministic detection"
        title="How SentinelSME reaches a finding"
        description="Rules create findings, transparent scoring orders attention, and optional AI only explains the result."
        actions={<button className="button button-primary" onClick={onAnalyse}><Icons.scan />Analyse selected message</button>}
      />

      <Panel className="detection-chain" aria-label="Evidence chain">
        <div><span>01</span><strong>Signal</strong><small>Minimised input</small></div>
        <Icons.arrow aria-hidden="true" />
        <div><span>02</span><strong>Rule</strong><small>Versioned matcher</small></div>
        <Icons.arrow aria-hidden="true" />
        <div><span>03</span><strong>Finding</strong><small>Evidence and weight</small></div>
        <Icons.arrow aria-hidden="true" />
        <div><span>04</span><strong>Incident</strong><small>Bounded correlation</small></div>
        <Icons.arrow aria-hidden="true" />
        <div><span>05</span><strong>Review</strong><small>Human decision</small></div>
      </Panel>

      <div className="detection-tabs" role="tablist" aria-label="Detection information">
        {tabs.map((item) => (
          <button
            id={`detection-tab-${item.id}`}
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`detection-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={tab === item.id ? 'selected' : ''}
            onClick={() => onTabChange(item.id)}
            onKeyDown={(event) => {
              const index = tabs.findIndex((candidate) => candidate.id === item.id)
              const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
              const next = event.key === 'Home'
                ? tabs[0]
                : event.key === 'End'
                  ? tabs.at(-1)
                  : delta
                    ? tabs[(index + delta + tabs.length) % tabs.length]
                    : null
              if (next) {
                event.preventDefault()
                selectTab(next.id)
              }
            }}
            type="button"
          >
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </div>

      <div
        id={`detection-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`detection-tab-${tab}`}
        className="detection-tab-panel"
      >
        {tab === 'rules' && <RuleCatalogue key="rules" credentials={credentials} />}
        {tab === 'coverage' && <ProtectionCoverage profile={profile} sources={sources} onAnalyse={onAnalyse} />}
        {tab === 'trusted' && <TrustedSenders key="trusted" credentials={credentials} />}
        {tab === 'posture' && <PostureCheck key="posture" credentials={credentials} accounts={accounts} onComplete={onPostureComplete} />}
      </div>
    </div>
  )
}
