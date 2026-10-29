import { afterEach, expect, it, vi } from 'vitest'
import { api } from './api'

afterEach(() => vi.unstubAllGlobals())
it('uses same-origin cookies and sends the app CSRF token with mutations', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetch)
  await api.logout({ apiKey: '', tenantId: 'assigned', csrfToken: 'csrf' })
  expect(fetch).toHaveBeenCalledWith('/api/v1/auth/logout', expect.objectContaining({ method: 'POST', credentials: 'same-origin', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf' }) }))
})
it('notifies the auth gate when an authenticated request expires', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))
  const listener = vi.fn()
  window.addEventListener('sentinelsme:session-expired', listener)
  try {
    await expect(api.accounts({ apiKey: '', tenantId: 'assigned', csrfToken: 'csrf' })).rejects.toMatchObject({ status: 401 })
    expect(listener).toHaveBeenCalledOnce()
  } finally { window.removeEventListener('sentinelsme:session-expired', listener) }
})
