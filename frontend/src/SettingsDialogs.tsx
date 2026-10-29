import { useState } from 'react'
import { Icons } from './icons'
import { InlineNotice, Modal } from './ui'
import type { Account, AuthSession, Credentials } from './types'
import { accountLabel } from './utils'

export function LocalSettingsModal({
  currentTenant,
  currentKey,
  onClose,
  onSave,
  onClear,
}: {
  currentTenant: string
  currentKey: string
  onClose: () => void
  onSave: (credentials: Credentials) => void
  onClear: () => void
}) {
  const [key, setKey] = useState(currentKey)
  const [tenantId, setTenantId] = useState(currentTenant)
  const connected = Boolean(currentTenant)
  const hasKey = Boolean(currentKey)

  return (
    <Modal
      description="Open a controlled local workspace. Local mode is not a production authentication system."
      onClose={onClose}
      title="Local workspace connection"
    >
      <form className="modal-form" onSubmit={(event) => {
        event.preventDefault()
        if (tenantId.trim()) onSave({ apiKey: key.trim(), tenantId: tenantId.trim() })
      }}>
        <div className={`connection-status ${connected ? 'connected' : ''}`}>
          <span aria-hidden="true" />
          <div>
            <strong>{connected ? hasKey ? 'Workspace key configured' : 'Local workspace open' : 'No workspace open'}</strong>
            <p>{connected ? `Requests are scoped to ${currentTenant}.` : 'Choose a workspace to open the console.'}</p>
          </div>
        </div>
        <label htmlFor="settings-tenant">Workspace ID</label>
        <input autoComplete="organization" id="settings-tenant" onChange={(event) => setTenantId(event.target.value)} placeholder="Your workspace ID" value={tenantId} />
        <label htmlFor="settings-key">Deployment key <span>(only if required)</span></label>
        <input autoComplete="off" id="settings-key" onChange={(event) => setKey(event.target.value)} placeholder="Deployment key" type="password" value={key} />
        <p className="field-help"><Icons.lock aria-hidden="true" />Values stay in this browser session only—never local storage.</p>
        <InlineNotice tone="warning" title="Local workspace boundary">
          The workspace ID is caller-selected. Use this mode only on a trusted computer with controlled samples.
        </InlineNotice>
        <footer className="modal-actions">
          {connected && <button className="button button-danger" onClick={onClear} type="button">Close workspace</button>}
          <span />
          <button className="button button-secondary" onClick={onClose} type="button">Cancel</button>
          <button className="button button-primary" disabled={!tenantId.trim()} type="submit">Open workspace</button>
        </footer>
      </form>
    </Modal>
  )
}

export function SessionModal({
  session,
  onClose,
  onSignOut,
  onDelete,
  onShowGuide,
  onOpenConnections,
}: {
  session: AuthSession
  onClose: () => void
  onSignOut: () => Promise<void>
  onDelete: () => Promise<void>
  onShowGuide: () => void
  onOpenConnections: () => void
}) {
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const email = session.user?.email ?? 'Signed-in account'

  return (
    <Modal
      description="Manage your signed-in account, private workspace and retention."
      onClose={onClose}
      title="Account & privacy"
      size="large"
    >
      <div className="account-summary">
        <span className="account-summary-avatar" aria-hidden="true">{email.slice(0, 2).toUpperCase()}</span>
        <div>
          <strong>{email}</strong>
          <p>Private workspace · session lasts up to {session.session_hours} hours</p>
        </div>
        <span className="status-pill success"><Icons.check aria-hidden="true" />Signed in</span>
      </div>

      <div className="account-actions-grid">
        <button className="account-action" onClick={onShowGuide} type="button">
          <span><Icons.scan aria-hidden="true" /></span>
          <strong>Getting started</strong>
          <small>Revisit the first-run guide</small>
          <Icons.arrow aria-hidden="true" />
        </button>
        <button className="account-action" onClick={onOpenConnections} type="button">
          <span><Icons.building aria-hidden="true" /></span>
          <strong>Connections</strong>
          <small>Gmail and controlled sources</small>
          <Icons.arrow aria-hidden="true" />
        </button>
        <a className="account-action" href="/privacy">
          <span><Icons.lock aria-hidden="true" /></span>
          <strong>Privacy & retention</strong>
          <small>{session.evidence_retention_days ?? 30}-day evidence retention</small>
          <Icons.arrow aria-hidden="true" />
        </a>
      </div>

      <p className="session-help">
        Signing out closes this app session. It does not disconnect Gmail or delete retained evidence. Use
        Connections for provider access and Account deletion for the full workspace.
      </p>

      <details className="danger-zone">
        <summary>Delete your account and workspace</summary>
        <div>
          <p>This permanently deletes your app account and retained workspace data and signs out every session. To revoke Google permissions, disconnect Gmail first or remove access in your Google account settings.</p>
          <label htmlFor="delete-confirmation">Type DELETE to confirm</label>
          <input id="delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
          <button
            className="button button-danger"
            disabled={busy || confirmation !== 'DELETE'}
            onClick={() => {
              setBusy(true)
              setError('')
              void onDelete().catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : 'Could not delete your account.')
              }).finally(() => setBusy(false))
            }}
            type="button"
          >
            Delete account permanently
          </button>
        </div>
      </details>

      {error && <InlineNotice tone="danger" title="Account deletion failed">{error}</InlineNotice>}
      <footer className="modal-actions">
        <button className="button button-secondary" onClick={onClose} type="button">Close</button>
        <span />
        <button className="button button-primary" disabled={busy} onClick={() => {
          setBusy(true)
          setError('')
          void onSignOut().catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : 'Could not sign out.')
          }).finally(() => setBusy(false))
        }} type="button">
          {busy ? 'Working…' : 'Sign out'}
        </button>
      </footer>
    </Modal>
  )
}

export function DeleteAccountDataModal({
  account,
  busy,
  onClose,
  onDelete,
}: {
  account: Account
  busy: boolean
  onClose: () => void
  onDelete: () => void
}) {
  return (
    <Modal
      description="This removes the local account, its sources, provider tokens, signals, incidents, recommendations and audit details."
      onClose={onClose}
      title={`Delete ${accountLabel(account)}?`}
    >
      <InlineNotice tone="warning" title="This cannot be undone">
        This does not delete anything from Gmail. Disconnect Gmail first if you also want to request provider revocation.
      </InlineNotice>
      <p className="muted-copy">A minimal opaque deletion receipt may remain. Private backups can retain older evidence until the operator expires them.</p>
      <div className="modal-actions">
        <button className="button button-secondary" onClick={onClose} type="button">Cancel</button>
        <span />
        <button className="button button-danger" disabled={busy} onClick={onDelete} type="button">
          {busy ? 'Deleting…' : 'Delete local account data'}
        </button>
      </div>
    </Modal>
  )
}
