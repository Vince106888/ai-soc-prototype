import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EvidenceWorkspace, Pagination } from './EvidenceWorkspace'
import { RuleCatalogue } from './RuleCatalogue'
import { api } from './api'

const credentials = { tenantId:'controlled', apiKey:'' }
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('retained evidence workflow', () => {
  it('shows no-match observations without a safety verdict and applies server filters', async () => {
    const evidence = vi.spyOn(api, 'evidence').mockResolvedValue({ total:1, limit:25, offset:0, items:[{id:'signal',account_id:'account',source_id:'source',signal_type:'email',occurred_at:'2026-10-04T09:00:00Z',received_at:'2026-10-04T09:00:00Z',sender:'team@example.test',subject:'Meeting agenda',finding_count:0,incident_ids:[]}] })
    vi.spyOn(api,'evidenceDetail').mockResolvedValue({ id:'signal',signal_type:'email',occurred_at:'2026-10-04T09:00:00Z',received_at:'2026-10-04T09:00:00Z',external_id:'controlled',correlation_key:'controlled',features:{sender:'team@example.test',subject:'Meeting agenda',authentication_failures:[]},findings:[],incidents:[] })
    render(<EvidenceWorkspace credentials={credentials} accounts={[]} sources={[]} onInspect={vi.fn()} />)
    await screen.findByText(/does not certify safety/, {}, { timeout: 10000 })
    expect(screen.getByText('Normalised observations')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Detection result'), {target:{value:'false'}})
    await waitFor(() => expect(evidence.mock.calls.at(-1)?.[1]).toMatchObject({hasFindings:'false',offset:0}))
    expect(screen.queryByRole('button',{name:'Review linked incident'})).not.toBeInTheDocument()
  })

  it('reports a failed evidence load without presenting stale records', async () => {
    vi.spyOn(api,'evidence').mockRejectedValue(new Error('Service unavailable'))
    render(<EvidenceWorkspace credentials={credentials} accounts={[]} sources={[]} onInspect={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable')
  })

  it('keeps pagination inside server-reported bounds', () => {
    const change = vi.fn()
    render(<Pagination total={26} offset={0} limit={25} busy={false} onChange={change} />)
    expect(screen.getByRole('button',{name:'Previous'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'Next'}))
    expect(change).toHaveBeenCalledWith(25)
  })
})

it('reads rule versions and weights from the API', async () => {
  vi.spyOn(api,'rules').mockResolvedValue([{code:'EMAIL-001',signal_type:'email',title:'Reply-to mismatch',weight:0.45,confidence:0.95,version:2,enabled:true,configuration:{matcher:'different'}}])
  render(<RuleCatalogue credentials={credentials} />)
  await screen.findByText('Reply-to mismatch')
  expect(screen.getByText(/version 2/)).toBeInTheDocument()
  expect(screen.getByText('0.45')).toBeInTheDocument()
  expect(screen.getByText(/number of enabled rules does not establish detection accuracy/)).toBeInTheDocument()
})
