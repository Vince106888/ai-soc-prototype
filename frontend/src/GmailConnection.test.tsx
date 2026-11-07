import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GmailConnection } from './GmailConnection'
import { api } from './api'
import type { GmailConfiguration, Source } from './types'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const configuration: GmailConfiguration = {
  implemented: true, configured: true, message: 'Ready for Google consent.',
  scope: 'https://www.googleapis.com/auth/gmail.readonly',
  maximum_messages: 50, signal_types: ['email'], automatic_scanning: false,
}
const source: Source = { id: 'gmail-source', source_type: 'gmail', name: 'Gmail · read-only', status: 'active' }

describe('Gmail connection and bounded sampling', () => {
  it('prefills the signed-in account and leaves operator setup out of onboarding', () => {
    render(<GmailConnection credentials={{ tenantId: 'assigned', apiKey: '', userEmail: 'invited@example.test', csrfToken: 'csrf' }} configuration={{ ...configuration, configured: false }} sources={[]} onRefresh={vi.fn()} />)
    expect(screen.getByLabelText('Gmail address')).toHaveValue('invited@example.test')
    expect(screen.getByLabelText('Gmail address')).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled()
    expect(screen.queryByText('Local setup instructions')).not.toBeInTheDocument()
  })
  it('shows a connected source instead of asking for initial consent again', () => {
    render(<GmailConnection credentials={{ tenantId: 'trial', apiKey: '' }} configuration={configuration} sources={[source]} onRefresh={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Gmail is connected' })).toBeInTheDocument()
    expect(screen.getAllByText('Connected · read-only')).not.toHaveLength(0)
    expect(screen.queryByText('Ready for consent')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scan Gmail · read-only' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /^I authorise read-only analysis/ }))
    expect(screen.getByRole('button', { name: 'Scan Gmail · read-only' })).toBeEnabled()
  })

  it('requires reconnection for a disconnected source and blocks scanning it', () => {
    render(<GmailConnection credentials={{ tenantId: 'trial', apiKey: '' }} configuration={configuration} sources={[{ ...source, status: 'disconnected' }]} onRefresh={vi.fn()} />)
    expect(screen.getAllByText('Reconnect required')).not.toHaveLength(0)
    expect(screen.getByLabelText('Gmail address')).toBeVisible()
    fireEvent.click(screen.getByRole('checkbox', { name: /^I authorise read-only analysis/ }))
    expect(screen.getByRole('button', { name: 'Scan Gmail · read-only' })).toBeDisabled()
  })

  it('rejects fractional limits and submits only the authorised bounded sample', async () => {
    const scan = vi.spyOn(api, 'gmailScan').mockResolvedValue({ examined_count: 20, imported_count: 20, duplicate_count: 0, finding_count: 2 })
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<GmailConnection credentials={{ tenantId: 'trial', apiKey: '' }} configuration={configuration} sources={[source]} onRefresh={onRefresh} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /^I authorise read-only analysis/ }))
    fireEvent.change(screen.getByLabelText('Maximum messages'), { target: { value: '1.5' } })
    expect(screen.getByRole('button', { name: 'Scan Gmail · read-only' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Maximum messages'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Recent days'), { target: { value: '7.5' } })
    expect(screen.getByRole('button', { name: 'Scan Gmail · read-only' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Recent days'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Scan Gmail · read-only' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Examined 20 messages: 20 new, 0 already imported, 2 new findings.')
    expect(scan).toHaveBeenCalledWith({ tenantId: 'trial', apiKey: '' }, source.id, 20, 7, true)
    expect(onRefresh).toHaveBeenCalledOnce()
  })
})
