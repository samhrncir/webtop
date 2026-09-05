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

// Favorites reuse the tag-filter plumbing: the chip bar and search scope by
// a filter value that is either a tag name or this sentinel.
export const FAVORITES_FILTER = '__favorites__'

export function isFavorite(item) {
  return !!item?.favorite
}

// True when the item passes the active filter (a tag, the favorites
// sentinel, or no filter at all)
export function itemMatchesFilter(item, filter) {
  if (!filter) return true
  if (filter === FAVORITES_FILTER) return isFavorite(item)
  return hasTag(item, filter)
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

// Which tags get a chip on the home screen. `tags` is allTags() output
// (alphabetical, with counts). 'top' shows the `max` most-used tags, ties
// alphabetical; 'chosen' shows exactly the user's picks (names that no longer
// exist are ignored). The active tag always gets a chip, so a filter picked
// from search or the overflow menu is visible and clearable. Returns
// { shown, overflow }; overflow stays alphabetical for scanning.
export function pickHomeTags(tags, { mode = 'top', max = 5, chosen = [], activeTag = null } = {}) {
  const list = Array.isArray(tags) ? tags : []
  let shown
  if (mode === 'chosen') {
    const picks = new Set(Array.isArray(chosen) ? chosen : [])
    shown = list.filter((t) => picks.has(t.tag))
  } else {
    const n = Number(max)
    const limit = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 5
    shown = [...list]
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, limit)
  }
  const shownSet = new Set(shown.map((t) => t.tag))
  if (activeTag && activeTag !== FAVORITES_FILTER && !shownSet.has(activeTag)) {
    const active = list.find((t) => t.tag === activeTag)
    if (active) {
      shown = [...shown, active]
      shownSet.add(activeTag)
    }
  }
  const overflow = list.filter((t) => !shownSet.has(t.tag))
  return { shown, overflow }
}