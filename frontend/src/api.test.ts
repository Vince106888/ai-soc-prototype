import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'

const credentials = { apiKey: 'secret', tenantId: 'acme' }

afterEach(() => vi.restoreAllMocks())

describe('API client', () => {
  it('sends tenant-scoped auth and maps the incident search query', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await api.incidents(credentials, { severity: 'critical', status: 'new', q: 'invoice' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/incidents?severity=critical&status=new&search=invoice')
    expect(init?.headers).toMatchObject({ 'X-API-Key': 'secret', 'X-Tenant-ID': 'acme' })
  })

  it('uses the auditable lifecycle contract', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: '1', status: 'under_review' }), { status: 200 }),
    )

    await api.updateStatus(credentials, '1', 'under_review', 'Review started')

    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({
      status: 'under_review',
      actor: 'console-user',
      note: 'Review started',
    })
  })

  it('parses the aggregate capabilities contract', async () => {
    const capabilityResponse = {
      service: 'SentinelSME', signal_types: ['email'], source_types: ['controlled'],
      live_connectors: [], controlled_ingestion: true, template_explanations: true,
      ai_explanations: false, correlation_window_minutes: 30, maximum_batch_size: 500,
      privacy: { stores_full_bodies: false, stores_attachments: false },
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(capabilityResponse), { status: 200 }),
    )

    await expect(api.capabilities(credentials)).resolves.toEqual(capabilityResponse)
  })
})
