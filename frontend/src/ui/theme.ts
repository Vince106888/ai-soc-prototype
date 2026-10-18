import { useCallback, useSyncExternalStore } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
const STORAGE = 'sentinelsme.theme'
const CHANGE = 'sentinelsme:theme'

function read(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

/** Apply the stored preference before React renders to avoid a flash of the wrong theme. */
export function applyStoredTheme() {
  const preference = read()
  if (preference === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = preference
}

function subscribe(notify: () => void) {
  const fromOtherTab = () => { applyStoredTheme(); notify() }
  window.addEventListener(CHANGE, notify)
  window.addEventListener('storage', fromOtherTab)
  return () => { window.removeEventListener(CHANGE, notify); window.removeEventListener('storage', fromOtherTab) }
}

/** A per-browser convenience only; it never affects workspace data. */
export function useTheme(): [ThemePreference, (next: ThemePreference) => void] {
  const preference = useSyncExternalStore(subscribe, read, () => 'system' as ThemePreference)
  const set = useCallback((next: ThemePreference) => {
    try {
      if (next === 'system') localStorage.removeItem(STORAGE)
      else localStorage.setItem(STORAGE, next)
    } catch { /* Storage can be unavailable; the theme still applies for this page. */ }
    if (next === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = next
    window.dispatchEvent(new Event(CHANGE))
  }, [])
  return [preference, set]
}
