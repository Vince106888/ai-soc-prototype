import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { AssistantWidget } from './AssistantWidget'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const credentials = { tenantId: 'owner', apiKey: '' }
const reply = { answer: 'Two rules matched.', topic: 'why', references: ['EMAIL-002', 'URL-002'], suggestions: ['What should I do next?'], grounded_in: 'incident' as const, source: 'grounded' as const }

describe('assistant', () => {
  it('opens, answers from stored findings with its references, and states it uses no model', async () => {
    const ask = vi.spyOn(api, 'askAssistant').mockResolvedValue(reply)
    render(<AssistantWidget credentials={credentials} incidentId="inc-1" incidentTitle="Credential-themed domain" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ask LindaBiz' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ask LindaBiz' })
    expect(dialog).toHaveTextContent('No AI model is used and nothing you type is stored')
    expect(screen.getByLabelText('Your question')).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Why was this flagged?' }))
    await screen.findByText('Two rules matched.')
    expect(ask).toHaveBeenCalledWith(credentials, 'Why was this flagged?', 'inc-1')
    expect(screen.getByText('Based on EMAIL-002, URL-002')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'What should I do next?' })).toBeInTheDocument()
  })

  it('sends typed questions, blocks empty input, shows failures and closes with Escape', async () => {
    const ask = vi.spyOn(api, 'askAssistant').mockRejectedValueOnce(new Error('Assistant unavailable')).mockResolvedValue(reply)
    render(<AssistantWidget credentials={credentials} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ask LindaBiz' }))
    const send = await screen.findByRole('button', { name: 'Send' })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'What do you store?' } })
    fireEvent.click(send)
    expect(await screen.findByRole('alert')).toHaveTextContent('Assistant unavailable')
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'What do you store?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(ask).toHaveBeenLastCalledWith(credentials, 'What do you store?', undefined))
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('starts a fresh conversation when a different incident is opened', async () => {
    vi.spyOn(api, 'askAssistant').mockResolvedValue(reply)
    const { rerender } = render(<AssistantWidget credentials={credentials} incidentId="inc-1" incidentTitle="First" />)
    fireEvent.click(screen.getByRole('button', { name: 'Ask LindaBiz' }))
    fireEvent.click(await screen.findByRole('button', { name: 'What happened here?' }))
    await screen.findByText('Two rules matched.')
    rerender(<AssistantWidget credentials={credentials} incidentId="inc-2" incidentTitle="Second" />)
    await waitFor(() => expect(screen.queryByText('Two rules matched.')).not.toBeInTheDocument())
    expect(screen.getByRole('dialog')).toHaveTextContent('About: Second')
  })
})
