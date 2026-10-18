import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// jsdom has no viewport; navigation scrolling is checked in the browser.
window.scrollTo = vi.fn()
