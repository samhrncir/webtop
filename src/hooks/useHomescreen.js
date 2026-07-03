import { useState, useEffect, useCallback, useRef } from 'react'
import {
  loadData, saveData, mergeData,
  fetchFromServer, syncToServer,
  hasPendingSync, setPendingSync, clearPendingSync,
  exportData as exportDataUtil, importData as importDataUtil,
} from '../utils/storage.js'

export function useHomescreen() {
  const [data, setData] = useState(() => loadData())
  const [currentPage, setCurrentPage] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const syncTimerRef = useRef(null)
  // JSON of the last state confirmed written to the server
  const lastSyncedRef = useRef(null)
  // Version token (updated_at) of the server row we last saw — conditional
  // writes use this so a stale session can't silently overwrite a newer copy
  const serverUpdatedAtRef = useRef(null)
  // Pushes are blocked until the initial server reconcile has succeeded, so
  // stale/empty local data can never race past the fetch and clobber the server
  const hydratedRef = useRef(false)
  const dataRef = useRef(data)
  // Snapshot of what was loaded from localStorage, to tell "user edited
  // something" apart from "initial render" when marking the dirty flag
  const initialSerializedRef = useRef(null)
  if (initialSerializedRef.current === null) {
    initialSerializedRef.current = JSON.stringify(data)
  }

  const pushToServer = useCallback(async (payload) => {
    const serialized = JSON.stringify(payload)
    const result = await syncToServer(payload, serverUpdatedAtRef.current)
    if (result.status === 'ok') {
      serverUpdatedAtRef.current = result.updatedAt
      lastSyncedRef.current = serialized
      clearPendingSync()
    } else if (result.status === 'conflict') {
      // Another session wrote first — pull its copy, merge ours in, and let
      // the data effect re-push the merged result with the fresh version token
      const server = await fetchFromServer()
      if (server.status === 'ok') {
        serverUpdatedAtRef.current = server.updatedAt
        const merged = mergeData(dataRef.current, server.data)
        const mergedSerialized = JSON.stringify(merged)
        if (mergedSerialized === JSON.stringify(server.data)) {
          // Nothing local to contribute — adopt server copy as synced
          lastSyncedRef.current = mergedSerialized
          clearPendingSync()
        }
        setData(merged)
      }
    }
    // 'error' (offline etc.): dirty flag stays set; retried on 'online' or next edit
  }, [])

  // Reconcile local state with the server: adopt the server copy when local is
  // clean, merge when local has unsynced edits (dirty flag), push local up when
  // the server has nothing. Runs on mount and when connectivity returns.
  const reconcile = useCallback(async (attempt = 0) => {
    const server = await fetchFromServer()
    if (server.status === 'error') return // unreachable — stay unhydrated, retry on 'online'

    if (server.status === 'empty' || server.status === 'invalid') {
      // No usable server copy — push local up
      if (server.status === 'invalid') serverUpdatedAtRef.current = server.updatedAt
      const local = dataRef.current
      const result = await syncToServer(local, serverUpdatedAtRef.current)
      if (result.status === 'ok') {
        serverUpdatedAtRef.current = result.updatedAt
        lastSyncedRef.current = JSON.stringify(local)
        clearPendingSync()
        hydratedRef.current = true
      } else if (result.status === 'conflict' && attempt < 2) {
        // A row appeared concurrently — re-run against it
        return reconcile(attempt + 1)
      }
      return
    }

    // Guard against adopting a stale fetch that raced with an in-flight push
    if (
      hydratedRef.current &&
      serverUpdatedAtRef.current &&
      server.updatedAt <= serverUpdatedAtRef.current
    ) return

    serverUpdatedAtRef.current = server.updatedAt
    if (hasPendingSync()) {
      // Local has edits the server never saw — merge instead of letting the
      // server copy overwrite them
      const merged = mergeData(dataRef.current, server.data)
      const mergedSerialized = JSON.stringify(merged)
      if (mergedSerialized === JSON.stringify(server.data)) {
        lastSyncedRef.current = mergedSerialized
        clearPendingSync()
      }
      hydratedRef.current = true
      setData(merged) // if still dirty, the data effect pushes the merge up
    } else {
      lastSyncedRef.current = JSON.stringify(server.data)
      hydratedRef.current = true
      setData(server.data)
    }
  }, [])

  // Save to localStorage and debounce sync to server on every data change
  useEffect(() => {
    dataRef.current = data
    saveData(data)

    const serialized = JSON.stringify(data)
    if (serialized === lastSyncedRef.current) return
    // Mark dirty so edits survive a close/reload even if the push never fires
    if (serialized !== initialSerializedRef.current) setPendingSync()
    if (!hydratedRef.current) return // initial reconcile hasn't completed yet

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => pushToServer(dataRef.current), 800)

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  }, [data, pushToServer])

  // On mount: reconcile with the server; re-reconcile when connectivity returns
  useEffect(() => {
    reconcile()
    const handleOnline = () => reconcile()
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [reconcile])

  // Clamp currentPage if pages are removed
  useEffect(() => {
    if (currentPage >= data.pages.length) {
      setCurrentPage(Math.max(0, data.pages.length - 1))
    }
  }, [data.pages.length, currentPage])

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => !prev)
  }, [])

  const addBookmark = useCallback((url, name) => {
    setData((prev) => ({
      ...prev,
      pages: prev.pages.map((page, idx) => {
        if (idx !== currentPage) return page
        return { ...page, items: [...page.items, { id: crypto.randomUUID(), type: 'bookmark', name, url }] }
      }),
    }))
  }, [currentPage])

  const addFolder = useCallback((name) => {
    setData((prev) => ({
      ...prev,
      pages: prev.pages.map((page, idx) => {
        if (idx !== currentPage) return page
        return { ...page, items: [...page.items, { id: crypto.randomUUID(), type: 'folder', name, items: [] }] }
      }),
    }))
  }, [currentPage])

  const deleteItem = useCallback((itemId, pageId) => {
    setData((prev) => {
      const pages = prev.pages.map((page) => {
        if (page.id !== pageId) return page
        return { ...page, items: page.items.filter((item) => item.id !== itemId) }
      })
      return { ...prev, pages }
    })
  }, [])

  const renameItem = useCallback((itemId, pageId, newName) => {
    setData((prev) => {
      const pages = prev.pages.map((page) => {
        if (page.id !== pageId) return page
        return {
          ...page,
          items: page.items.map((item) =>
            item.id === itemId ? { ...item, name: newName } : item
          ),
        }
      })
      return { ...prev, pages }
    })
  }, [])

  const updateBookmark = useCallback((itemId, pageId, updates) => {
    setData((prev) => {
      const pages = prev.pages.map((page) => {
        if (page.id !== pageId) return page
        return {
          ...page,
          items: page.items.map((item) =>
            item.id === itemId ? { ...item, ...updates } : item
          ),
        }
      })
      return { ...prev, pages }
    })
  }, [])

  const moveItem = useCallback((itemId, fromPageId, toPageId, newIndex) => {
    setData((prev) => {
      let movingItem = null
      const pagesAfterRemove = prev.pages.map((page) => {
        if (page.id !== fromPageId) return page
        const item = page.items.find((i) => i.id === itemId)
        if (item) movingItem = item
        return { ...page, items: page.items.filter((i) => i.id !== itemId) }
      })

      if (!movingItem) return prev

      const pagesAfterInsert = pagesAfterRemove.map((page) => {
        if (page.id !== toPageId) return page
        const items = [...page.items]
        const clampedIndex = Math.min(newIndex, items.length)
        items.splice(clampedIndex, 0, movingItem)
        return { ...page, items }
      })

      return { ...prev, pages: pagesAfterInsert }
    })
  }, [])

  const addToFolder = useCallback((bookmarkId, folderId, pageId) => {
    setData((prev) => {
      let bookmark = null
      const pagesCopy = prev.pages.map((page) => {
        if (page.id !== pageId) return page
        const bm = page.items.find((i) => i.id === bookmarkId && i.type === 'bookmark')
        if (bm) bookmark = bm
        return { ...page, items: page.items.filter((i) => i.id !== bookmarkId) }
      })

      if (!bookmark) return prev

      const pagesWithFolder = pagesCopy.map((page) => {
        if (page.id !== pageId) return page
        return {
          ...page,
          items: page.items.map((item) => {
            if (item.id !== folderId || item.type !== 'folder') return item
            return { ...item, items: [...item.items, bookmark] }
          }),
        }
      })

      return { ...prev, pages: pagesWithFolder }
    })
  }, [])

  const reorderFolderItems = useCallback((folderId, pageId, oldIndex, newIndex) => {
    setData((prev) => {
      const pages = prev.pages.map((page) => {
        if (page.id !== pageId) return page
        return {
          ...page,
          items: page.items.map((item) => {
            if (item.id !== folderId || item.type !== 'folder') return item
            const items = [...item.items]
            const [removed] = items.splice(oldIndex, 1)
            items.splice(newIndex, 0, removed)
            return { ...item, items }
          }),
        }
      })
      return { ...prev, pages }
    })
  }, [])

  const ejectFromFolder = useCallback((bookmarkId, folderId, pageId) => {
    const sourceIdx = data.pages.findIndex((p) => p.id === pageId)
    const targetIdx = data.pages.findIndex((page, idx) => idx >= sourceIdx && page.items.length < 20)

    setData((prev) => {
      let ejected = null
      const pagesAfterRemove = prev.pages.map((page) => {
        if (page.id !== pageId) return page
        return {
          ...page,
          items: page.items.map((item) => {
            if (item.id !== folderId || item.type !== 'folder') return item
            const bm = item.items.find((b) => b.id === bookmarkId)
            if (bm) ejected = bm
            return { ...item, items: item.items.filter((b) => b.id !== bookmarkId) }
          }),
        }
      })
      if (!ejected) return prev

      let pages = pagesAfterRemove
      let resolvedIdx = targetIdx

      if (resolvedIdx === -1) {
        pages = [...pagesAfterRemove, { id: crypto.randomUUID(), items: [] }]
        resolvedIdx = pages.length - 1
      }

      return {
        ...prev,
        pages: pages.map((page, idx) => {
          if (idx !== resolvedIdx) return page
          return { ...page, items: [...page.items, ejected] }
        }),
      }
    })

    const newPage = targetIdx !== -1 ? targetIdx : data.pages.length
    if (newPage !== currentPage) setCurrentPage(newPage)
  }, [currentPage, data.pages])

  const removeFromFolder = useCallback((bookmarkId, folderId, pageId) => {
    setData((prev) => {
      const pages = prev.pages.map((page) => {
        if (page.id !== pageId) return page
        return {
          ...page,
          items: page.items.map((item) => {
            if (item.id !== folderId || item.type !== 'folder') return item
            return { ...item, items: item.items.filter((bm) => bm.id !== bookmarkId) }
          }),
        }
      })
      return { ...prev, pages }
    })
  }, [])

  const addPage = useCallback(() => {
    setData((prev) => ({
      ...prev,
      pages: [
        ...prev.pages,
        { id: crypto.randomUUID(), items: [] },
      ],
    }))
    setCurrentPage((prev) => prev + 1)
  }, [])

  const deletePage = useCallback((pageId) => {
    setData((prev) => {
      if (prev.pages.length <= 1) return prev
      const newPages = prev.pages.filter((p) => p.id !== pageId)
      return { ...prev, pages: newPages }
    })
  }, [])

  const importData = useCallback(async (file) => {
    const parsed = await importDataUtil(file)
    setData(parsed)
    setCurrentPage(0)
    setEditMode(false)
  }, [])

  const exportData = useCallback(() => {
    exportDataUtil()
  }, [])

  const reorderItems = useCallback((pageId, oldIndex, newIndex) => {
    setData((prev) => {
      const pages = prev.pages.map((page) => {
        if (page.id !== pageId) return page
        const items = [...page.items]
        const [removed] = items.splice(oldIndex, 1)
        items.splice(newIndex, 0, removed)
        return { ...page, items }
      })
      return { ...prev, pages }
    })
  }, [])

  return {
    reorderFolderItems,
    ejectFromFolder,
    data,
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
