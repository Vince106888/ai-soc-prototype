import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { GmailSchedule } from './GmailSchedule'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const credentials = { tenantId: 'owner', apiKey: '' }
const source = { id: 'source', name: 'Controlled Gmail fixture', status: 'active' }
const schedule = { source_id: 'source', enabled: true, interval_minutes: 60, maximum_messages: 20, recent_days: 7, next_run_at: '2026-10-05T12:00:00Z', failure_count: 0, last_job_id: null, updated_at: '2026-10-05T11:00:00Z' }

describe('scheduled samples', () => {
  it('requires separate acknowledgement and valid bounded settings', async () => {
    vi.spyOn(api, 'schedule').mockResolvedValue(null)
    const save = vi.spyOn(api, 'saveSchedule').mockResolvedValue(schedule)
    render(<GmailSchedule credentials={credentials} source={source} />)
    expect(screen.queryByRole('button', { name: 'Enable schedule', hidden: true })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Automatic/, hidden: true }))
    expect(screen.getByRole('button', { name: 'Enable schedule', hidden: true })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { hidden: true }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enable schedule', hidden: true })).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Interval (minutes)'), { target: { value: '14' } })
    expect(screen.getByRole('button', { name: 'Enable schedule', hidden: true })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Interval (minutes)'), { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enable schedule', hidden: true }))
    await screen.findByText(/Next eligible run/)
    expect(save).toHaveBeenCalledWith(credentials, 'source', { enabled: true, acknowledged: true, interval_minutes: 60, maximum_messages: 20, recent_days: 7 })
    expect(screen.getByRole('checkbox', { hidden: true })).not.toBeChecked()
  })
  it('allows pausing without granting consent again', async () => {
    vi.spyOn(api, 'schedule').mockResolvedValue(schedule)
    const save = vi.spyOn(api, 'saveSchedule').mockResolvedValue({ ...schedule, enabled: false })
    render(<GmailSchedule credentials={credentials} source={source} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause schedule', hidden: true })).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Interval (minutes)'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pause schedule', hidden: true }))
    await waitFor(() => expect(save).toHaveBeenCalledWith(credentials, 'source', expect.objectContaining({ enabled: false, acknowledged: false })))
  })
  it('shows a load failure and prevents enabling an unknown schedule', async () => {
    vi.spyOn(api, 'schedule').mockRejectedValue(new Error('Schedule unavailable'))
    render(<GmailSchedule credentials={credentials} source={source} />)
    expect(await screen.findByRole('alert', { hidden: true })).toHaveTextContent('Schedule unavailable')
    fireEvent.click(screen.getByRole('radio', { name: /Automatic/, hidden: true }))
    expect(screen.getByRole('button', { name: 'Enable schedule', hidden: true })).toBeDisabled()
  })
})
