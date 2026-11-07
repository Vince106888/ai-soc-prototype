import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from './ThemeToggle'
import { initTheme } from './theme'

beforeEach(() => { document.documentElement.removeAttribute('data-theme'); window.localStorage.clear() })
afterEach(cleanup)

describe('theme toggle', () => {
  it('switches the page theme, labels the next action and remembers the choice', () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(window.localStorage.getItem('lindabiz.theme')).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(window.localStorage.getItem('lindabiz.theme')).toBe('light')
  })

  it('applies a saved choice before the app renders and ignores invalid values', () => {
    window.localStorage.setItem('lindabiz.theme', 'dark')
    initTheme()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    document.documentElement.removeAttribute('data-theme')
    window.localStorage.setItem('lindabiz.theme', 'purple')
    initTheme()
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })
})
