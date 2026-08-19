import { getBrandIconUrl, bustIconUrl } from './brandIcons.js'

export function getFaviconUrl(url) {
  try {
    const parsed = new URL(url)
    const domain = parsed.hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  } catch {
    return null
  }
}

export function isSafeIconUrl(str) {
  if (typeof str !== 'string') return false
  if (/^data:image\//i.test(str)) return true
  try {
    const parsed = new URL(str)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// A single emoji grapheme (pictograph, keycap or flag). Anything else, or
// more than one grapheme, is rejected so a stray letter can't hijack the tile.
const EMOJI_GRAPHEME = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]️?⃣)/u

function firstGrapheme(str) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    for (const { segment } of seg.segment(str)) return segment
    return ''
  }
  return Array.from(str)[0] || ''
}

// Returns the normalized emoji for `str`, or '' when it isn't a single emoji.
export function normalizeEmoji(str) {
  if (typeof str !== 'string') return ''
  const trimmed = str.trim()
  if (!trimmed) return ''
  const first = firstGrapheme(trimmed)
  if (first !== trimmed) return ''
  return EMOJI_GRAPHEME.test(first) ? first : ''
}

// The emoji an item wants drawn in place of its image icon, or null.
export function getItemEmoji(item) {
  return normalizeEmoji(item?.emoji) || null
}

// Ordered fallback chain for an item:
//   custom icon URL (explicit user choice) -> theSVG brand mark -> favicon -> (none, caller shows letter)
// The brand step is only present once the theSVG index has loaded; see brandIcons.js.
export function getIconCandidates(item, { theme = 'dark' } = {}) {
  const out = []
  const custom = typeof item?.icon === 'string' ? item.icon.trim() : ''
  if (custom && isSafeIconUrl(custom)) out.push(bustIconUrl(custom))
  const brand = item?.url ? getBrandIconUrl(item.url, theme) : null
  if (brand) out.push(bustIconUrl(brand))
  const favicon = item?.url ? getFaviconUrl(item.url) : null
  if (favicon) out.push(bustIconUrl(favicon))
  return out
}

export function getInitialLetter(name) {
  if (!name || name.trim().length === 0) return '?'
  return name.trim()[0].toUpperCase()
}

const COLORS = [
  '#7c3aed', '#2563eb', '#059669', '#d97706',
  '#dc2626', '#db2777', '#0891b2', '#65a30d',
]

export function getColorForName(name) {
  if (!name) return COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}
