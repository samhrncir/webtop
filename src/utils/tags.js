// Tags live on a bookmark as `content.tags: string[]`. `content` is
// free-form jsonb, so tags sync, merge and export with no schema change.
// Everything that reads or writes a tag goes through here so the chip row,
// the tag editor and search all agree on what a tag is.

const MAX_TAG_LENGTH = 24

// Canonical form: trimmed, whitespace collapsed, lowercased, length capped.
// Lowercasing is what keeps "Work" and "work" from showing as two chips.
export function normalizeTag(raw) {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_TAG_LENGTH)
}

// Items predate tags, so never assume the key exists
export function getTags(item) {
  return Array.isArray(item?.tags) ? item.tags : []
}

export function hasTag(item, tag) {
  return getTags(item).includes(tag)
}

// Normalize + dedupe a whole list, preserving entry order
export function normalizeTagList(list) {
  const seen = new Set()
  const result = []
  for (const raw of list || []) {
    const tag = normalizeTag(raw)
    if (tag && !seen.has(tag)) {
      seen.add(tag)
      result.push(tag)
    }
  }
  return result
}

// Every bookmark across every page — top level and inside folders — as
// { item, pageIdx, inFolder }, in page then grid order. `inFolder` is the
// containing folder's name, or null. With `includeFolders`, each folder is
// emitted just before its children, which is the order search results have
// always been listed in.
export function flattenBookmarks(data, { includeFolders = false } = {}) {
  const result = []
  data.pages.forEach((page, pageIdx) => {
    page.items.forEach((item) => {
      if (item.type === 'bookmark') {
        result.push({ item, pageIdx, inFolder: null })
      } else if (item.type === 'folder') {
        if (includeFolders) result.push({ item, pageIdx, inFolder: null })
        item.items.forEach((child) => {
          result.push({ item: child, pageIdx, inFolder: item.name })
        })
      }
    })
  })
  return result
}

// Unique tags in use, alphabetical, with how many apps carry each
export function allTags(data) {
  const counts = new Map()
  for (const { item } of flattenBookmarks(data)) {
    for (const tag of getTags(item)) {
      counts.set(tag, (counts.get(tag) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag))
}

// `q` is expected pre-trimmed and lowercased by the caller
export function itemMatchesQuery(item, q) {
  if (!q) return false
  if (item.name && item.name.toLowerCase().includes(q)) return true
  if (item.type === 'bookmark') {
    if (item.url && item.url.toLowerCase().includes(q)) return true
    if (getTags(item).some((tag) => tag.includes(q))) return true
  }
  return false
}

export function compareByName(a, b) {
  return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
}
