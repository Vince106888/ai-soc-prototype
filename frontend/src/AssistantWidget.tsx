import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { api } from './api'
import { Icons } from './icons'
import type { Credentials } from './types'

interface Message {
  id: number
  role: 'user' | 'assistant'
  text: string
  references?: string[]
}

const greeting = (incidentTitle?: string) => incidentTitle
  ? `I can explain “${incidentTitle}” using only its stored findings: what happened, why it was flagged, the score and what to do next.`
  : 'I can explain how LindaBiz works, or open an incident and ask me about it. I only use stored findings and the rule catalogue.'

export function AssistantWidget({ credentials, incidentId, incidentTitle }: { credentials: Credentials; incidentId?: string; incidentTitle?: string }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const counter = useRef(0)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight }, [messages, busy])

  // A different incident is a different conversation: keep answers tied to what is on screen.
  useEffect(() => { setMessages([]); setSuggestions([]); setError('') }, [incidentId])

  const ask = async (question: string) => {
    const clean = question.trim()
    if (!clean || busy) return
    const id = (counter.current += 2)
    setMessages(current => [...current, { id, role: 'user', text: clean }])
    setText(''); setBusy(true); setError('')
    try {
      const reply = await api.askAssistant(credentials, clean, incidentId)
      setMessages(current => [...current, { id: id + 1, role: 'assistant', text: reply.answer, references: reply.references }])
      setSuggestions(reply.suggestions)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The assistant could not answer.')
    } finally { setBusy(false) }
  }

  const submit = (event: FormEvent) => { event.preventDefault(); void ask(text) }
  const starters = suggestions.length ? suggestions : incidentId
    ? ['What happened here?', 'Why was this flagged?', 'What should I do next?', 'What does the score mean?']
    : ['How is the priority score calculated?', 'What does LindaBiz store?', 'How do automatic scans work?']

  return (
    <>
      {open && (
        <section id={panelId} className="assistant-panel" role="dialog" aria-label="Ask LindaBiz">
          <header>
            <span className="assistant-mark" aria-hidden="true"><Icons.sparkle /></span>
            <div><strong>Ask LindaBiz</strong><small>{incidentTitle ? `About: ${incidentTitle}` : 'General help'}</small></div>
            <button type="button" className="icon-button" aria-label="Close assistant" onClick={() => setOpen(false)}><Icons.close /></button>
          </header>
          <div className="assistant-log" ref={log} role="log" aria-live="polite" aria-label="Conversation">
            <p className="assistant-note"><Icons.lock aria-hidden="true" />{greeting(incidentTitle)} No AI model is used and nothing you type is stored.</p>
            {messages.map(message => (
              <div key={message.id} className={`assistant-bubble ${message.role}`}>
                <p>{message.text}</p>
                {message.references && message.references.length > 0 && <small>Based on {message.references.join(', ')}</small>}
              </div>
            ))}
            {busy && <div className="assistant-bubble assistant" role="status"><p>Checking the findings…</p></div>}
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
          <div className="assistant-suggestions" aria-label="Suggested questions">
            {starters.map(item => <button key={item} type="button" className="filter-chip" disabled={busy} onClick={() => void ask(item)}>{item}</button>)}
          </div>
          <form className="assistant-form" onSubmit={submit}>
            <label className="sr-only" htmlFor={`${panelId}-input`}>Your question</label>
            <input id={`${panelId}-input`} ref={input} value={text} maxLength={500} placeholder="Ask about this incident or LindaBiz…" onChange={event => setText(event.target.value)} autoComplete="off" />
            <button className="button button-primary" disabled={busy || text.trim().length < 2} type="submit">Send</button>
          </form>
        </section>
      )}
      <button type="button" className="assistant-fab" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen(current => !current)}>
        <Icons.sparkle aria-hidden="true" /><span>{open ? 'Close assistant' : 'Ask LindaBiz'}</span>
      </button>
    </>
  )
}
