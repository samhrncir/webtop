// Alternate names for an app. Stored on a bookmark as content.aliases and
// matched by the search bar alongside name and url.

export function normalizeAliases(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const result = []
  for (const entry of list) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

// Returns the first alias containing the (already lowercased) query, or null.
export function matchAlias(item, query) {
  if (!query) return null
  const aliases = item?.aliases
  if (!Array.isArray(aliases)) return null
  return aliases.find((a) => typeof a === 'string' && a.toLowerCase().includes(query)) || null
}
