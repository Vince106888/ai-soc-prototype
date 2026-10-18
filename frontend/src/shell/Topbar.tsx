import { forwardRef } from 'react'
import { Icons } from '../icons'
import { Kbd } from '../ui/primitives'
import { useTheme, type ThemePreference } from '../ui/theme'

const nextTheme: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' }
const themeLabel: Record<ThemePreference, string> = { system: 'Match system', light: 'Light', dark: 'Dark' }

export const Topbar = forwardRef<HTMLButtonElement, {
  menuOpen: boolean
  search: string
  workspace: string
  signedIn: boolean
  mode: string
  canAnalyse: boolean
  searchInput: React.RefObject<HTMLInputElement | null>
  onMenu: () => void
  onSearch: (value: string) => void
  onSearchSubmit: () => void
  onAnalyse: () => void
  onSettings: () => void
  onShortcuts: () => void
}>(function Topbar({ menuOpen, search, workspace, signedIn, mode, canAnalyse, searchInput, onMenu, onSearch, onSearchSubmit, onAnalyse, onSettings, onShortcuts }, menuButton) {
  const [theme, setTheme] = useTheme()
  const ThemeIcon = theme === 'dark' ? Icons.moon : theme === 'light' ? Icons.sun : Icons.monitor
  return <header className="topbar">
    <button ref={menuButton} aria-label="Open navigation" aria-expanded={menuOpen} className="icon-button menu-button" onClick={onMenu} type="button"><Icons.menu /></button>
    <form className="global-search" role="search" onSubmit={event => { event.preventDefault(); onSearchSubmit() }}>
      <Icons.search />
      <label className="sr-only" htmlFor="global-search">Search incidents</label>
      <input ref={searchInput} maxLength={200} id="global-search" onChange={event => onSearch(event.target.value)} placeholder="Search incidents" type="search" value={search} />
      <Kbd>/</Kbd>
    </form>
    {workspace && <div className="workspace-chip" title={workspace}><Icons.lock /><span className="workspace-name">{workspace}</span><span className="workspace-mode">{mode}</span></div>}
    <div className="top-actions">
      <button aria-label="Keyboard shortcuts" className="icon-button hide-small" onClick={onShortcuts} title="Keyboard shortcuts (?)" type="button"><Icons.keyboard /></button>
      <button aria-label={`Theme: ${themeLabel[theme]}. Switch to ${themeLabel[nextTheme[theme]]}`} className="icon-button" onClick={() => setTheme(nextTheme[theme])} title={`Theme: ${themeLabel[theme]}`} type="button"><ThemeIcon /></button>
      <button aria-label={signedIn ? 'Your account' : 'API settings'} className="icon-button" onClick={onSettings} type="button"><Icons.settings /></button>
      <button aria-label="Analyse email" className="button button-primary analyse-button" disabled={!canAnalyse} onClick={onAnalyse} type="button"><Icons.mail /><span>Analyse email</span></button>
    </div>
  </header>
})
