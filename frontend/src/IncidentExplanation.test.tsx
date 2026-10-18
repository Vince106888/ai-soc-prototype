import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { IncidentDetail } from './IncidentDetail'

afterEach(cleanup)

const base = { id: 'case-ai', status: 'new' as const, severity: 'critical' as const, score: 0.8, recommendations: [{ position: 1, action: 'Verify the activity.' }] }
const template = { source: 'template' as const, what_happened: 'Rule title.', why_it_matters: 'Generic reason.', severity: 'Severity is critical.', next_step: 'Verify the activity.' }

it('offers a local-model explanation only when the capability is enabled', async () => {
  const user = userEvent.setup()
  const explain = vi.fn().mockResolvedValue(undefined)
  const { rerender } = render(<IncidentDetail incident={{ ...base, explanation: template }} loading={false} onStatus={vi.fn()} statusBusy={false} />)
  expect(screen.queryByRole('button', { name: /plain language/ })).not.toBeInTheDocument()
  expect(screen.getByText(/template explanation/)).toBeVisible()
  rerender(<IncidentDetail incident={{ ...base, explanation: template }} loading={false} onStatus={vi.fn()} statusBusy={false} aiAvailable onExplain={explain} />)
  await user.click(screen.getByRole('button', { name: 'Explain in plain language (local model)' }))
  expect(explain).toHaveBeenCalledOnce()
  rerender(<IncidentDetail incident={{ ...base, explanation: template }} loading={false} onStatus={vi.fn()} statusBusy={false} aiAvailable onExplain={explain} explainBusy />)
  expect(screen.getByRole('button', { name: /Explaining locally/ })).toBeDisabled()
})

it('labels model-written explanations and keeps the approved next step', () => {
  render(<IncidentDetail incident={{ ...base, explanation: { ...template, source: 'ai', what_happened: 'An unverified app was given full mailbox access.' } }} loading={false} onStatus={vi.fn()} statusBusy={false} aiAvailable onExplain={vi.fn()} />)
  expect(screen.getByRole('note')).toHaveTextContent('Rules, score and response guidance are unchanged.')
  expect(screen.getByText('An unverified app was given full mailbox access.')).toBeVisible()
  expect(screen.queryByRole('button', { name: /plain language/ })).not.toBeInTheDocument()
  expect(screen.getByText(/local-model explanation/)).toBeVisible()
})
