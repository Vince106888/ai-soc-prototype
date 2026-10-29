import { useState } from 'react'
import { Icons } from './icons'
import { currentTheme, setTheme, type Theme } from './theme'

export function ThemeToggle() {
  const [theme, setCurrent] = useState<Theme>(currentTheme)
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => { setTheme(next); setCurrent(next) }}
    >
      {theme === 'dark' ? <Icons.sun aria-hidden="true" /> : <Icons.moon aria-hidden="true" />}
    </button>
  )
}
