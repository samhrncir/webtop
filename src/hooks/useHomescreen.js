import { useState, useEffect, useCallback, useRef } from 'react'
import {
  loadData, saveData,
  fetchFromServer, syncToServer, hasPendingSync,
  exportData as exportDataUtil, importData as importDataUtil,
} from '../utils/storage.js'

export function useHomescreen() {
  const [data, setData] = useState(() => loadData())
  const [currentPage, setCurrentPage] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const syncTimerRef = useRef(null)
  const lastSyncedRef = useRef(null)

  // Save to localStorage and debounce sync to server on every data change
  useEffect(() => {
    saveData(data)

    const serialized = JSON.stringify(data)
    if (serialized === lastSyncedRef.current) return

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(async () => {
      const ok = await syncToServer(data)
      if (ok) lastSyncedRef.current = serialized
    }, 800)

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  }, [data])

  // On mount: load from server, retry pending syncs when coming back online
  useEffect(() => {
    let cancelled = false

    async function init() {
      const serverData = await fetchFromServer()
      if (cancelled) return
      if (serverData) {
        lastSyncedRef.current = JSON.stringify(serverData)
        setData(serverData)
      } else {
        // New device for this user — push existing local data up
        const local = loadData()
        const ok = await syncToServer(local)
        if (ok) lastSyncedRef.current = JSON.stringify(local)
      }
    }

    init()

    const handleOnline = () => {
      if (hasPendingSync()) syncToServer(loadData())
    }
    window.addEventListener('online', handleOnline)

    return () => {
      cancelled = true
      window.removeEventListener('online', handleOnline)
    }
  }, [])

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
    const targetIdx = data.pages.findIndex((page, idx) => idx >= currentPage && page.items.length < 20)

    setData((prev) => {
      let pages = prev.pages
      let resolvedIdx = targetIdx

      if (resolvedIdx === -1) {
        pages = [...prev.pages, { id: crypto.randomUUID(), items: [] }]
        resolvedIdx = pages.length - 1
      }

      return {
        ...prev,
        pages: pages.map((page, idx) => {
          if (idx !== resolvedIdx) return page
          return { ...page, items: [...page.items, { id: crypto.randomUUID(), type: 'bookmark', name, url }] }
        }),
      }
    })

    const newPage = targetIdx !== -1 ? targetIdx : data.pages.length
    if (newPage !== currentPage) setCurrentPage(newPage)
  }, [currentPage, data.pages])

  const addFolder = useCallback((name) => {
    const targetIdx = data.pages.findIndex((page, idx) => idx >= currentPage && page.items.length < 20)

    setData((prev) => {
      let pages = prev.pages
      let resolvedIdx = targetIdx

      if (resolvedIdx === -1) {
        pages = [...prev.pages, { id: crypto.randomUUID(), items: [] }]
        resolvedIdx = pages.length - 1
      }

      return {
        ...prev,
        pages: pages.map((page, idx) => {
          if (idx !== resolvedIdx) return page
          return { ...page, items: [...page.items, { id: crypto.randomUUID(), type: 'folder', name, items: [] }] }
        }),
      }
    })

    const newPage = targetIdx !== -1 ? targetIdx : data.pages.length
    if (newPage !== currentPage) setCurrentPage(newPage)
  }, [currentPage, data.pages])

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
