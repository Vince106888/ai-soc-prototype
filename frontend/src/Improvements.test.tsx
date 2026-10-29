import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { IncidentDetail } from './IncidentDetail'
import { TrustedSenders } from './TrustedSenders'
import { PostureCheck } from './PostureCheck'
import { api } from './api'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const credentials = { tenantId: 'demo', apiKey: '' }
const explanation = {
  source: 'template' as const,
  what_happened: 'Payment redirection request.',
  why_it_matters: 'Generic reason.',
  severity: 'Severity is high.',
  next_step: 'Confirm by phone.',
  reasons: [{ rule_code: 'EMAIL-006', indicator: 'Payment redirection request', why: 'The message asks to change where a payment goes.', legitimate_if: 'You confirmed the change by phone.' }],
  warning_signs: 1,
  warning_level: 'few' as const,
  warning_note: 'Only one warning sign was visible.',
}
const incident = {
  id: 'case-1', status: 'new' as const, severity: 'high' as const, score: 0.67,
  explanation,
  recommendations: [{ position: 1, action: 'Confirm by phone.' }],
  signals: [{ id: 's1', signal_type: 'email', occurred_at: '2026-10-17T10:00:00Z', received_at: '2026-10-17T10:00:00Z', features: { sender: 'a@supplier.example' } }],
}

it('shows why each sign was flagged and when it could be legitimate', () => {
  render(<IncidentDetail incident={incident} loading={false} onStatus={vi.fn()} statusBusy={false} />)
  expect(screen.getByText(/1 warning sign visible/)).toBeVisible()
  const list = screen.getByRole('region', { name: 'Why each warning sign was flagged' })
  expect(list).toHaveTextContent('The message asks to change where a payment goes.')
  expect(list).toHaveTextContent('Could be legitimate if: You confirmed the change by phone.')
})

it('offers to trust the sender only when marking an email incident as a false positive', async () => {
  const user = userEvent.setup()
  const onStatus = vi.fn().mockResolvedValue(true)
  render(<IncidentDetail incident={incident} loading={false} onStatus={onStatus} statusBusy={false} />)
  expect(screen.queryByLabelText(/Trust this sender/)).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Status'), 'false_positive')
  await user.selectOptions(screen.getByLabelText(/Trust this sender/), 'domain')
  await user.click(screen.getByRole('button', { name: 'Update incident' }))
  expect(onStatus).toHaveBeenCalledWith('false_positive', '', 'domain')
})

it('lists, adds and removes trusted senders', async () => {
  const user = userEvent.setup()
  const item = { id: 't1', kind: 'domain' as const, value: 'supplier.co.ke', note: 'Main supplier', created_by: 'console-user', created_at: '2026-10-17T10:00:00Z' }
  const list = vi.spyOn(api, 'trustedSenders').mockResolvedValueOnce([]).mockResolvedValue([item])
  const add = vi.spyOn(api, 'addTrustedSender').mockResolvedValue(item)
  const remove = vi.spyOn(api, 'removeTrustedSender').mockResolvedValue(undefined)
  render(<TrustedSenders credentials={credentials} />)
  expect(await screen.findByText(/No trusted senders yet/)).toBeVisible()
  await user.type(screen.getByLabelText('Domain'), ' supplier.co.ke ')
  await user.click(screen.getByRole('button', { name: 'Add' }))
  expect(add).toHaveBeenCalledWith(credentials, { kind: 'domain', value: 'supplier.co.ke', note: '' })
  expect(await screen.findByText('supplier.co.ke')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Remove supplier.co.ke' }))
  expect(remove).toHaveBeenCalledWith(credentials, 't1')
  expect(list).toHaveBeenCalledTimes(3)
})

it('shows a validation error from the server when adding a trusted sender', async () => {
  const user = userEvent.setup()
  vi.spyOn(api, 'trustedSenders').mockResolvedValue([])
  vi.spyOn(api, 'addTrustedSender').mockRejectedValue(new Error('Shared mail providers cannot be trusted as a whole domain; trust the exact address.'))
  render(<TrustedSenders credentials={credentials} />)
  await user.type(await screen.findByLabelText('Domain'), 'gmail.com')
  await user.click(screen.getByRole('button', { name: 'Add' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('trust the exact address')
})

it('submits self-reported posture answers and summarises the result', async () => {
  const user = userEvent.setup()
  const submit = vi.spyOn(api, 'postureCheck').mockResolvedValue({ source_id: 'src', submitted: ['mfa', 'app:1'], skipped: ['forwarding'], ingestion: { imported_count: 2, duplicate_count: 0, finding_count: 2, items: [] } })
  const done = vi.fn()
  render(<PostureCheck credentials={credentials} accounts={[{ id: 'acc-1', email: 'owner@example.test' }]} onComplete={done} />)
  await user.click(screen.getByRole('radio', { name: 'No' }))
  await user.click(screen.getByRole('button', { name: 'Add an app' }))
  await user.type(screen.getByLabelText('App name'), 'Invoice Helper')
  await user.click(screen.getByRole('checkbox', { name: 'Can read or manage all email' }))
  await user.click(screen.getByRole('checkbox', { name: 'I know and trust the developer' }))
  await user.click(screen.getByRole('button', { name: 'Run self-check' }))
  expect(submit).toHaveBeenCalledWith(credentials, 'acc-1', { mfa: 'off', forwarding: 'unsure', forwarding_domain: '', apps: [{ name: 'Invoice Helper', full_mailbox_access: true, from_known_developer: false }] })
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 settings need attention'))
  expect(screen.getByRole('status')).toHaveTextContent('Skipped (not sure): forwarding.')
  expect(done).toHaveBeenCalledOnce()
})

it('asks for an account before the posture check', () => {
  render(<PostureCheck credentials={credentials} accounts={[]} />)
  expect(screen.getByText(/Add a monitored account first/)).toBeVisible()
})
