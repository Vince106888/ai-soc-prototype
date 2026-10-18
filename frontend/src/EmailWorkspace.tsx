import { useState } from 'react'
import { EmailAnalysis, type EmailDraft } from './EmailAnalysis'
import { GmailConnection } from './GmailConnection'
import type { Account, Credentials, GmailConfiguration, IngestionResult, Source } from './types'
import { PageHeader } from './ui/primitives'

const methods = ['Selected message', 'Gmail sample'] as const

export function EmailWorkspace({ credentials, configuration, accounts, sources, onRefresh, onAnalyze, onInspect, gmailCallback = false }: { gmailCallback?: boolean; credentials: Credentials; configuration: GmailConfiguration | undefined; accounts: Account[]; sources: Source[]; onRefresh: () => Promise<void>; onAnalyze: (draft: EmailDraft) => Promise<IngestionResult & { accountId?: string }>; onInspect: (id: string) => void }) {
  const [mode, setMode] = useState<typeof methods[number]>(credentials.userEmail || gmailCallback ? 'Gmail sample' : 'Selected message')
  const captions = { 'Selected message': 'Paste one email you choose. Processed locally.', 'Gmail sample': configuration?.configured ? 'Read a bounded recent inbox sample on demand.' : 'Needs Google setup before first use.' }
  return <div className="page analysis-page">
    <PageHeader title="Email analysis" lead="Check one message you select, or collect a read-only sample from Gmail. Links are never opened and attachments are never downloaded." />
    <div className="method-switch" role="group" aria-label="Analysis method">{methods.map(name => <button key={name} aria-pressed={mode === name} onClick={() => setMode(name)} type="button"><strong>{name}</strong><span>{captions[name]}</span></button>)}</div>
    {mode === 'Selected message' ? <EmailAnalysis accounts={accounts} sources={sources} onAnalyze={onAnalyze} onInspect={onInspect} /> : <GmailConnection credentials={credentials} configuration={configuration} sources={sources} onRefresh={onRefresh} />}
  </div>
}
