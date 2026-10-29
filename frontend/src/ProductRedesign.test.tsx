import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddSourceModal } from './AddSourceModal'
import {
  FirstRunGuide,
  forgetGuideDismissed,
  guideStorageKey,
  rememberGuideDismissed,
  shouldShowGuide,
} from './FirstRunGuide'
import {
  readWorkspaceRoute,
  workspaceRouteUrl,
  writeWorkspaceRoute,
  type WorkspaceRoute,
} from './routing'
import type { CapabilityProfile, Overview, Source } from './types'

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})

const overview: Overview = {
  incidents: { active: 0, critical: 0, under_review: 0, resolved: 0, false_positive: 0 },
  accounts: 1,
  active_sources: 1,
  retained_signals: 0,
  source_activity: {},
  activity: [],
  latest_job: null,
}

const profile: CapabilityProfile = {
  service: 'LindaBiz',
  signal_types: ['email', 'forwarding', 'signin', 'mfa', 'oauth_grant'],
  source_types: ['controlled'],
  live_connectors: [],
  controlled_ingestion: true,
  template_explanations: true,
  ai_explanations: false,
  correlation_window_minutes: 30,
  maximum_batch_size: 500,
  privacy: { stores_full_bodies: false, stores_attachments: false },
}

describe('workspace route state', () => {
  it('restores a deep-linked incident and its filters without trusting unknown views', () => {
    expect(readWorkspaceRoute('?view=unknown&incident=case-1&severity=critical&status=new&q=sender&account=a&open=1')).toEqual(
      expect.objectContaining({
        view: 'incidents',
        incident: 'case-1',
        severity: 'critical',
        status: 'new',
        q: 'sender',
        account: 'a',
        openOnly: true,
      }),
    )
    expect(readWorkspaceRoute('?view=unknown').view).toBe('overview')
  })

  it('serialises only state relevant to the selected workspace view', () => {
    const route: WorkspaceRoute = {
      view: 'analyse',
      incident: 'ignored',
      severity: 'critical',
      status: 'resolved',
      q: 'ignored',
      account: 'ignored',
      seenFrom: '2026-10-01',
      seenTo: '2026-10-29',
      openOnly: true,
      method: 'gmail',
      detectionTab: 'posture',
    }
    expect(workspaceRouteUrl(route)).toBe('/?view=analyse&method=gmail')
    writeWorkspaceRoute(route, 'push')
    expect(window.location.search).toBe('?view=analyse&method=gmail')
  })
})

describe('first-run guidance', () => {
  it('keeps selected-message analysis primary and Gmail explicitly optional', () => {
    const analyse = vi.fn()
    const connect = vi.fn()
    render(
      <FirstRunGuide
        overview={overview}
        sources={[]}
        onAnalyse={analyse}
        onReview={vi.fn()}
        onConnectGmail={connect}
        onDismiss={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Analyse selected message/i }))
    fireEvent.click(screen.getByRole('button', { name: /Review Gmail connection/i }))
    expect(analyse).toHaveBeenCalledOnce()
    expect(connect).toHaveBeenCalledOnce()
    expect(screen.getByText('Optional')).toBeVisible()
    expect(screen.getByText(/not continuous monitoring/i)).toBeVisible()
    expect(screen.getByRole('progressbar', { name: 'Getting started progress' })).toHaveAttribute('aria-valuenow', '0')
  })

  it('records dismissal per workspace and guide version', () => {
    expect(shouldShowGuide('workspace-a')).toBe(true)
    rememberGuideDismissed('workspace-a')
    expect(localStorage.getItem(guideStorageKey('workspace-a'))).toBe('dismissed')
    expect(shouldShowGuide('workspace-a')).toBe(false)
    expect(shouldShowGuide('workspace-b')).toBe(true)
    forgetGuideDismissed('workspace-a')
    expect(shouldShowGuide('workspace-a')).toBe(true)
  })

  it('marks Gmail complete only for an active Gmail source', () => {
    const sources: Source[] = [
      { id: 'gmail-a', name: 'Mailbox', source_type: 'gmail', status: 'disconnected' },
    ]
    const { rerender } = render(
      <FirstRunGuide overview={overview} sources={sources} onAnalyse={vi.fn()} onReview={vi.fn()} onConnectGmail={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    rerender(
      <FirstRunGuide overview={overview} sources={[{ ...sources[0], status: 'active' }]} onAnalyse={vi.fn()} onReview={vi.fn()} onConnectGmail={vi.fn()} onDismiss={vi.fn()} />,
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
  })
})

describe('controlled source boundary', () => {
  it('requires an explicit authorised-data confirmation and never presents the form as Gmail consent', async () => {
    const create = vi.fn().mockResolvedValue(undefined)
    render(<AddSourceModal accounts={[]} profile={profile} onClose={vi.fn()} onCreate={create} />)

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(/does not connect Gmail/i)
    const submit = screen.getByRole('button', { name: 'Add source' })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Account email'), { target: { value: 'owner@example.test' } })
    fireEvent.change(screen.getByLabelText('Source identifier'), { target: { value: 'controlled-01' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /I confirm this source contains only synthetic/i }))
    expect(submit).toBeEnabled()
    fireEvent.click(submit)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'owner@example.test',
      externalId: 'controlled-01',
      capabilities: expect.arrayContaining(['email']),
    }))
  })
})
