// Sync v2: per-row storage with last-write-wins merging.
//
// The source of truth on the client is a flat set of rows mirroring the
// server tables (`pages`, `items`), persisted to localStorage. The UI's
// nested shape ({ pages: [{ id, items: [...] }] }) is derived from rows.
//
// Every mutation stamps the affected rows with a client updated_at and
// marks them dirty; dirty rows are pushed in batches through the
// sync_push RPC, which applies each row only if it's newer than the
// server's copy. Deletions are tombstones (deleted_at), so they sync
// instead of resurrecting. Merging (pull, realtime, push-conflict) is
// always the same per-row LWW rule, which makes every path idempotent.

import { supabase } from '../lib/supabase.js'
import { positionBetween, seqPositions } from './fractional.js'

const ROWS_KEY = 'browserhome_rows'
const DIRTY_KEY = 'browserhome_dirty'

export function nowIso() {
  return new Date().toISOString()
}

// Timestamps arrive in two formats (client ISO 'Z', postgres '+00:00'),
// so comparisons must be numeric, never lexicographic
function tsOf(row) {
  return Date.parse(row.updated_at) || 0
}

export function byPosition(a, b) {
  if (a.position < b.position) return -1
  if (a.position > b.position) return 1
  return a.id < b.id ? -1 : 1 // deterministic tie-break for concurrent inserts
}

// ---------- local persistence ----------

export function loadRows() {
  try {
    const raw = localStorage.getItem(ROWS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.pages) || !Array.isArray(parsed.items)) return null
    return parsed
  } catch {
    return null
  }
}

export function loadDirty() {
  try {
    const raw = localStorage.getItem(DIRTY_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return {
      pages: new Set(parsed?.pages || []),
      items: new Set(parsed?.items || []),
    }
  } catch {
    return { pages: new Set(), items: new Set() }
  }
}

export function saveRows(rows, dirty) {
  try {
    localStorage.setItem(ROWS_KEY, JSON.stringify(rows))
    localStorage.setItem(DIRTY_KEY, JSON.stringify({
      pages: [...dirty.pages],
      items: [...dirty.items],
    }))
  } catch (err) {
    console.error('Failed to save data:', err)
  }
}

// ---------- shape conversion ----------

// rows → nested UI shape. Tombstones filtered, everything sorted by position.
export function rowsToNested(rows) {
  const livePages = rows.pages.filter((p) => !p.deleted_at).sort(byPosition)
  const liveItems = rows.items.filter((i) => !i.deleted_at)
  const pages = livePages.map((page) => ({
    id: page.id,
    items: liveItems
      .filter((i) => i.page_id === page.id && !i.folder_id)
      .sort(byPosition)
      .map((item) => {
        if (item.type === 'folder') {
          return {
            ...item.content,
            id: item.id,
            type: 'folder',
            items: liveItems
              .filter((c) => c.folder_id === item.id)
              .sort(byPosition)
              .map((c) => ({ ...c.content, id: c.id, type: 'bookmark' })),
          }
        }
        return { ...item.content, id: item.id, type: 'bookmark' }
      }),
  }))
  return { pages }
}

// nested blob → rows (legacy migration and import). Ids are preserved so
// two devices converting the same blob converge on the same rows.
export function nestedToRows(nested) {
  const now = nowIso()
  const pages = []
  const items = []
  const pagePositions = seqPositions(nested.pages.length)
  nested.pages.forEach((page, pi) => {
    const pageId = page.id || crypto.randomUUID()
    pages.push({ id: pageId, position: pagePositions[pi], deleted_at: null, updated_at: now })
    const itemPositions = seqPositions(page.items.length)
    page.items.forEach((item, ii) => {
      const { id, type, items: children, ...content } = item
      const itemId = id || crypto.randomUUID()
      items.push({
        id: itemId, page_id: pageId, folder_id: null, type,
        content, position: itemPositions[ii], deleted_at: null, updated_at: now,
      })
      if (type === 'folder' && Array.isArray(children)) {
        const childPositions = seqPositions(children.length)
        children.forEach((child, ci) => {
          const { id: childId, type: _childType, ...childContent } = child
          items.push({
            id: childId || crypto.randomUUID(), page_id: pageId, folder_id: itemId, type: 'bookmark',
            content: childContent, position: childPositions[ci], deleted_at: null, updated_at: now,
          })
        })
      }
    })
  })
  return { pages, items }
}

// ---------- merging ----------

// Per-row LWW: newer updated_at wins, ties keep local. With
// dropOrphanEmptyPages (full pulls only), empty non-dirty pages the server
// doesn't know about are discarded — they're untouched bootstrap
// placeholders, and dropping them stops empty pages multiplying across
// devices.
export function mergeRows(localRows, serverRows, opts = {}) {
  const mergeTable = (localArr, serverArr) => {
    const byId = new Map(localArr.map((r) => [r.id, r]))
    for (const serverRow of serverArr) {
      const localRow = byId.get(serverRow.id)
      if (!localRow || tsOf(serverRow) > tsOf(localRow)) byId.set(serverRow.id, serverRow)
    }
    return [...byId.values()]
  }

  let pages = mergeTable(localRows.pages, serverRows.pages)
  const items = mergeTable(localRows.items, serverRows.items)

  if (opts.dropOrphanEmptyPages && serverRows.pages.some((p) => !p.deleted_at)) {
    const serverPageIds = new Set(serverRows.pages.map((p) => p.id))
    const dirtyPages = opts.dirtyPages || new Set()
    pages = pages.filter((page) => {
      if (page.deleted_at || serverPageIds.has(page.id) || dirtyPages.has(page.id)) return true
      return items.some((i) => !i.deleted_at && i.page_id === page.id)
    })
  }

  return { pages, items }
}

// Tombstones the server has confirmed don't need to live on locally
export function pruneTombstones(rows, dirty) {
  return {
    pages: rows.pages.filter((p) => !p.deleted_at || dirty.pages.has(p.id)),
    items: rows.items.filter((i) => !i.deleted_at || dirty.items.has(i.id)),
  }
}

// The UI needs at least one live page to add bookmarks to
export function ensureLivePage(rows) {
  if (rows.pages.some((p) => !p.deleted_at)) return rows
  return {
    ...rows,
    pages: [...rows.pages, {
      id: crypto.randomUUID(),
      position: positionBetween('', ''),
      deleted_at: null,
      updated_at: nowIso(),
    }],
  }
}

// ---------- server io ----------

export async function pullRows() {
  const [pagesRes, itemsRes] = await Promise.all([
    supabase.from('pages').select('*'),
    supabase.from('items').select('*'),
  ])
  if (pagesRes.error || itemsRes.error) return { status: 'error' }
  return { status: 'ok', rows: { pages: pagesRes.data, items: itemsRes.data } }
}

export async function pushRows(pageRows, itemRows) {
  const strip = ({ user_id: _userId, ...rest }) => rest
  const { error } = await supabase.rpc('sync_push', {
    _pages: pageRows.map(strip),
    _items: itemRows.map(strip),
  })
  return { status: error ? 'error' : 'ok' }
}

// Realtime row changes from other sessions. Callback gets (table, row).
export function subscribeToChanges(userId, onRow) {
  const channel = supabase
    .channel('homescreen-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pages', filter: `user_id=eq.${userId}` },
      (payload) => { if (payload.new?.id) onRow('pages', payload.new) }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'items', filter: `user_id=eq.${userId}` },
      (payload) => { if (payload.new?.id) onRow('items', payload.new) }
    )
    .subscribe()
  return () => supabase.removeChannel(channel)
}
