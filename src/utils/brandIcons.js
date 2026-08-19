// Brand icons from theSVG (https://thesvg.org) — 6,500+ brand SVGs on a
// public CDN. There's no domain→icon endpoint, so we pull the registry once,
// reduce it to a small hostname → { slug, variants } index, cache that in
// localStorage for a week, and match bookmarks by hostname (then parent
// domains). Everything here is fire-and-forget: icons render with the
// favicon chain until the index arrives, then re-resolve.

const REGISTRY_URL = 'https://thesvg.org/api/registry.json'
const CDN_BASE = 'https://thesvg.org/icons'
const CACHE_KEY = 'browserhome_brand_icons_v2'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

let index = null        // { [host]: { s: slug, d: hasDark, l: hasLight, lum: 0..100 } }
let version = 0         // bumps whenever the index (or the refresh nonce) changes
let refreshNonce = 0    // > 0 after a manual refresh: cache-busts icon URLs this session
let inflight = null
const listeners = new Set()

function notify() {
  version += 1
  for (const cb of listeners) cb()
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

// Relative luminance of a brand hex, 0..100 — used to skip marks that would
// vanish against the current theme when no contrasting variant exists
function luminance(hex) {
  if (typeof hex !== 'string' || !/^[0-9a-f]{6}$/i.test(hex)) return 50
  const c = (i) => parseInt(hex.slice(i, i + 2), 16) / 255
  return Math.round((0.2126 * c(0) + 0.7152 * c(2) + 0.0722 * c(4)) * 100)
}

// Several icons can claim one host (lots of projects list a github.com repo
// as their URL), so each host keeps the best-scoring claimant: a root-path URL
// and a slug/title that matches the host's own name mark the site's real icon.
function claimScore(icon, host) {
  let score = 0
  try {
    const path = new URL(icon.url).pathname.replace(/\/+$/, '')
    if (path === '') score += 4
  } catch { /* unparsable path: no bonus */ }
  const label = host.split('.')[0]
  const slug = String(icon.slug).toLowerCase()
  const title = String(icon.title || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (slug === label || slug.replace(/-/g, '') === label) score += 3
  if (title === label) score += 1
  return score
}

function buildIndex(icons) {
  const best = {}
  for (const icon of icons) {
    const host = hostOf(icon?.url)
    if (!host || !icon.slug) continue
    const score = claimScore(icon, host)
    if (best[host] && best[host].score >= score) continue
    const variants = Array.isArray(icon.variants) ? icon.variants : []
    best[host] = {
      score,
      entry: {
        s: icon.slug,
        d: variants.includes('dark') ? 1 : 0,
        l: variants.includes('light') ? 1 : 0,
        lum: luminance(icon.hex),
      },
    }
  }
  const out = {}
  for (const host of Object.keys(best)) out[host] = best[host].entry
  return out
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.index || typeof parsed.ts !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(idx) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), index: idx }))
  } catch {
    /* storage full or unavailable — the in-memory index still works */
  }
}

// Loads the index (from cache when fresh, else the network). Safe to call
// repeatedly; concurrent callers share one request.
export function loadBrandIndex({ force = false } = {}) {
  if (!force) {
    if (index) return Promise.resolve(index)
    if (inflight) return inflight
    const cached = readCache()
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      index = cached.index
      notify()
      return Promise.resolve(index)
    }
  }
  if (typeof fetch !== 'function') return Promise.resolve(index)
  inflight = fetch(REGISTRY_URL, { cache: force ? 'reload' : 'default' })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`registry ${res.status}`))))
    .then((data) => {
      const icons = Array.isArray(data) ? data : data?.icons
      if (!Array.isArray(icons)) throw new Error('unexpected registry shape')
      index = buildIndex(icons)
      writeCache(index)
      notify()
      return index
    })
    .catch(() => {
      // Offline or blocked: fall back to a stale cache if there is one, else
      // leave the favicon chain in charge
      if (!index) {
        const cached = readCache()
        if (cached) { index = cached.index; notify() }
      }
      return index
    })
    .finally(() => { inflight = null })
  return inflight
}

export function subscribeBrandIcons(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getBrandIconsVersion() {
  return version
}

// Manual "re-run icon resolution": refetch the registry (bypassing the
// week-long cache) and bust icon URLs for the rest of this session so
// changed favicons / brand marks are fetched fresh.
export function refreshBrandIcons() {
  refreshNonce += 1
  notify()
  return loadBrandIndex({ force: true })
}

export function bustIconUrl(url) {
  if (!refreshNonce || typeof url !== 'string' || url.startsWith('data:')) return url
  return `${url}${url.includes('?') ? '&' : '?'}r=${refreshNonce}`
}

function lookup(url) {
  if (!index) return null
  let host = hostOf(url)
  while (host) {
    if (index[host]) return index[host]
    const dot = host.indexOf('.')
    if (dot === -1) return null
    host = host.slice(dot + 1)
    if (!host.includes('.')) return null // never match a bare TLD
  }
  return null
}

// CDN URL for the best theme-appropriate variant, or null when theSVG has no
// usable mark for this site (unknown, or would be invisible on this theme)
export function getBrandIconUrl(url, theme = 'dark') {
  const entry = lookup(url)
  if (!entry) return null
  if (theme === 'dark') {
    if (entry.d) return `${CDN_BASE}/${entry.s}/dark.svg`
    if (entry.lum < 18) return null // near-black mark on a dark tile
  } else {
    if (entry.lum > 88) return entry.l ? `${CDN_BASE}/${entry.s}/light.svg` : null
  }
  return `${CDN_BASE}/${entry.s}/default.svg`
}
