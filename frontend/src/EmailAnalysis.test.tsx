import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmailAnalysis } from './EmailAnalysis'
import { OverviewPanel } from './OverviewPanel'

afterEach(cleanup)

describe('email investigation workflow', () => {
  it('selects the newly registered account for the next message', async () => {
    const onAnalyze = vi.fn().mockResolvedValue({ accountId: 'new-account', imported_count: 1, duplicate_count: 0, finding_count: 0, items: [] })
    const view = render(<EmailAnalysis accounts={[]} sources={[]} onAnalyze={onAnalyze} onInspect={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Account email/), { target: { value: 'owner@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Synthetic routine message' }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Analyse selected message' }))
    await screen.findByText('No configured indicators matched')
    view.rerender(<EmailAnalysis accounts={[{ id: 'new-account', email: 'owner@example.test' }]} sources={[]} onAnalyze={onAnalyze} onInspect={vi.fn()} />)
    expect(screen.getByLabelText('Account', { exact: true })).toHaveValue('new-account')
    expect(screen.queryByLabelText(/Account email/)).not.toBeInTheDocument()
  })
  it('requires authorisation, passes selected fields, and clears transient body after analysis', async () => {
    const onAnalyze = vi.fn().mockResolvedValue({ imported_count: 1, duplicate_count: 0, finding_count: 2, items: [{ incident_ids: ['incident-1'] }] })
    const onInspect = vi.fn()
    render(<EmailAnalysis accounts={[{ id: 'a', email: 'owner@example.test' }]} sources={[]} onAnalyze={onAnalyze} onInspect={onInspect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Synthetic suspicious message' }))
    expect(screen.getByRole('button', { name: 'Analyse selected message' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Analyse selected message' }))
    await waitFor(() => expect(screen.getByText('2 indicators matched')).toBeInTheDocument())
    expect(onAnalyze.mock.calls[0][0]).toMatchObject({ accountId: 'a', sender: 'notice@billing-example.test', spf: '' })
    expect(screen.getByLabelText(/Selected message text/)).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Review incident evidence' }))
    expect(onInspect).toHaveBeenCalledWith('incident-1')
  })

  it('reports no match without certifying safety and retains text on failure', async () => {
    const onAnalyze = vi.fn().mockRejectedValueOnce(new Error('Service unavailable')).mockResolvedValueOnce({ imported_count: 1, duplicate_count: 0, finding_count: 0, items: [] })
    render(<EmailAnalysis accounts={[{ id: 'a', email: 'owner@example.test' }]} sources={[]} onAnalyze={onAnalyze} onInspect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Synthetic routine message' }))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Analyse selected message' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText(/Selected message text/)).not.toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Analyse selected message' }))
    await screen.findByText('No configured indicators matched')
    expect(screen.getByText(/does not certify/)).toBeInTheDocument()
  })
})

it('uses workspace totals and excludes closed records from the overview queue', () => {
  render(<OverviewPanel overview={{ incidents: { active: 8, critical: 3, under_review: 2, resolved: 5, false_positive: 1 }, accounts: 1, active_sources: 1, retained_signals: 12, source_activity: {}, activity: [], latest_job: null }} incidents={[{ id: 'closed', title: 'Closed case', severity: 'critical', status: 'false_positive' }]} accounts={[]} sources={[]} profile={null} jobs={[]} loading={false} error="" onRefresh={vi.fn()} onInspect={vi.fn()} onNavigate={vi.fn()} />)
  expect(screen.getByText('8')).toBeInTheDocument()
  expect(screen.queryByText('Closed case')).not.toBeInTheDocument()
})
