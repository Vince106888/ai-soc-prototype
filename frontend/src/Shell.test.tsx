import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { IncidentDetail } from './IncidentDetail'
import { api } from './api'
import type { Incident } from './types'
import { parseRoute, routeHref } from './ui/router'
import { humanize } from './utils'

afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); delete document.documentElement.dataset.theme; window.history.replaceState(null, '', '/') })

const cases: Incident[] = [
  { id: 'case-1', title: 'First case', severity: 'critical', status: 'new', score: 0.95, account_id: 'a' },
  { id: 'case-2', title: 'Second case', severity: 'high', status: 'new', score: 0.6, account_id: 'a' },
]

function mockWorkspace() {
  sessionStorage.setItem('sentinelsme.tenantId', 'demo')
  vi.spyOn(api, 'accounts').mockResolvedValue([{ id: 'a', email: 'owner@example.test' }])
  vi.spyOn(api, 'allSources').mockResolvedValue([])
  vi.spyOn(api, 'scanJobs').mockResolvedValue([])
  vi.spyOn(api, 'capabilities').mockResolvedValue({ service: 'SentinelSME', signal_types: ['email'], source_types: ['controlled'], live_connectors: [], controlled_ingestion: true, template_explanations: true, ai_explanations: false, correlation_window_minutes: 30, maximum_batch_size: 500, privacy: { stores_full_bodies: false, stores_attachments: false } })
  vi.spyOn(api, 'overview').mockResolvedValue({ incidents: { active: 2, critical: 1, under_review: 0, resolved: 0, false_positive: 0 }, accounts: 1, active_sources: 0, retained_signals: 2, source_activity: {}, activity: [], latest_job: null })
  vi.spyOn(api, 'incidentPage').mockResolvedValue({ items: cases, total: 2, offset: 0, limit: 25 })
  vi.spyOn(api, 'incident').mockImplementation(async (_credentials, id) => cases.find(item => item.id === id)!)
}

describe('routing', () => {
  it('round-trips every section and keeps an incident id only on the incidents page', () => {
    expect(parseRoute('#/incidents/case%2F1')).toEqual({ section: 'incidents', id: 'case/1' })
    expect(routeHref({ section: 'incidents', id: 'case/1' })).toBe('#/incidents/case%2F1')
    expect(parseRoute('#/analyse')).toEqual({ section: 'analysis' })
    expect(parseRoute('#/evidence/ignored')).toEqual({ section: 'evidence' })
    expect(parseRoute('#/unknown')).toEqual({ section: 'overview' })
    expect(parseRoute('')).toEqual({ section: 'overview' })
    expect(parseRoute('#/incidents/%E0%A4%A')).toEqual({ section: 'incidents' })
  })

  it('opens Email analysis on the Gmail tab straight after a consent callback', async () => {
    mockWorkspace()
    window.history.replaceState(null, '', '/?gmail=connected')
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Email analysis', level: 1 })).toBeVisible()
    expect(screen.getByRole('button', { name: /Gmail sample/ })).toHaveAttribute('aria-pressed', 'true')
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#/analyse')
    expect(await screen.findByText('Gmail connected with read-only consent.')).toBeVisible()
  })

  it('closes the mobile drawer before opening settings so the dialog keeps keyboard focus', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    try {
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
      fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
      const dialog = within(screen.getByRole('dialog'))
      expect(screen.getByRole('navigation').closest('aside')).toHaveAttribute('inert')
      fireEvent.keyDown(window, { key: 'Tab' })
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
      expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    } finally { vi.unstubAllGlobals() }
  })

  it('opens a linked incident directly and moves through the queue with j and k', async () => {
    mockWorkspace()
    window.history.replaceState(null, '', '/#/incidents/case-2')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Second case', level: 2 })).toBeVisible()
    fireEvent.keyDown(window, { key: 'k' })
    expect(await screen.findByRole('heading', { name: 'First case', level: 2 })).toBeVisible()
    expect(window.location.hash).toBe('#/incidents/case-1')
    fireEvent.keyDown(window, { key: 'j' })
    expect(await screen.findByRole('heading', { name: 'Second case', level: 2 })).toBeVisible()
  })

  it('ignores shortcuts while typing and supports go-to chords and the shortcut list', async () => {
    mockWorkspace()
    render(<App />)
    await screen.findByRole('heading', { name: 'Overview', level: 1 })
    const search = screen.getByLabelText('Search incidents')
    fireEvent.keyDown(search, { key: 'g' })
    fireEvent.keyDown(search, { key: 'e' })
    expect(screen.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
    fireEvent.keyDown(window, { key: 'g' })
    fireEvent.keyDown(window, { key: 'e' })
    expect(await screen.findByRole('heading', { name: 'Evidence', level: 1 })).toBeVisible()
    fireEvent.keyDown(window, { key: '/' })
    expect(search).toHaveFocus()
    act(() => search.blur())
    fireEvent.keyDown(window, { key: '?' })
    expect(within(screen.getByRole('dialog')).getByText('Next incident in the queue')).toBeVisible()
  })
})

describe('console chrome', () => {
  it('cycles and remembers the theme preference', () => {
    render(<App />)
    const toggle = screen.getByRole('button', { name: /^Theme: Match system/ })
    fireEvent.click(toggle)
    expect(document.documentElement.dataset.theme).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: /^Theme: Light/ }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('sentinelsme.theme')).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: /^Theme: Dark/ }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem('sentinelsme.theme')).toBeNull()
  })

  it('shows the evidence chain and opens the tab that substantiates a step', () => {
    render(<IncidentDetail incident={{ id: 'case-x', status: 'new', severity: 'high', score: 0.7, findings: [{ rule_code: 'EMAIL-001', title: 'Reply-to mismatch', evidence: { reply_to: 'x' }, weight: 0.45, confidence: 0.9 }], signals: [{ id: 's', signal_type: 'email', occurred_at: '2026-10-17T10:00:00Z', received_at: '2026-10-17T10:00:00Z', features: {} }] }} loading={false} onStatus={vi.fn()} statusBusy={false} />)
    const chain = screen.getByRole('list', { name: 'Evidence chain' })
    expect(chain).toHaveTextContent('1 signal')
    expect(chain).toHaveTextContent('EMAIL-001')
    expect(chain).toHaveTextContent('70 of 100')
    expect(chain).toHaveTextContent('Waiting for you')
    fireEvent.click(within(chain).getByRole('button', { name: /^Matched: 1 rule/ }))
    expect(screen.getByRole('tab', { name: /Evidence/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Reply-to mismatch')
  })

  it('labels signal types and states in plain sentence case', () => {
    expect(humanize('mfa')).toBe('MFA')
    expect(humanize('oauth_grant')).toBe('OAuth grant')
    expect(humanize('under_review')).toBe('Under review')
    expect(humanize('method_count')).toBe('Method count')
  })
})
