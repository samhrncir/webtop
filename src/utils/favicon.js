export function getFaviconUrl(url) {
  try {
    const parsed = new URL(url)
    const domain = parsed.hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  } catch {
    return null
  }
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
