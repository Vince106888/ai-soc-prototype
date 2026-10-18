import { useState } from 'react'
import { Icons } from './icons'
import type { Account, CapabilityProfile, Credentials, SignalType } from './types'
import { Modal } from './ui/Modal'
import { Kbd } from './ui/primitives'
import { accountLabel, humanize } from './utils'

const signalTypes: SignalType[] = ['email', 'forwarding', 'signin', 'mfa', 'oauth_grant']

export function SettingsModal({ currentTenant, currentKey, onClose, onSave, onClear }: { currentTenant: string; currentKey: string; onClose: () => void; onSave: (credentials: Credentials) => void; onClear: () => void }) {
  const [key, setKey] = useState(currentKey)
  const [tenantId, setTenantId] = useState(currentTenant)
  const connected = Boolean(currentTenant)
  return <Modal description="Choose the workspace this browser tab opens. Requests are scoped to it." onClose={onClose} title="Workspace connection">
    <form className="modal-body form-stack" onSubmit={event => { event.preventDefault(); if (tenantId.trim()) onSave({ apiKey: key.trim(), tenantId: tenantId.trim() }) }}>
      <div className={`connection-status ${connected ? 'is-connected' : ''}`}><span aria-hidden="true" /><div><strong>{connected ? currentKey ? 'Connected with an API key' : 'Local workspace open' : 'No workspace open'}</strong><p>{connected ? `Requests are scoped to ${currentTenant}.` : 'Enter a workspace ID to open the console.'}</p></div></div>
      <div className="field"><label htmlFor="settings-tenant">Workspace ID</label><input autoComplete="organization" id="settings-tenant" onChange={event => setTenantId(event.target.value)} placeholder="Your workspace ID" value={tenantId} /></div>
      <div className="field"><label htmlFor="settings-key">API key <span className="optional">optional in local mode</span></label><input autoComplete="off" id="settings-key" onChange={event => setKey(event.target.value)} placeholder="Deployment API key" type="password" value={key} />
        <p className="field-help"><Icons.lock />Kept in this tab’s session storage only, never in local storage.</p></div>
      <footer className="modal-actions">{connected && <button className="button button-danger-quiet" onClick={onClear} type="button">Disconnect</button>}<span className="spacer" /><button className="button button-secondary" onClick={onClose} type="button">Cancel</button><button className="button button-primary" disabled={!tenantId.trim()} type="submit">Save & connect</button></footer>
    </form>
  </Modal>
}

export interface SourceDraft {
  accountId?: string
  email?: string
  displayName?: string
  name: string
  externalId: string
  capabilities: SignalType[]
}

export function AddSourceModal({ accounts, profile, onClose, onCreate }: { accounts: Account[]; profile: CapabilityProfile | null; onClose: () => void; onCreate: (draft: SourceDraft) => Promise<void> }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '__new__')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [name, setName] = useState('Controlled signal source')
  const [externalId, setExternalId] = useState('')
  const supported = signalTypes.filter(item => profile?.signal_types.includes(item) ?? true)
  const [selected, setSelected] = useState<SignalType[]>(supported)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const creatingAccount = accountId === '__new__'
  const valid = Boolean(name.trim() && externalId.trim() && selected.length && confirmed && (!creatingAccount || email.trim()))
  const toggle = (capability: SignalType) => setSelected(current => current.includes(capability) ? current.filter(item => item !== capability) : [...current, capability])
  return <Modal description="Register a source for synthetic or authorised signals. Gmail has its own consent flow under Email analysis." onClose={onClose} title="Add a controlled source">
    <form className="modal-body form-stack" onSubmit={event => {
      event.preventDefault(); if (!valid) return
      setBusy(true); setFormError('')
      void onCreate({ accountId: creatingAccount ? undefined : accountId, email: email.trim(), displayName: displayName.trim(), name: name.trim(), externalId: externalId.trim(), capabilities: selected })
        .then(onClose).catch((reason: unknown) => setFormError(reason instanceof Error ? reason.message : 'Could not add the source.')).finally(() => setBusy(false))
    }}>
      <p className="inline-note"><Icons.info />This records source details and accepted signal types. It does not connect a live mailbox.</p>
      <div className="field"><label htmlFor="source-account">Account</label><select id="source-account" onChange={event => setAccountId(event.target.value)} value={accountId}>{accounts.map(account => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}<option value="__new__">Create a new account</option></select></div>
      {creatingAccount && <div className="form-grid"><div className="field"><label htmlFor="account-name">Display name <span className="optional">optional</span></label><input id="account-name" onChange={event => setDisplayName(event.target.value)} placeholder="Finance team" value={displayName} /></div><div className="field"><label htmlFor="account-email">Account email</label><input id="account-email" onChange={event => setEmail(event.target.value)} placeholder="security@example.test" required type="email" value={email} /></div></div>}
      <div className="form-grid"><div className="field"><label htmlFor="source-name">Source name</label><input id="source-name" onChange={event => setName(event.target.value)} required value={name} /></div><div className="field"><label htmlFor="source-external-id">External ID</label><input id="source-external-id" onChange={event => setExternalId(event.target.value)} placeholder="controlled-demo-01" required value={externalId} /></div></div>
      <fieldset className="choice-grid"><legend>Accepted signal types</legend>{supported.map(capability => <label className="choice-tile" key={capability}><input checked={selected.includes(capability)} onChange={() => toggle(capability)} type="checkbox" /><span>{humanize(capability)}</span></label>)}</fieldset>
      <label className="consent"><input checked={confirmed} onChange={event => setConfirmed(event.target.checked)} type="checkbox" /><span>I confirm this source contains only synthetic, controlled, or explicitly authorised data.</span></label>
      {formError && <p className="form-error" role="alert">{formError}</p>}
      <footer className="modal-actions"><span className="spacer" /><button className="button button-secondary" onClick={onClose} type="button">Cancel</button><button className="button button-primary" disabled={!valid || busy} type="submit">{busy ? 'Adding source…' : 'Add source'}</button></footer>
    </form>
  </Modal>
}

