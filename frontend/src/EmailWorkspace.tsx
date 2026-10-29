import { useState } from 'react'
import { EmailAnalysis, type EmailDraft } from './EmailAnalysis'
import { GmailConnection } from './GmailConnection'
import type { Account, Credentials, GmailConfiguration, IngestionResult, Source } from './types'

export function EmailWorkspace({credentials,configuration,accounts,sources,onRefresh,onAnalyze,onInspect}:{credentials:Credentials;configuration:GmailConfiguration|undefined;accounts:Account[];sources:Source[];onRefresh:()=>Promise<void>;onAnalyze:(draft:EmailDraft)=>Promise<IngestionResult & {accountId?:string}>;onInspect:(id:string)=>void}) {
  const [mode,setMode]=useState(credentials.userEmail || new URLSearchParams(window.location.search).has('gmail') ? 'Gmail sample' : 'Selected message')
  return <div className="page email-workspace"><header className="page-header"><div><p className="eyebrow">Email investigation</p><h1>Email analysis</h1><p>Inspect a selected message or collect a recent inbox sample.</p></div><span className="mode-tag">Read only · private evidence</span></header><div className="analysis-methods" role="group" aria-label="Analysis method">{[{name:'Selected message',caption:'Analyse the email you choose'},{name:'Gmail sample',caption:configuration?.configured?'Connect and collect on demand':'Google setup required'}].map(item=><button key={item.name} className={mode===item.name?'selected':''} aria-pressed={mode===item.name} onClick={()=>setMode(item.name)}><strong>{item.name}</strong><span>{item.caption}</span></button>)}</div>{mode==='Selected message'?<EmailAnalysis accounts={accounts} sources={sources} onAnalyze={onAnalyze} onInspect={onInspect}/>:<GmailConnection credentials={credentials} configuration={configuration} sources={sources} onRefresh={onRefresh}/>}</div>
}
