import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  loadData,
  fetchFromServer as fetchLegacyBlob,
  exportData as exportDataUtil,
  importData as importDataUtil,
} from '../utils/storage.js'
import {
  nowIso, byPosition,
  loadRows, loadDirty, saveRows,
  rowsToNested, nestedToRows,
  mergeRows, pruneTombstones, ensureLivePage,
  pullRows, pushRows, subscribeToChanges,
} from '../utils/syncV2.js'
import { positionBetween } from '../utils/fractional.js'

// ---------- row query helpers ----------

function livePages(rows) {
  return rows.pages.filter((p) => !p.deleted_at).sort(byPosition)
}

function liveTopItems(rows, pageId) {
  return rows.items
    .filter((i) => !i.deleted_at && i.page_id === pageId && !i.folder_id)
    .sort(byPosition)
}

function liveFolderItems(rows, folderId) {
  return rows.items
    .filter((i) => !i.deleted_at && i.folder_id === folderId)
    .sort(byPosition)
}

function liveItem(rows, itemId) {
  return rows.items.find((i) => i.id === itemId && !i.deleted_at)
}

// Hidden bookmarks keep their page/folder rows (and survive export/import)
// but are dropped from the homescreen view. Every index-based edit has to
// work off this filtered set so drag indices line up with what's on screen.
const isHiddenRow = (row) => !!row.content?.hidden

function visibleRows(rows) {
  return { ...rows, items: rows.items.filter((i) => !isHiddenRow(i)) }
}

function liveHidden(rows) {
  return rows.items.filter((i) => !i.deleted_at && i.type === 'bookmark' && isHiddenRow(i))
}

const PAGE_CAPACITY = 20

// First page at or after startIdx with a free visible slot, else a brand new
// page appended at the end. Returns the page id, its index and any page row
// that has to be created. Hidden rows don't occupy slots.
function nextFreeSlot(rowsNow, startIdx = 0) {
  const pages = livePages(rowsNow)
  const visible = visibleRows(rowsNow)
  const idx = pages.findIndex(
    (p, i) => i >= startIdx && liveTopItems(visible, p.id).length < PAGE_CAPACITY
  )
  if (idx !== -1) return { pageId: pages[idx].id, pageIdx: idx, newPage: null }
  const newPage = {
    id: crypto.randomUUID(),
    position: endPosition(pages),
    deleted_at: null,
    updated_at: nowIso(),
  }
  return { pageId: newPage.id, pageIdx: pages.length, newPage }
}

// Taskbar pins live in the item's content blob, so they need no schema of
// their own — they ride the same rows, LWW merge and sign-out clearing.
const rowPosition = (row) => row.position
const pinPosition = (row) => row.content?.pinPosition || ''

function byPinPosition(a, b) {
  const pa = pinPosition(a)
  const pb = pinPosition(b)
  if (pa !== pb) return pa < pb ? -1 : 1
  return a.id < b.id ? -1 : 1
}

function livePinned(rows) {
  return rows.items
    .filter((i) => !i.deleted_at && i.type === 'bookmark' && i.content?.pinned && !isHiddenRow(i))
    .sort(byPinPosition)
}

// Position after the last entry of a sorted list
function endPosition(list, keyOf = rowPosition) {
  const last = list[list.length - 1]
  return positionBetween(last ? keyOf(last) : '', '')
}

// Position for inserting at `index` into a sorted list (dnd semantics:
// the moved item is excluded, then inserted at the target index)
function positionAt(list, index, excludeId, keyOf = rowPosition) {
  const filtered = excludeId ? list.filter((i) => i.id !== excludeId) : list
  const clamped = Math.max(0, Math.min(index, filtered.length))
  const prev = clamped > 0 ? keyOf(filtered[clamped - 1]) : ''
  const next = clamped < filtered.length ? keyOf(filtered[clamped]) : ''
  try {
    return positionBetween(prev, next)
  } catch {
    // Neighbors with identical keys (concurrent same-slot inserts) — fall
    // back to appending; the id tie-break keeps ordering deterministic
    return positionBetween(prev, '')
  }
}

