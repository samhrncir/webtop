import { showNotice } from './notice.js'

// Opening a bookmark. Ordinary URLs open in a new tab. Browser-internal pages
// (chrome://extensions, edge://settings, about:blank, ...) are the exception:
// no browser lets a web page navigate to them, only an extension may. So for
// those we hand the URL to the companion extension in extension/ when it is
// installed (its content script marks <html data-browserhome-companion> and
// relays a postMessage to chrome.tabs.create), and otherwise copy the URL to
// the clipboard with a hint to paste it into the address bar.

// Keep in sync with the allow-list in extension/background.js.
export const INTERNAL_SCHEMES = ['chrome:', 'edge:', 'brave:', 'vivaldi:', 'opera:', 'about:']

export const COMPANION_MESSAGE = 'browserhome:open-url'
export const COMPANION_ATTR = 'browserhomeCompanion'

function protocolOf(url) {
  try {
    return new URL(url).protocol
  } catch {
    return ''
  }
}

// chrome://..., edge://..., about:... — a page the browser serves itself
export function isBrowserInternalUrl(url) {
  return typeof url === 'string' && INTERNAL_SCHEMES.includes(protocolOf(url).toLowerCase())
}

// Anything a bookmark may point at: the web, or a browser-internal page
export function isOpenableUrl(url) {
  const protocol = protocolOf(url)
  return protocol === 'http:' || protocol === 'https:' || isBrowserInternalUrl(url)
}

// Does the string already carry a scheme, so it must not get https:// prepended?
// "localhost:5173" has no scheme (that's a port); "chrome://extensions" and
// "about:blank" do.
export function hasScheme(str) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(str) || /^about:/i.test(str)
}

export function hasCompanionExtension() {
  return document.documentElement.dataset[COMPANION_ATTR] === '1'
}

async function copyWithHint(url) {
  const why = "Browsers don't let pages open browser-internal URLs."
  try {
    await navigator.clipboard.writeText(url)
    showNotice(`${why} Copied it — paste it into the address bar.`)
  } catch {
    showNotice(`${why} Type it into the address bar: ${url}`)
  }
  return 'copied'
}

// Resolves to how the URL was handled: 'opened' | 'extension' | 'copied'
export function openUrl(url) {
  if (!isBrowserInternalUrl(url)) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return Promise.resolve('opened')
  }
  if (hasCompanionExtension()) {
    window.postMessage({ type: COMPANION_MESSAGE, url }, window.location.origin)
    return Promise.resolve('extension')
  }
  return copyWithHint(url)
}

// onClick for an <a target="_blank"> whose href may be browser-internal: the
// anchor would silently do nothing, so route those through openUrl instead.
export function interceptInternalLink(event, url) {
  if (!isBrowserInternalUrl(url)) return
  event.preventDefault()
  openUrl(url)
}
