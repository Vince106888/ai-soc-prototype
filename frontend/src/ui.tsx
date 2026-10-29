import { useEffect, useId, useRef, type HTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icons } from './icons'
import type { IncidentStatus, Severity } from './types'
import { humanize } from './utils'

export function Brand({ subtitle, inverse = false }: { subtitle?: string; inverse?: boolean }) {
  return (
    <div className={`brand ${inverse ? 'brand-inverse' : ''}`}>
      <span className="brand-mark" aria-hidden="true"><Icons.shield /></span>
      <span className="brand-copy">
        <strong>Linda<span>Biz</span></strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  compact = false,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  compact?: boolean
}) {
  return (
    <header className={`page-header ${compact ? 'compact' : ''}`}>
      <div className="page-header-copy">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  )
}

export function Panel({ children, className = '', as: Tag = 'section', ...attributes }: HTMLAttributes<HTMLElement> & { children: ReactNode; as?: 'section' | 'div' | 'article' }) {
  return <Tag className={`panel ${className}`} {...attributes}>{children}</Tag>
}

export function SectionHeading({ eyebrow, title, meta, action }: { eyebrow?: string; title: string; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      <div className="panel-heading-meta">
        {meta}
        {action}
      </div>
    </div>
  )
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`badge severity severity-${severity}`}><span aria-hidden="true" />{severity} priority</span>
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge status status-${status.toLowerCase()}`}>{humanize(status)}</span>
}

export function MetricCard({
  label,
  value,
  caption,
  tone = 'blue',
  icon,
  onClick,
  busy = false,
}: {
  label: string
  value: number | undefined
  caption: string
  tone?: 'blue' | 'red' | 'amber' | 'neutral'
  icon?: ReactNode
  onClick: () => void
  busy?: boolean
}) {
  return (
    <button
      type="button"
      className={`panel stat-card stat-${tone}`}
      onClick={onClick}
      aria-label={`${label}: ${busy ? 'loading' : value ?? 'unavailable'}. ${caption}`}
    >
      <span className="stat-icon" aria-hidden="true">{icon ?? <Icons.activity />}</span>
      <span className="stat-copy">
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{busy ? '—' : value ?? '—'}</strong>
        <span className="stat-caption">{caption}</span>
      </span>
      <Icons.arrow className="stat-arrow" aria-hidden="true" />
    </button>
  )
}

export function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  icon,
  className = '',
}: {
  title: string
  description: string
  action?: ReactNode
  secondaryAction?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={`state-card ${className}`}>
      <span className="state-icon" aria-hidden="true">{icon ?? <Icons.shield />}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {(action || secondaryAction) && <div className="state-actions">{action}{secondaryAction}</div>}
    </div>
  )
}

export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="state-card error-state" role="alert">
      <span className="state-icon error-icon" aria-hidden="true"><Icons.alert /></span>
      <h3>We could not load this view</h3>
      <p>{message}</p>
      <button className="button button-secondary" onClick={retry}><Icons.refresh />Try again</button>
    </div>
  )
}

export function LoadingRows({ count = 3, label = 'Loading' }: { count?: number; label?: string }) {
  return (
    <div aria-label={label} className="loading-list" role="status">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-row" key={index} aria-hidden="true"><span /><span /><span /></div>
      ))}
    </div>
  )
}

export function InlineNotice({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success'
  title?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={`inline-notice notice-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="notice-icon" aria-hidden="true">
        {tone === 'danger' ? <Icons.alert /> : tone === 'success' ? <Icons.check /> : tone === 'warning' ? <Icons.alert /> : <Icons.info />}
      </span>
      <div className="notice-copy">
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
      {action}
    </div>
  )
}

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button type="button" className="filter-chip" onClick={onRemove} aria-label={`Remove filter: ${label}`}>
      {label}<Icons.close aria-hidden="true" />
    </button>
  )
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string; description?: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented-control" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={value === option.value ? 'selected' : ''}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          <strong>{option.label}</strong>
          {option.description && <span>{option.description}</span>}
        </button>
      ))}
    </div>
  )
}

export function Modal({
  title,
  description,
  onClose,
  children,
  size = 'medium',
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  size?: 'small' | 'medium' | 'large'
}) {
  const titleId = useId()
  const descriptionId = useId()
  const closeButton = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    root?.setAttribute('inert', '')
    const frame = window.requestAnimationFrame(() => closeButton.current?.focus())
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close.current()
        return
      }
      if (event.key !== 'Tab') return
      const controls = dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])',
      )
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
      root?.removeAttribute('inert')
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialog}
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`modal modal-${size}`}
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow">LindaBiz</p>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button aria-label="Close dialog" className="icon-button" onClick={onClose} ref={closeButton} type="button">
            <Icons.close />
          </button>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  )
}

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div aria-live="polite" className="toast" role="status">
      <Icons.check aria-hidden="true" />
      <span>{message}</span>
      <button aria-label="Dismiss notification" onClick={onDismiss} type="button"><Icons.close /></button>
    </div>
  )
}

export function IncidentStatusLabel({ status }: { status: IncidentStatus }) {
  return <StatusBadge status={status} />
}
