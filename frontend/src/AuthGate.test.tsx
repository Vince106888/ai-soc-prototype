import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AuthGate from './AuthGate'
import { api } from './api'
import type { AuthSession } from './types'

vi.mock('./App', () => ({ default: ({ session, onSignOut, onLocalDisconnect }: { session?: AuthSession; onSignOut?: () => Promise<void>; onLocalDisconnect?: () => void }) => <div><p>Workspace: {session?.user?.workspace_id ?? 'local'}</p><button onClick={() => void (onSignOut?.() ?? onLocalDisconnect?.())}>Close test session</button></div> }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })
const pilot: AuthSession = { mode: 'google', configured: true, invitation_only: true, session_hours: 8, mailbox_consent_separate: true, user: null, csrf_token: '' }
const signedIn: AuthSession = { ...pilot, user: { id: 'user-a', email: 'invited@example.test', workspace_id: 'assigned-workspace' }, csrf_token: 'session-csrf' }

describe('onboarding and sign-in boundary', () => {
  it('checks the server before opening stored workspaces and shows Google sign-in', async () => {
    sessionStorage.setItem('sentinelsme.tenantId', 'somebody-else')
    vi.spyOn(api, 'session').mockResolvedValue(pilot)
    render(<AuthGate />)
    expect(screen.queryByText('Workspace: local')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
    expect(screen.queryByLabelText('Workspace ID')).not.toBeInTheDocument()
    expect(screen.getByText(/Gmail access is requested separately/)).toBeInTheDocument()
  })
  it('blocks entry on unavailable setup and retains sign-in failures', async () => {
    window.history.replaceState(null, '', '/?signin=failed')
    vi.spyOn(api, 'session').mockResolvedValue({ ...pilot, configured: false })
    render(<AuthGate />)
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('operator has invited')
    await waitFor(() => expect(window.location.search).toBe(''))
  })
  it('reports login errors without losing the welcome screen', async () => {
    vi.spyOn(api, 'session').mockResolvedValue(pilot)
    vi.spyOn(api, 'login').mockRejectedValue(new Error('Sign-in service unavailable'))
    render(<AuthGate />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in service unavailable')
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
  })
  it('uses only the assigned workspace and removes the dashboard on sign-out', async () => {
    sessionStorage.setItem('sentinelsme.tenantId', 'old-local-workspace')
    vi.spyOn(api, 'session').mockResolvedValue(signedIn)
    const logout = vi.spyOn(api, 'logout').mockResolvedValue(undefined)
    render(<AuthGate />)
    expect(await screen.findByText('Workspace: assigned-workspace')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close test session' }))
    await screen.findByRole('button', { name: 'Sign in with Google' })
    expect(logout).toHaveBeenCalledWith({ apiKey: '', tenantId: 'assigned-workspace', csrfToken: 'session-csrf' })
    expect(screen.queryByText('Workspace: assigned-workspace')).not.toBeInTheDocument()
    expect(sessionStorage.getItem('sentinelsme.tenantId')).toBeNull()
  })
  it('clears private views immediately on expiry and checks again on focus', async () => {
    const session = vi.spyOn(api, 'session').mockResolvedValueOnce(signedIn).mockResolvedValue(pilot)
    render(<AuthGate />)
    await screen.findByText('Workspace: assigned-workspace')
    fireEvent(window, new Event('sentinelsme:session-expired'))
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeVisible()
    expect(screen.queryByText('Workspace: assigned-workspace')).not.toBeInTheDocument()
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(session).toHaveBeenCalledTimes(2))
  })
  it('fails closed on session-check errors and offers retry', async () => {
    vi.spyOn(api, 'session').mockRejectedValueOnce(new Error('Service offline')).mockResolvedValue(pilot)
    render(<AuthGate />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Service offline')
    expect(screen.queryByText(/Workspace:/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('button', { name: 'Sign in with Google' })
  })
  it('does not restore a signed-out workspace from an older session check', async () => {
    let release: ((value: AuthSession) => void) | undefined
    const pending = new Promise<AuthSession>(resolve => { release = resolve })
    vi.spyOn(api, 'session').mockResolvedValueOnce(signedIn).mockReturnValueOnce(pending)
    vi.spyOn(api, 'logout').mockResolvedValue(undefined)
    render(<AuthGate />)
    await screen.findByText('Workspace: assigned-workspace')
    fireEvent(window, new Event('focus'))
    fireEvent.click(screen.getByRole('button', { name: 'Close test session' }))
    await screen.findByRole('button', { name: 'Sign in with Google' })
    release?.(signedIn)
    await waitFor(() => expect(screen.queryByText('Workspace: assigned-workspace')).not.toBeInTheDocument())
  })
  it('keeps the local demo available without Google and explains its access limit', async () => {
    vi.spyOn(api, 'session').mockResolvedValue({ ...pilot, mode: 'local', configured: false })
    render(<AuthGate />)
    await screen.findByRole('button', { name: 'Start a local demo' })
    expect(screen.getByText(/no user authentication/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start a local demo' }))
    expect(await screen.findByText('Workspace: local')).toBeInTheDocument()
    expect(sessionStorage.getItem('sentinelsme.tenantId')).toMatch(/^demo-/)
    fireEvent.click(screen.getByRole('button', { name: 'Close test session' }))
    await screen.findByRole('button', { name: 'Start a local demo' })
  })
})
