import { useId, useRef, type ReactNode } from 'react'
import { Icons } from '../icons'
import { useFocusTrap } from './hooks'

export function Modal({ title, description, onClose, children, tone = 'default' }: { title: string; description?: string; onClose: () => void; children: ReactNode; tone?: 'default' | 'danger' }) {
  const dialog = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const id = useId()
  useFocusTrap(dialog, true, onClose, closeButton)
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialog} aria-describedby={description ? `${id}-description` : undefined} aria-labelledby={`${id}-title`} aria-modal="true" className={`modal modal-${tone}`} role="dialog">
      <header className="modal-header">
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          {description && <p id={`${id}-description`}>{description}</p>}
        </div>
        <button aria-label="Close dialog" className="icon-button" onClick={onClose} ref={closeButton} type="button"><Icons.close /></button>
      </header>
      {children}
    </section>
  </div>
}
