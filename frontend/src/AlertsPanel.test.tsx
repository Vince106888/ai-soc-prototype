import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { AlertsPanel } from './AlertsPanel'
import type { AlertItem, AlertSettings } from './types'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const credentials = { tenantId: 'owner', apiKey: '' }
const settings: AlertSettings = { minimum_severity: 'high', email_enabled: false, email_to: null, webhook_enabled: false, webhook_url: null, email_available: true, email_locked_to_signed_in_user: false }
const alert: AlertItem = { id: 'a1', incident_id: 'i1', severity: 'critical', title: 'Credential-themed domain', score: 0.9, rule_codes: ['EMAIL-002', 'URL-002'], email_status: 'none', webhook_status: 'none', read: false, created_at: '2026-10-29T10:00:00Z' }

describe('alerts', () => {
  it('lists alerts without message content and marks them read', async () => {
    vi.spyOn(api, 'alertSettings').mockResolvedValue(settings)
    const list = vi.spyOn(api, 'alerts').mockResolvedValueOnce([alert]).mockResolvedValue([{ ...alert, read: true }])
    const mark = vi.spyOn(api, 'markAlertRead').mockResolvedValue()
    render(<AlertsPanel credentials={credentials} />)
    expect(await screen.findByText('Credential-themed domain')).toBeInTheDocument()
    expect(screen.getByText(/EMAIL-002, URL-002/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark Credential-themed domain read' }))
    await waitFor(() => expect(mark).toHaveBeenCalledWith(credentials, 'a1'))
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  })

  it('saves email and webhook choices and shows server validation errors', async () => {
    vi.spyOn(api, 'alertSettings').mockResolvedValue(settings)
    vi.spyOn(api, 'alerts').mockResolvedValue([])
    const save = vi.spyOn(api, 'saveAlertSettings')
      .mockRejectedValueOnce(new Error('Webhook host must resolve to a public address.'))
      .mockResolvedValue({ ...settings, email_enabled: true, email_to: 'me@example.test' })
    render(<AlertsPanel credentials={credentials} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Send to a webhook/ }))
    fireEvent.change(screen.getByLabelText(/Webhook URL/), { target: { value: 'https://internal.example.test/x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save alert settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('public address')
    fireEvent.click(screen.getByRole('checkbox', { name: /Send to a webhook/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Email me/ }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'me@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save alert settings' }))
    expect(await screen.findByText('Alert settings saved.')).toBeInTheDocument()
    expect(save).toHaveBeenLastCalledWith(credentials, { minimum_severity: 'high', email_enabled: true, email_to: 'me@example.test', webhook_enabled: false, webhook_url: null })
  })

  it('disables email when the server has no SMTP and locks the address when signed in', async () => {
    vi.spyOn(api, 'alertSettings').mockResolvedValue({ ...settings, email_available: false })
    vi.spyOn(api, 'alerts').mockResolvedValue([])
    render(<AlertsPanel credentials={credentials} />)
    expect(await screen.findByRole('checkbox', { name: /Email me/ })).toBeDisabled()
    cleanup()
    vi.spyOn(api, 'alertSettings').mockResolvedValue({ ...settings, email_enabled: true, email_to: 'me@example.test', email_locked_to_signed_in_user: true })
    render(<AlertsPanel credentials={credentials} />)
    expect(await screen.findByLabelText(/Email address/)).toHaveAttribute('readonly')
  })
})