// Apply full-row snapshots onto the row set (replace by id, append new)
function applyChangesToRows(rows, changes) {
  const applyTable = (arr, changed) => {
    if (!changed || changed.length === 0) return arr
    const result = [...arr]
    const indexById = new Map(result.map((r, idx) => [r.id, idx]))
    for (const row of changed) {
      const idx = indexById.get(row.id)
      if (idx === undefined) {
        indexById.set(row.id, result.length)
        result.push(row)
      } else {
        result[idx] = row
      }
    }
    return result
  }
  return {
    pages: applyTable(rows.pages, changes.pages),
    items: applyTable(rows.items, changes.items),
  }
}

// First run on this device: use stored rows, else convert the legacy
// local blob. Converted content is marked dirty so it seeds the server;
// an untouched default (one empty page) is not worth pushing.
function bootstrapLocal() {
  const stored = loadRows()
  if (stored) return { rows: ensureLivePage(stored), dirty: loadDirty() }

  const legacy = loadData()
  const rows = nestedToRows(legacy)
  const hasContent = legacy.pages.length > 1 || legacy.pages.some((p) => p.items.length > 0)
  const dirty = hasContent
    ? { pages: new Set(rows.pages.map((p) => p.id)), items: new Set(rows.items.map((i) => i.id)) }
    : { pages: new Set(), items: new Set() }
  saveRows(rows, dirty)
  return { rows, dirty }
}

