import { useState } from 'react'
import { EmailAnalysis, type EmailDraft } from './EmailAnalysis'
import { GmailConnection } from './GmailConnection'
import { Icons } from './icons'
import type { AnalysisMethod } from './routing'
import { PageHeader, SegmentedControl } from './ui'
import type { Account, Credentials, GmailConfiguration, IngestionResult, Source } from './types'

export function EmailWorkspace({
  credentials,
  configuration,
  accounts,
  sources,
  onRefresh,
  onAnalyze,
  onInspect,
  method,
  onMethodChange,
}: {
  method?: AnalysisMethod
  onMethodChange?: (value: AnalysisMethod) => void
  credentials: Credentials
  configuration: GmailConfiguration | undefined
  accounts: Account[]
  sources: Source[]
  onRefresh: () => Promise<void>
  onAnalyze: (draft: EmailDraft) => Promise<IngestionResult & { accountId?: string }>
  onInspect: (id: string) => void
}) {
  const [localMode, setLocalMode] = useState<AnalysisMethod>('selected')
  const mode = method ?? localMode
  const setMode = (value: AnalysisMethod) => {
    setLocalMode(value)
    onMethodChange?.(value)
  }

  return (
    <div className="page email-workspace">
      <PageHeader
        eyebrow="Email investigation"
        title="Analyse email"
        description="Start with a message you choose. Connect Gmail only when you want a bounded read-only inbox sample."
        actions={<span className="status-pill info"><Icons.lock aria-hidden="true" />Private evidence</span>}
      />

      <SegmentedControl
        label="Analysis method"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'selected', label: 'Selected message', description: 'Safest default · no Google connection' },
          { value: 'gmail', label: 'Gmail sample', description: configuration?.configured ? 'Read-only · on demand' : 'Setup required' },
        ]}
      />

      <div className="analysis-method-note">
        <Icons.info aria-hidden="true" />
        <p>{mode === 'selected' ? 'The message text is processed to derive matched phrases and link hostnames. Full bodies and attachments are not retained.' : 'Gmail permission is separate from sign-in. Collection is limited to the sample you request; this is not continuous monitoring.'}</p>
      </div>

      {mode === 'selected'
        ? <EmailAnalysis accounts={accounts} sources={sources} onAnalyze={onAnalyze} onInspect={onInspect} />
        : <GmailConnection credentials={credentials} configuration={configuration} sources={sources} onRefresh={onRefresh} />}
    </div>
  )
}
