/* eslint-disable react-refresh/only-export-components -- shared presentational primitives */
import type { ReactNode } from 'react'
import { Icons } from '../icons'
import type { Severity } from '../types'
import { humanize } from '../utils'

export const severities: Severity[] = ['critical', 'high', 'medium', 'low']

export function SeverityBadge({ severity, suffix }: { severity: Severity; suffix?: string }) {
  return <span className={`badge sev sev-${severity}`}><i aria-hidden="true" />{humanize(severity)}{suffix ? ` ${suffix}` : ''}</span>
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge state state-${status.toLowerCase()}`}>{humanize(status)}</span>
}

export function Panel({ children, className = '', label, labelledBy }: { children: ReactNode; className?: string; label?: string; labelledBy?: string }) {
  return <section aria-label={label} aria-labelledby={labelledBy} className={`panel ${className}`}>{children}</section>
}

export function PanelHeading({ title, id, meta, action }: { title: string; id?: string; meta?: ReactNode; action?: ReactNode }) {
  return <div className="panel-heading"><div><h2 id={id}>{title}</h2>{meta && <p className="panel-meta">{meta}</p>}</div>{action}</div>
}

export function PageHeader({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return <header className="page-header"><div><h1>{title}</h1>{lead && <p className="page-lead">{lead}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>
}

export function LoadingRows({ count = 3, label = 'Loading' }: { count?: number; label?: string }) {
  return <div aria-label={label} className="loading-list" role="status">{Array.from({ length: count }, (_, index) => <div className="skeleton-row" key={index}><span /><span /></div>)}</div>
}

export function ErrorState({ message, retry, title = 'This view could not load' }: { message: string; retry?: () => void; title?: string }) {
  return <div className="state-card state-error" role="alert"><span className="state-icon"><Icons.alert /></span><h3>{title}</h3><p>{message}</p>{retry && <button className="button button-secondary" onClick={retry} type="button"><Icons.refresh />Try again</button>}</div>
}

export function EmptyState({ icon = <Icons.shield />, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="state-card"><span className="state-icon">{icon}</span><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>
}

export function Notice({ tone = 'info', title, children, action }: { tone?: 'info' | 'warning' | 'success'; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className={`notice notice-${tone}`}><span className="notice-icon">{tone === 'warning' ? <Icons.alert /> : tone === 'success' ? <Icons.check /> : <Icons.info />}</span><div><strong>{title}</strong>{children && <p>{children}</p>}</div>{action}</div>
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}