export function useHomescreen() {
  const bootRef = useRef(null)
  if (bootRef.current === null) bootRef.current = bootstrapLocal()

  const [rows, setRows] = useState(bootRef.current.rows)
  const [currentPage, setCurrentPage] = useState(0)
  const [editMode, setEditMode] = useState(false)

  const rowsRef = useRef(rows)
  const dirtyRef = useRef(bootRef.current.dirty)
  // Pushes stay blocked until the first successful pull, so stale local
  // rows can never race ahead of the server state
  const hydratedRef = useRef(false)
  const pushTimerRef = useRef(null)
  // Set on unmount (sign-out) so an in-flight pull/push can't write rows
  // back into localStorage after clearLocalData() has wiped it
  const releasedRef = useRef(false)

  const data = useMemo(() => rowsToNested(visibleRows(rows)), [rows])

  // Flat list of hidden bookmarks for the settings page. They have no
  // position of their own — unhiding appends to the next free slot.
  const hidden = useMemo(
    () => liveHidden(rows)
      .map((r) => ({ id: r.id, type: 'bookmark', ...r.content }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [rows]
  )

  // Flat, ordered list of taskbar pins — drawn from every page and folder,
  // so it stays the same wherever you are in the homescreen
  const pinned = useMemo(
    () => livePinned(rows).map((r) => ({ id: r.id, type: 'bookmark', ...r.content })),
    [rows]
  )

  // ---------- sync plumbing ----------

  const flushPush = useCallback(async () => {
    if (!hydratedRef.current) return
    const dirty = dirtyRef.current
    if (dirty.pages.size === 0 && dirty.items.size === 0) return

    const snapshot = rowsRef.current
    const itemRows = snapshot.items.filter((i) => dirty.items.has(i.id))
    // Also send pages the dirty items sit on, so a new item never lands
    // before its page exists server-side (LWW makes re-sends no-ops)
    const referencedPageIds = new Set(itemRows.map((i) => i.page_id))
    const pageRows = snapshot.pages.filter(
      (p) => dirty.pages.has(p.id) || referencedPageIds.has(p.id)
    )

    const sentAt = new Map([...pageRows, ...itemRows].map((r) => [r.id, r.updated_at]))
    const result = await pushRows(pageRows, itemRows)
    if (result.status !== 'ok') return // stay dirty; retried on next edit / 'online'
    if (releasedRef.current) return // signed out mid-push; storage is already cleared

    // Clear dirty marks, except rows re-edited while the push was in flight
    const unchanged = (id) => {
      const row = rowsRef.current.pages.find((p) => p.id === id)
        || rowsRef.current.items.find((i) => i.id === id)
      return !row || row.updated_at === sentAt.get(id)
    }
    for (const id of [...dirtyRef.current.pages]) {
      if (sentAt.has(id) && unchanged(id)) dirtyRef.current.pages.delete(id)
    }
    for (const id of [...dirtyRef.current.items]) {
      if (sentAt.has(id) && unchanged(id)) dirtyRef.current.items.delete(id)
    }
    const pruned = pruneTombstones(rowsRef.current, dirtyRef.current)
    rowsRef.current = pruned
    saveRows(pruned, dirtyRef.current)
    setRows(pruned)
  }, [])

  const schedulePush = useCallback(() => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
    pushTimerRef.current = setTimeout(flushPush, 800)
  }, [flushPush])

  // Every mutation funnels through here: stamp rows into local state,
  // persist, mark dirty, debounce a push
  const applyRowChanges = useCallback((changes) => {
    const next = applyChangesToRows(rowsRef.current, changes)
    for (const p of changes.pages || []) dirtyRef.current.pages.add(p.id)
    for (const i of changes.items || []) dirtyRef.current.items.add(i.id)
    rowsRef.current = next
    saveRows(next, dirtyRef.current)
    setRows(next)
    schedulePush()
  }, [schedulePush])

  const adoptMerged = useCallback((merged) => {
    if (releasedRef.current) return // signed out mid-pull; storage is already cleared
    const next = ensureLivePage(merged)
    rowsRef.current = next
    saveRows(next, dirtyRef.current)
    setRows(next)
  }, [])

  // Full pull + LWW merge + push of anything still dirty. Runs on mount
  // and whenever connectivity returns.
  const reconcile = useCallback(async () => {
    const pulled = await pullRows()
    if (pulled.status !== 'ok') return // unreachable — stay unhydrated, retry on 'online'

    // First run against the v2 tables (never any rows, even tombstones):
    // seed from the legacy server blob
    if (pulled.rows.pages.length === 0 && pulled.rows.items.length === 0) {
      const legacy = await fetchLegacyBlob()
      if (legacy.status === 'error') return
      if (
        legacy.status === 'ok' &&
        (legacy.data.pages.length > 1 || legacy.data.pages.some((p) => p.items.length > 0))
      ) {
        const legacyRows = nestedToRows(legacy.data)
        for (const p of legacyRows.pages) dirtyRef.current.pages.add(p.id)
        for (const i of legacyRows.items) dirtyRef.current.items.add(i.id)
        rowsRef.current = mergeRows(rowsRef.current, legacyRows, {
          dropOrphanEmptyPages: true, // sheds the untouched bootstrap placeholder page
          dirtyPages: dirtyRef.current.pages,
        })
      }
    }

    const merged = mergeRows(rowsRef.current, pulled.rows, {
      dropOrphanEmptyPages: true,
      dirtyPages: dirtyRef.current.pages,
    })
    hydratedRef.current = true
    adoptMerged(merged)
    flushPush()
  }, [adoptMerged, flushPush])

  useEffect(() => {
    releasedRef.current = false // reset for StrictMode's dev remount
    reconcile()
    const handleOnline = () => reconcile()
    window.addEventListener('online', handleOnline)
    return () => {
      releasedRef.current = true
      window.removeEventListener('online', handleOnline)
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
    }
  }, [reconcile])

  // Live updates from other sessions; the LWW merge means our own echoed
  // writes and anything older than local dirty edits are ignored
  useEffect(() => {
    let cancelled = false
    let cleanup = null
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return
      cleanup = subscribeToChanges(session.user.id, (table, row) => {
        const patch = table === 'pages' ? { pages: [row], items: [] } : { pages: [], items: [row] }
        adoptMerged(mergeRows(rowsRef.current, patch))
      })
    })
    return () => {
      cancelled = true
      if (cleanup) cleanup()
    }
  }, [adoptMerged])

  // Clamp currentPage if pages are removed
  useEffect(() => {
    if (currentPage >= data.pages.length) {
      setCurrentPage(Math.max(0, data.pages.length - 1))
    }
  }, [data.pages.length, currentPage])

  // ---------- mutations (public API unchanged) ----------

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => !prev)
  }, [])

  const addBookmark = useCallback((url, name, tags = []) => {
    const page = livePages(rowsRef.current)[currentPage]
    if (!page) return
    applyRowChanges({
      items: [{
        id: crypto.randomUUID(), page_id: page.id, folder_id: null, type: 'bookmark',
        content: { name, url, tags },
        position: endPosition(liveTopItems(rowsRef.current, page.id)),
        deleted_at: null, updated_at: nowIso(),
      }],
    })
  }, [currentPage, applyRowChanges])

  const addFolder = useCallback((name) => {
    const page = livePages(rowsRef.current)[currentPage]
    if (!page) return
    applyRowChanges({
      items: [{
        id: crypto.randomUUID(), page_id: page.id, folder_id: null, type: 'folder',
        content: { name },
        position: endPosition(liveTopItems(rowsRef.current, page.id)),
        deleted_at: null, updated_at: nowIso(),
      }],
    })
  }, [currentPage, applyRowChanges])

  // Hidden bookmarks are invisible inside their container, so a user deleting
  // a folder or page that "looks empty" can't know they're there. Rather than
  // tombstone them along with the container, park them (still hidden) at the
  // end of a surviving page's top level so they stay on the Hidden page.
  const relocateHidden = useCallback((rowsNow, hiddenRows, toPageId, now) => {
    let cursor = endPosition(liveTopItems(rowsNow, toPageId))
    return hiddenRows.map((row) => {
      const moved = { ...row, page_id: toPageId, folder_id: null, position: cursor, updated_at: now }
      cursor = positionBetween(cursor, '')
      return moved
    })
  }, [])

  const deleteItem = useCallback((itemId) => {
    const rowsNow = rowsRef.current
    const target = liveItem(rowsNow, itemId)
    if (!target) return
    const now = nowIso()
    const changes = [{ ...target, deleted_at: now, updated_at: now }]
    if (target.type === 'folder') {
      const children = liveFolderItems(rowsNow, itemId)
      for (const child of children) {
        if (!isHiddenRow(child)) changes.push({ ...child, deleted_at: now, updated_at: now })
      }
      changes.push(...relocateHidden(rowsNow, children.filter(isHiddenRow), target.page_id, now))
    }
    applyRowChanges({ items: changes })
  }, [applyRowChanges, relocateHidden])

  const renameItem = useCallback((itemId, pageId, newName) => {
    const target = liveItem(rowsRef.current, itemId)
    if (!target) return
    applyRowChanges({
      items: [{ ...target, content: { ...target.content, name: newName }, updated_at: nowIso() }],
    })
  }, [applyRowChanges])

  const updateBookmark = useCallback((itemId, pageId, updates) => {
    const target = liveItem(rowsRef.current, itemId)
    if (!target) return
    applyRowChanges({
      items: [{ ...target, content: { ...target.content, ...updates }, updated_at: nowIso() }],
    })
  }, [applyRowChanges])

  const moveItem = useCallback((itemId, fromPageId, toPageId, newIndex) => {
    const rowsNow = rowsRef.current
    const target = liveItem(rowsNow, itemId)
    if (!target) return
    applyRowChanges({
      items: [{
        ...target,
        page_id: toPageId,
        folder_id: null,
        position: positionAt(liveTopItems(visibleRows(rowsNow), toPageId), newIndex, itemId),
        updated_at: nowIso(),
      }],
    })
  }, [applyRowChanges])

  const addToFolder = useCallback((bookmarkId, folderId, pageId) => {
    const rowsNow = rowsRef.current
    const bookmark = liveItem(rowsNow, bookmarkId)
    const folder = liveItem(rowsNow, folderId)
    if (!bookmark || bookmark.type !== 'bookmark' || !folder || folder.type !== 'folder') return
    applyRowChanges({
      items: [{
        ...bookmark,
        page_id: folder.page_id,
        folder_id: folderId,
        position: endPosition(liveFolderItems(rowsNow, folderId)),
        updated_at: nowIso(),
      }],
    })
  }, [applyRowChanges])

  const reorderFolderItems = useCallback((folderId, pageId, oldIndex, newIndex) => {
    const children = liveFolderItems(visibleRows(rowsRef.current), folderId)
    const moved = children[oldIndex]
    if (!moved) return
    applyRowChanges({
      items: [{
        ...moved,
        position: positionAt(children, newIndex, moved.id),
        updated_at: nowIso(),
      }],
    })
  }, [applyRowChanges])

  const ejectFromFolder = useCallback((bookmarkId, folderId, pageId) => {
    const rowsNow = rowsRef.current
    const bookmark = liveItem(rowsNow, bookmarkId)
    if (!bookmark) return

    const sourceIdx = livePages(rowsNow).findIndex((p) => p.id === pageId)
    const { pageId: targetPageId, pageIdx: targetIdx, newPage } = nextFreeSlot(rowsNow, sourceIdx)

    const changes = { pages: newPage ? [newPage] : [], items: [] }
    changes.items.push({
      ...bookmark,
      page_id: targetPageId,
      folder_id: null,
      position: endPosition(liveTopItems(rowsNow, targetPageId)),
      updated_at: nowIso(),
    })
    applyRowChanges(changes)
    if (targetIdx !== currentPage) setCurrentPage(targetIdx)
  }, [currentPage, applyRowChanges])

  const removeFromFolder = useCallback((bookmarkId, folderId, pageId) => {
    const target = liveItem(rowsRef.current, bookmarkId)
    if (!target) return
    const now = nowIso()
    applyRowChanges({ items: [{ ...target, deleted_at: now, updated_at: now }] })
  }, [applyRowChanges])

  const addPage = useCallback(() => {
    applyRowChanges({
      pages: [{
        id: crypto.randomUUID(),
        position: endPosition(livePages(rowsRef.current)),
        deleted_at: null,
        updated_at: nowIso(),
      }],
    })
    setCurrentPage((prev) => prev + 1)
  }, [applyRowChanges])

  const deletePage = useCallback((pageId) => {
    const rowsNow = rowsRef.current
    const pages = livePages(rowsNow)
    if (pages.length <= 1) return
    const now = nowIso()
    const page = pages.find((p) => p.id === pageId)
    if (!page) return

    const changes = { pages: [{ ...page, deleted_at: now, updated_at: now }], items: [] }
    const folderIds = new Set()
    const hiddenRows = []
    for (const item of liveTopItems(rowsNow, pageId)) {
      if (item.type === 'folder') folderIds.add(item.id)
      if (isHiddenRow(item)) hiddenRows.push(item)
      else changes.items.push({ ...item, deleted_at: now, updated_at: now })
    }
    // Folder children track their folder, not the page they were created
    // on, so tombstone them through their parent
    for (const item of rowsNow.items) {
      if (!item.deleted_at && item.folder_id && folderIds.has(item.folder_id)) {
        if (isHiddenRow(item)) hiddenRows.push(item)
        else changes.items.push({ ...item, deleted_at: now, updated_at: now })
      }
    }
    // Hidden bookmarks survive on the nearest remaining page (previous, else next)
    if (hiddenRows.length > 0) {
      const idx = pages.findIndex((p) => p.id === pageId)
      const survivor = pages[idx - 1] || pages[idx + 1]
      changes.items.push(...relocateHidden(rowsNow, hiddenRows, survivor.id, now))
    }
    applyRowChanges(changes)
  }, [applyRowChanges, relocateHidden])

  const importData = useCallback(async (file) => {
    const parsed = await importDataUtil(file)
    const rowsNow = rowsRef.current
    const now = nowIso()
    const changes = { pages: [], items: [] }
    for (const p of rowsNow.pages) {
      if (!p.deleted_at) changes.pages.push({ ...p, deleted_at: now, updated_at: now })
    }
    for (const i of rowsNow.items) {
      if (!i.deleted_at) changes.items.push({ ...i, deleted_at: now, updated_at: now })
    }
    const source = parsed.pages.length > 0
      ? parsed
      : { pages: [{ id: crypto.randomUUID(), items: [] }] }
    const fresh = nestedToRows(source)
    // Re-imports of an old export can reuse live ids; the fresh rows come
    // last so they win over the tombstones above
    changes.pages.push(...fresh.pages)
    changes.items.push(...fresh.items)
    applyRowChanges(changes)
    setCurrentPage(0)
    setEditMode(false)
  }, [applyRowChanges])

  const exportData = useCallback(() => {
    exportDataUtil(rowsToNested(rowsRef.current))
  }, [])

  const reorderItems = useCallback((pageId, oldIndex, newIndex) => {
    const list = liveTopItems(visibleRows(rowsRef.current), pageId)
    const moved = list[oldIndex]
    if (!moved) return
    applyRowChanges({
      items: [{
        ...moved,
        position: positionAt(list, newIndex, moved.id),
        updated_at: nowIso(),
      }],
    })
  }, [applyRowChanges])

  const togglePin = useCallback((itemId) => {
    const rowsNow = rowsRef.current
    const target = liveItem(rowsNow, itemId)
    if (!target || target.type !== 'bookmark') return
    const content = { ...target.content }
    if (content.pinned) {
      delete content.pinned
      delete content.pinPosition
    } else {
      content.pinned = true
      content.pinPosition = endPosition(livePinned(rowsNow), pinPosition)
    }
    applyRowChanges({ items: [{ ...target, content, updated_at: nowIso() }] })
  }, [applyRowChanges])

  // A hidden bookmark gives up its spot: it's detached from any folder on the
  // way out, and unhiding appends it to the first page with a free slot rather
  // than restoring wherever it used to sit
  const setHidden = useCallback((itemId, hiddenFlag) => {
    const rowsNow = rowsRef.current
    const target = liveItem(rowsNow, itemId)
    if (!target || target.type !== 'bookmark') return
    const now = nowIso()
    const content = { ...target.content }
    if (hiddenFlag) {
      content.hidden = true
      applyRowChanges({ items: [{ ...target, content, folder_id: null, updated_at: now }] })
      return
    }
    delete content.hidden
    const { pageId, newPage } = nextFreeSlot(rowsNow)
    applyRowChanges({
      pages: newPage ? [newPage] : [],
      items: [{
        ...target,
        content,
        page_id: pageId,
        folder_id: null,
        position: endPosition(liveTopItems(visibleRows(rowsNow), pageId)),
        updated_at: now,
      }],
    })
  }, [applyRowChanges])

  const reorderPinned = useCallback((oldIndex, newIndex) => {
    const list = livePinned(rowsRef.current)
    const moved = list[oldIndex]
    if (!moved) return
    applyRowChanges({
      items: [{
        ...moved,
        content: {
          ...moved.content,
          pinPosition: positionAt(list, newIndex, moved.id, pinPosition),
        },
        updated_at: nowIso(),
      }],
    })
  }, [applyRowChanges])

  return {
    reorderFolderItems,
    ejectFromFolder,
    data,
    pinned,
    togglePin,
    reorderPinned,
    hidden,
    setHidden,
    currentPage,
    setCurrentPage,
    editMode,
    toggleEditMode,
    addBookmark,
    addFolder,
    deleteItem,
    renameItem,
    updateBookmark,
    moveItem,
    addToFolder,
    removeFromFolder,
    addPage,
    deletePage,
    importData,
    exportData,
    reorderItems,
  }
}
