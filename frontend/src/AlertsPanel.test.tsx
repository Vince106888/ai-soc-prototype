import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { AlertsPanel } from './AlertsPanel'
import type { AlertItem, AlertSettings } from './types'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const credentials = { tenantId: 'owner', apiKey: '' }
const settings: AlertSettings = { minimum_severity: 'high', webhook_enabled: false, webhook_url: null }
const alert: AlertItem = { id: 'a1', incident_id: 'i1', severity: 'critical', title: 'Credential-themed domain', score: 0.9, rule_codes: ['EMAIL-002', 'URL-002'], webhook_status: 'none', read: false, created_at: '2026-10-29T10:00:00Z' }

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

  it('saves a webhook choice and shows server validation errors', async () => {
    vi.spyOn(api, 'alertSettings').mockResolvedValue(settings)
    vi.spyOn(api, 'alerts').mockResolvedValue([])
    const save = vi.spyOn(api, 'saveAlertSettings')
      .mockRejectedValueOnce(new Error('Webhook host must resolve to a public address.'))
      .mockResolvedValue({ ...settings, webhook_enabled: true, webhook_url: 'https://hooks.example.test/x' })
    render(<AlertsPanel credentials={credentials} />)
    expect(screen.queryByRole('checkbox', { name: /Email/ })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Send to a webhook/ }))
    fireEvent.change(screen.getByLabelText(/Webhook URL/), { target: { value: 'https://internal.example.test/x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save alert settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('public address')
    fireEvent.change(screen.getByLabelText(/Webhook URL/), { target: { value: 'https://hooks.example.test/x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save alert settings' }))
    expect(await screen.findByText('Alert settings saved.')).toBeInTheDocument()
    expect(save).toHaveBeenLastCalledWith(credentials, { minimum_severity: 'high', webhook_enabled: true, webhook_url: 'https://hooks.example.test/x' })
  })
})
