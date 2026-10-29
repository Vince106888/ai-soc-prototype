import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { api } from './api'
import type { Incident } from './types'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

const incident: Incident = { id: 'case-a', title: 'Controlled critical case', summary: 'Synthetic evidence', severity: 'critical', status: 'new', score: 0.9, account_id: 'account-a' }

function mockWorkspace() {
  vi.spyOn(api, 'accounts').mockResolvedValue([{ id: 'account-a', email: 'owner@example.test' }])
  vi.spyOn(api, 'allSources').mockResolvedValue([])
  vi.spyOn(api, 'scanJobs').mockResolvedValue([])
  vi.spyOn(api, 'capabilities').mockResolvedValue({ service: 'LindaBiz', signal_types: ['email'], source_types: ['controlled'], live_connectors: [], controlled_ingestion: true, template_explanations: true, ai_explanations: false, correlation_window_minutes: 30, maximum_batch_size: 500, privacy: { stores_full_bodies: false, stores_attachments: false } })
  vi.spyOn(api, 'overview').mockResolvedValue({ incidents: { active: 1, critical: 1, under_review: 0, resolved: 0, false_positive: 0 }, accounts: 1, active_sources: 0, retained_signals: 1, source_activity: {}, activity: [], latest_job: null })
  vi.spyOn(api, 'incident').mockResolvedValue(incident)
}

describe('workspace investigation state', () => {
  it('submits search deliberately instead of reloading the workspace on each key', async () => {
    sessionStorage.setItem('sentinelsme.tenantId', 'a')
    mockWorkspace()
    const pages = vi.spyOn(api, 'incidentPage').mockResolvedValue({ items: [incident], total: 1, offset: 0, limit: 25 })
    render(<App />)
    await screen.findByRole('button', { name: /Controlled critical case/ })
    const calls = pages.mock.calls.length
    fireEvent.change(screen.getByRole('textbox', { name: 'Search incidents' }), { target: { value: '  sender  ' } })
    expect(pages.mock.calls).toHaveLength(calls)
    fireEvent.click(screen.getByRole('button', { name: 'Search workspace' }))
    await screen.findByRole('heading', { name: 'Incidents' })
    await waitFor(() => expect(pages.mock.calls.some(([, filters]) => filters.q === 'sender')).toBe(true))
  })

  it('opens selected-message analysis separately from Gmail setup for signed-in users', async () => {
    mockWorkspace()
    vi.spyOn(api, 'incidentPage').mockResolvedValue({ items: [], total: 0, offset: 0, limit: 25 })
    render(<App session={{ mode: 'google', configured: true, invitation_only: false, session_hours: 8, mailbox_consent_separate: true, csrf_token: 'synthetic', user: { id: 'a', email: 'owner@example.test', workspace_id: 'a' } }} />)
    await screen.findByRole('heading', { name: 'Security overview' })
    fireEvent.click(screen.getByRole('button', { name: 'Analyse message' }))
    await waitFor(() => expect(screen.getByRole('main')).toHaveTextContent('Analyse email'))
    fireEvent.click(screen.getByRole('button', { name: /Gmail sample/ }))
    expect(await screen.findByRole('button', { name: /Continue with Google/ })).toBeVisible()
    expect(screen.queryByLabelText('Selected message text')).not.toBeInTheDocument()
  })

  it('opens critical metrics as visible, removable filters', async () => {
    sessionStorage.setItem('sentinelsme.tenantId', 'a')
    mockWorkspace()
    vi.spyOn(api, 'incidentPage').mockResolvedValue({ items: [incident], total: 1, offset: 0, limit: 25 })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Critical priority: 1/ }))
    expect(screen.getByLabelText('Severity')).toHaveValue('critical')
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Open cases only' }))
    expect(screen.queryByRole('button', { name: 'Remove filter: Open cases only' })).not.toBeInTheDocument()
  })
  it('keeps keyboard focus inside the mobile drawer and restores it on Escape', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    try {
      render(<App />)
      const opener = screen.getByRole('button', { name: 'Open navigation' })
      const panel = screen.getByRole('navigation').closest('aside')!
      expect(panel).toHaveAttribute('inert')
      fireEvent.click(opener)
      expect(panel).not.toHaveAttribute('inert')
      await waitFor(() => expect(screen.getByRole('button', { name: 'Overview' })).toHaveFocus())
      screen.getByRole('button', { name: 'Account & settings' }).focus()
      fireEvent.keyDown(window, { key: 'Tab' })
      expect(screen.getByRole('button', { name: 'Overview' })).toHaveFocus()
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(panel).toHaveAttribute('inert')
      expect(opener).toHaveFocus()
    } finally { vi.unstubAllGlobals() }
  })

  it('traps settings dialog focus and returns it to the opener', async () => {
    render(<App />)
    const opener = screen.getByRole('button', { name: 'Local workspace settings' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = within(screen.getByRole('dialog'))
    const close = dialog.getByRole('button', { name: 'Close dialog' })
    await waitFor(() => expect(close).toHaveFocus())
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('reports a queue failure instead of showing a clean queue', async () => {
    sessionStorage.setItem('sentinelsme.tenantId', 'a')
    mockWorkspace()
    vi.spyOn(api, 'incidentPage').mockImplementation(async (_credentials, filters) => {
      if (filters.openOnly) throw new Error('Queue unavailable')
      return { items: [], total: 0, offset: 0, limit: 25 }
    })
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('The review queue is unavailable')
    expect(screen.queryByText('No open incidents in this view')).not.toBeInTheDocument()
  })

  it('keeps the overview queue independent of incident filters', async () => {
    sessionStorage.setItem('sentinelsme.tenantId', 'a')
    mockWorkspace()
    const pages = vi.spyOn(api, 'incidentPage').mockImplementation(async (_credentials, filters) => ({ items: filters.status === 'resolved' ? [] : [incident], total: filters.status === 'resolved' ? 0 : 1, offset: 0, limit: 25 }))
    render(<App />)
    await screen.findByRole('button', { name: /Controlled critical case/ })
    fireEvent.click(screen.getByRole('button', { name: 'All incidents' }))
    fireEvent.change(screen.getAllByLabelText('Status')[0], { target: { value: 'resolved' } })
    await screen.findByText('No incidents match these filters')
    expect(pages.mock.calls.some(([, filters]) => filters.openOnly === true && filters.status === '')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }))
    await screen.findByRole('button', { name: /Controlled critical case/ })
  })

  it('discards an older workspace response after switching tenants', async () => {
    sessionStorage.setItem('sentinelsme.tenantId', 'a')
    mockWorkspace()
    let release: (() => void) | undefined
    const pending = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(api, 'incidentPage').mockImplementation(async credentials => {
      if (credentials.tenantId === 'a') await pending
      return { items: credentials.tenantId === 'a' ? [incident] : [], total: credentials.tenantId === 'a' ? 1 : 0, offset: 0, limit: 25 }
    })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Account & settings' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Workspace ID'), { target: { value: 'b' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Open workspace' }))
    await screen.findByText('No open incidents in this view')
    release?.()
    await waitFor(() => expect(screen.queryByRole('button', { name: /Controlled critical case/ })).not.toBeInTheDocument())
    expect(sessionStorage.getItem('sentinelsme.tenantId')).toBe('b')
  })
})
