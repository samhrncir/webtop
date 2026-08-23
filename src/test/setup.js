// Shared test environment: registered via `test.setupFiles` in vite.config.js.
// Fills the browser APIs jsdom lacks and enforces test hygiene (no real
// network, clean storage and DOM between tests).

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// ---- browser APIs jsdom doesn't provide ----

// ThemeContext reads the OS color scheme
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}

// The mobile pager scrolls its container programmatically
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function (opts) {
    if (opts && typeof opts === 'object') {
      if (typeof opts.left === 'number') this.scrollLeft = opts.left
      if (typeof opts.top === 'number') this.scrollTop = opts.top
    }
  }
}

// SearchBar keeps the active result row in view
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// Taskbar measures its wrapper with a ResizeObserver
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// ---- test hygiene ----

beforeEach(() => {
  // Tests never touch the real network. Anything that fetches (brandIcons'
  // registry download) gets a rejection and takes its offline path; tests
  // that need a response stub fetch themselves.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network disabled in tests'))))
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
