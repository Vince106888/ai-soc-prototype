import { useState } from 'react'
import { Icons } from './icons'
import { Modal } from './ui'
import type { Account, CapabilityProfile, SignalType } from './types'
import { accountLabel, humanize } from './utils'

export interface SourceDraft {
  accountId?: string
  email?: string
  displayName?: string
  name: string
  externalId: string
  capabilities: SignalType[]
}

const signalTypes: SignalType[] = ['email', 'forwarding', 'signin', 'mfa', 'oauth_grant']

export function AddSourceModal({
  accounts,
  profile,
  onClose,
  onCreate,
}: {
  accounts: Account[]
  profile: CapabilityProfile | null
  onClose: () => void
  onCreate: (draft: SourceDraft) => Promise<void>
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '__new__')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [name, setName] = useState('Controlled signal source')
  const [externalId, setExternalId] = useState('')
  const supported = signalTypes.filter((item) => profile?.signal_types.includes(item) ?? true)
  const [selected, setSelected] = useState<SignalType[]>(supported)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const creatingAccount = accountId === '__new__'
  const valid = Boolean(name.trim() && externalId.trim() && selected.length && confirmed && (!creatingAccount || email.trim()))
  const toggle = (capability: SignalType) => {
    setSelected((current) => current.includes(capability)
      ? current.filter((item) => item !== capability)
      : [...current, capability])
  }

  return (
    <Modal
      description="Register a minimal source for synthetic, controlled or explicitly authorised signals. This does not connect Gmail."
      onClose={onClose}
      title="Add a controlled source"
      size="large"
    >
      <form className="modal-form" onSubmit={(event) => {
        event.preventDefault()
        if (!valid) return
        setBusy(true)
        setFormError('')
        void onCreate({
          accountId: creatingAccount ? undefined : accountId,
          email: email.trim(),
          displayName: displayName.trim(),
          name: name.trim(),
          externalId: externalId.trim(),
          capabilities: selected,
        }).then(onClose).catch((reason: unknown) => {
          setFormError(reason instanceof Error ? reason.message : 'Could not add the source.')
        }).finally(() => setBusy(false))
      }}>
        <div className="scope-note">
          <Icons.shield aria-hidden="true" />
          <div>
            <strong>Controlled data only</strong>
            <p>This records source metadata and accepted signal types. It does not authorise a live mailbox connection.</p>
          </div>
        </div>

        <label htmlFor="source-account">Protected account</label>
        <select id="source-account" onChange={(event) => setAccountId(event.target.value)} value={accountId}>
          {accounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
          <option value="__new__">Create a new account</option>
        </select>

        {creatingAccount && (
          <div className="form-grid">
            <label htmlFor="account-name">Display name <span>(optional)</span>
              <input id="account-name" onChange={(event) => setDisplayName(event.target.value)} placeholder="Finance team" value={displayName} />
            </label>
            <label htmlFor="account-email">Account email
              <input id="account-email" onChange={(event) => setEmail(event.target.value)} placeholder="security@example.test" required type="email" value={email} autoComplete="email" />
            </label>
          </div>
        )}

        <div className="form-grid">
          <label htmlFor="source-name">Source name
            <input id="source-name" onChange={(event) => setName(event.target.value)} required value={name} />
          </label>
          <label htmlFor="source-external-id">Source identifier
            <input id="source-external-id" onChange={(event) => setExternalId(event.target.value)} placeholder="source-01" required value={externalId} />
          </label>
        </div>

        <fieldset className="capability-picker">
          <legend>Accepted signal types</legend>
          {supported.map((capability) => (
            <label className="capability-check" key={capability}>
              <input checked={selected.includes(capability)} onChange={() => toggle(capability)} type="checkbox" />
              <span><strong>{humanize(capability)}</strong><small>Normalised metadata only</small></span>
            </label>
          ))}
        </fieldset>

        <label className="check-field">
          <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
          <span>I confirm this source contains only synthetic, controlled or explicitly authorised data.</span>
        </label>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <footer className="modal-actions">
          <span />
          <button className="button button-secondary" onClick={onClose} type="button">Cancel</button>
          <button className="button button-primary" disabled={!valid || busy} type="submit">
            {busy ? 'Adding…' : 'Add source'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
