export type Theme = 'light' | 'dark'

const KEY = 'lindabiz.theme'

function stored(): Theme | null {
  try {
    const value = window.localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch { return null }
}

/** The theme in effect: the saved choice, otherwise the system preference. */
export function currentTheme(): Theme {
  const explicit = document.documentElement.getAttribute('data-theme')
  if (explicit === 'light' || explicit === 'dark') return explicit
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Apply a saved choice before the first paint so the page never flashes the wrong theme. */
export function initTheme() {
  const saved = stored()
  if (saved) document.documentElement.setAttribute('data-theme', saved)
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try { window.localStorage.setItem(KEY, theme) } catch { /* private mode: the choice lasts for this tab */ }
}
