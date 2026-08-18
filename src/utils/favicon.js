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

// Ordered fallback chain for an item: custom icon -> favicon -> (none, caller shows letter)
export function getIconCandidates(item) {
  const out = []
  const custom = typeof item?.icon === 'string' ? item.icon.trim() : ''
  if (custom && isSafeIconUrl(custom)) out.push(custom)
  const favicon = item?.url ? getFaviconUrl(item.url) : null
  if (favicon) out.push(favicon)
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
