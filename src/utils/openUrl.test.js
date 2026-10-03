import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isBrowserInternalUrl, isOpenableUrl, hasScheme, hasCompanionExtension,
  openUrl, interceptInternalLink, COMPANION_MESSAGE, COMPANION_ATTR,
} from './openUrl.js'

function installCompanion() {
  document.documentElement.dataset[COMPANION_ATTR] = '1'
}

function stubClipboard(writeText) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

beforeEach(() => {
  vi.spyOn(window, 'open').mockImplementation(() => null)
  vi.spyOn(window, 'postMessage').mockImplementation(() => {})
})

afterEach(() => {
  delete document.documentElement.dataset[COMPANION_ATTR]
  delete navigator.clipboard
  document.querySelectorAll('.app-notice').forEach((el) => el.remove())
})

describe('isBrowserInternalUrl', () => {
  it('recognises the pages a browser serves itself', () => {
    expect(isBrowserInternalUrl('chrome://extensions/')).toBe(true)
    expect(isBrowserInternalUrl('chrome://settings/privacy')).toBe(true)
    expect(isBrowserInternalUrl('edge://flags')).toBe(true)
    expect(isBrowserInternalUrl('brave://rewards')).toBe(true)
    expect(isBrowserInternalUrl('about:blank')).toBe(true)
    expect(isBrowserInternalUrl('CHROME://extensions')).toBe(true)
  })

  it('treats the web, garbage and non-strings as not internal', () => {
    expect(isBrowserInternalUrl('https://chrome.google.com')).toBe(false)
    expect(isBrowserInternalUrl('https://example.com/chrome://extensions')).toBe(false)
    expect(isBrowserInternalUrl('not a url')).toBe(false)
    expect(isBrowserInternalUrl(undefined)).toBe(false)
  })
})

describe('isOpenableUrl (what a bookmark may point at)', () => {
  it('accepts http(s) and browser-internal URLs', () => {
    expect(isOpenableUrl('https://example.com')).toBe(true)
    expect(isOpenableUrl('http://localhost:5173')).toBe(true)
    expect(isOpenableUrl('chrome://extensions')).toBe(true)
  })

  it('rejects other schemes and non-URLs', () => {
    expect(isOpenableUrl('javascript:alert(1)')).toBe(false)
    expect(isOpenableUrl('mailto:a@b.c')).toBe(false)
    expect(isOpenableUrl('example.com')).toBe(false)
  })
})

describe('hasScheme (whether https:// may be prepended)', () => {
  it('is true for scheme://host and about: URLs', () => {
    expect(hasScheme('https://example.com')).toBe(true)
    expect(hasScheme('chrome://extensions')).toBe(true)
    expect(hasScheme('about:blank')).toBe(true)
  })

  it('is false for bare hosts, including host:port', () => {
    expect(hasScheme('example.com')).toBe(false)
    expect(hasScheme('localhost:5173')).toBe(false)
  })
})

describe('openUrl', () => {
  it('opens web URLs in a new tab', async () => {
    await expect(openUrl('https://example.com')).resolves.toBe('opened')
    expect(window.open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
  })

  it('hands browser-internal URLs to the companion extension when it is installed', async () => {
    installCompanion()
    expect(hasCompanionExtension()).toBe(true)
    await expect(openUrl('chrome://extensions/')).resolves.toBe('extension')
    expect(window.postMessage).toHaveBeenCalledWith(
      { type: COMPANION_MESSAGE, url: 'chrome://extensions/' },
      window.location.origin
    )
    expect(window.open).not.toHaveBeenCalled()
  })

  it('without the extension, copies the URL and explains why it could not open', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    stubClipboard(writeText)
    await expect(openUrl('chrome://extensions/')).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('chrome://extensions/')
    expect(window.open).not.toHaveBeenCalled()
    expect(document.querySelector('.app-notice')).toHaveTextContent(/Copied it/)
  })

  it('falls back to showing the URL when the clipboard is unavailable', async () => {
    await expect(openUrl('chrome://settings/')).resolves.toBe('copied')
    expect(document.querySelector('.app-notice')).toHaveTextContent('Type it into the address bar: chrome://settings/')
  })
})

describe('interceptInternalLink (anchors whose href may be internal)', () => {
  it('leaves ordinary links to the browser', () => {
    const event = { preventDefault: vi.fn() }
    interceptInternalLink(event, 'https://example.com')
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('takes over internal links and routes them through openUrl', () => {
    installCompanion()
    const event = { preventDefault: vi.fn() }
    interceptInternalLink(event, 'chrome://extensions')
    expect(event.preventDefault).toHaveBeenCalled()
    expect(window.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'chrome://extensions' }),
      window.location.origin
    )
  })
})
