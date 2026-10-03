// A transient status line at the bottom of the screen, for feedback that
// needs no component of its own (styles: .app-notice in src/index.css).
// Only one shows at a time; a new notice replaces the previous one.

const DEFAULT_DURATION_MS = 4000

export function showNotice(text, { duration = DEFAULT_DURATION_MS } = {}) {
  document.querySelectorAll('.app-notice').forEach((el) => el.remove())
  const el = document.createElement('div')
  el.className = 'app-notice'
  el.setAttribute('role', 'status')
  el.textContent = text
  document.body.appendChild(el)
  setTimeout(() => el.remove(), duration)
  return el
}