export function SessionModal({ email, hours, onClose, onSignOut }: { email: string; hours: number; onClose: () => void; onSignOut: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <Modal title="Your account" description="Your workspace is assigned to your Google identity." onClose={onClose}>
    <div className="modal-body form-stack">
      <div className="connection-status is-connected"><span aria-hidden="true" /><div><strong>{email}</strong><p>Invited pilot. A session lasts up to {hours} hours.</p></div></div>
      <p className="muted">Signing out ends this app session. To revoke Gmail access or delete collected evidence, use Accounts &amp; sources.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="modal-actions"><span className="spacer" /><button className="button button-secondary" onClick={onClose} type="button">Close</button><button className="button button-primary" disabled={busy} onClick={() => { setBusy(true); setError(''); void onSignOut().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not sign out.')).finally(() => setBusy(false)) }} type="button">{busy ? 'Signing out…' : 'Sign out'}</button></footer>
    </div>
  </Modal>
}

export function DeleteAccountModal({ account, busy, onClose, onConfirm }: { account: Account; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return <Modal tone="danger" title={`Delete local data for ${accountLabel(account)}?`} description="This removes the account’s local sources, tokens, signals, incidents, recommendations and audit details. Nothing is deleted from Gmail." onClose={onClose}>
    <div className="modal-body form-stack">
      <p className="muted">Disconnect Gmail first if you also want Google to revoke access. This deletion cannot be undone.</p>
      <footer className="modal-actions"><span className="spacer" /><button className="button button-secondary" onClick={onClose} type="button">Cancel</button><button className="button button-danger" disabled={busy} onClick={onConfirm} type="button">{busy ? 'Deleting…' : 'Delete local data'}</button></footer>
    </div>
  </Modal>
}

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const rows: Array<[string[], string]> = [
    [['/'], 'Search incidents'],
    [['j'], 'Next incident in the queue'],
    [['k'], 'Previous incident in the queue'],
    [['g', 'o'], 'Go to Overview'],
    [['g', 'i'], 'Go to Incidents'],
    [['g', 'e'], 'Go to Evidence'],
    [['g', 'a'], 'Go to Email analysis'],
    [['?'], 'Show this list'],
    [['Esc'], 'Close a dialog or the menu'],
  ]
  return <Modal title="Keyboard shortcuts" description="Shortcuts work when you are not typing in a field." onClose={onClose}>
    <div className="modal-body"><table className="shortcut-table"><tbody>{rows.map(([keys, action]) => <tr key={action}><td>{keys.map((key, index) => <span key={key}>{index > 0 && <span className="then">then</span>}<Kbd>{key}</Kbd></span>)}</td><td>{action}</td></tr>)}</tbody></table></div>
  </Modal>
}
