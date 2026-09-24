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

    await api.incidents(credentials, { severity: 'critical', status: 'open', q: 'invoice' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/incidents?severity=critical&status=open&search=invoice')
    expect(init?.headers).toMatchObject({ 'X-API-Key': 'secret', 'X-Tenant-ID': 'acme' })
  })

  it('uses the auditable lifecycle contract', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: '1', status: 'contained' }), { status: 200 }),
    )

    await api.updateStatus(credentials, '1', 'contained', 'Mailbox isolated')

    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({
      status: 'contained',
      actor: 'console-user',
      note: 'Mailbox isolated',
    })
  })
})
