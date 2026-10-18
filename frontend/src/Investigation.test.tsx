import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { IncidentDetail } from './IncidentDetail'
import { ProtectionCoverage } from './ProtectionCoverage'
import { EmailAnalysis } from './EmailAnalysis'

afterEach(cleanup)

it('navigates incident tabs with the keyboard and exposes supplied account evidence', async () => {
  const user = userEvent.setup()
  render(<IncidentDetail incident={{ id: 'case-test', status: 'new', severity: 'high', score: 0.65, signals: [{ id: 'signal', signal_type: 'mfa', occurred_at: '2026-10-04T09:00:00Z', received_at: '2026-10-04T09:00:01Z', features: { enabled: false, method_count: 0 } }], audit: [{ action: 'created', actor: 'controlled', note: 'Recorded synthetic evidence' }] }} loading={false} onStatus={vi.fn()} statusBusy={false} />)
  screen.getByRole('tab', { name: 'Overview' }).focus()
  await user.keyboard('{ArrowRight}')
  expect(screen.getByRole('tab', { name: /Evidence/ })).toHaveFocus()
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Source observations')
  fireEvent.click(screen.getByText('Mfa'))
  expect(screen.getByText(/method count/i)).toBeVisible()
  expect(screen.getByText('No', { exact: true })).toBeVisible()
  await user.click(screen.getByRole('tab', { name: 'Activity' }))
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Recorded synthetic evidence')
})

it('distinguishes sample analysis from absent mail protection and platform integrations', () => {
  render(<ProtectionCoverage profile={null} sources={[]} onAnalyse={vi.fn()} />)
  expect(screen.getByText('No live mailbox connected')).toBeVisible()
  expect(screen.getByText('Connector not implemented')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Mail operations' }))
  expect(screen.queryByRole('heading', { name: 'Inbound email' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Attachment / malware analysis' })).toBeVisible()
  expect(screen.getByText('Attachments are not downloaded, retained or executed.')).toBeVisible()
})

it('passes declared trusted domains and rejects URL input before analysis', async () => {
  const analyse = vi.fn().mockResolvedValue({ imported_count: 1, duplicate_count: 0, finding_count: 0, items: [] })
  render(<EmailAnalysis accounts={[{ id: 'a', email: 'owner@example.test' }]} sources={[]} onAnalyze={analyse} onInspect={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Routine message' }))
  fireEvent.click(screen.getByText('Sender context (optional)'))
  fireEvent.change(screen.getByLabelText('Trusted domains'), { target: { value: 'https://example.test/private' } })
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Analyse selected email' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('up to 20 trusted domain names')
  expect(analyse).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Trusted domains'), { target: { value: 'Example.test, Vendor.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Analyse selected email' }))
  await screen.findByText('No configured indicators matched')
  expect(analyse.mock.calls[0][0].claimedDomains).toEqual(['example.test', 'vendor.test'])
})
