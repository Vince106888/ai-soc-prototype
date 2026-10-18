import { forwardRef, type ReactNode } from 'react'
import { Icons } from '../icons'
import type { Section } from '../ui/router'

interface Item { section: Section; label: string; icon: ReactNode; count?: number }

export const Sidebar = forwardRef<HTMLElement, {
  section: Section
  open: boolean
  compact: boolean
  openCount: number
  collection: { title: string; detail: string; live: boolean }
  onNavigate: (section: Section) => void
  onSettings: () => void
}>(function Sidebar({ section, open, compact, openCount, collection, onNavigate, onSettings }, ref) {
  const groups: Array<{ label: string; items: Item[] }> = [
    { label: 'Investigate', items: [
      { section: 'overview', label: 'Overview', icon: <Icons.grid /> },
      { section: 'incidents', label: 'Incidents', icon: <Icons.alert />, count: openCount },
      { section: 'evidence', label: 'Evidence', icon: <Icons.search /> },
    ] },
    { label: 'Collect', items: [
      { section: 'analysis', label: 'Email analysis', icon: <Icons.mail /> },
      { section: 'sources', label: 'Accounts & sources', icon: <Icons.building /> },
    ] },
    { label: 'Configure', items: [
      { section: 'protection', label: 'Protection coverage', icon: <Icons.shield /> },
      { section: 'rules', label: 'Detection rules', icon: <Icons.rules /> },
    ] },
  ]
  return <aside ref={ref} inert={compact && !open} className={`sidebar ${open ? 'is-open' : ''}`}>
    <div className="brand"><span className="brand-mark" aria-hidden="true"><Icons.shield /></span><div><strong>SentinelSME</strong><small>Email security workspace</small></div></div>
    <nav aria-label="Primary navigation">
      {groups.map(group => <div className="nav-group" key={group.label}>
        <span className="nav-group-label" aria-hidden="true">{group.label}</span>
        {group.items.map(item => <button aria-current={section === item.section ? 'page' : undefined} className="nav-item" key={item.section} onClick={() => onNavigate(item.section)} type="button">
          {item.icon}<span>{item.label}</span>{item.count ? <span className="nav-count">{item.count}<span className="sr-only"> open</span></span> : null}
        </button>)}
      </div>)}
    </nav>
    <div className="sidebar-footer">
      <div className="collection-state"><span className={`collection-dot ${collection.live ? 'is-live' : ''}`} aria-hidden="true" /><div><strong>{collection.title}</strong><small>{collection.detail}</small></div></div>
      <button className="nav-item" onClick={onSettings} type="button"><Icons.settings /><span>Settings</span></button>
    </div>
  </aside>
})
