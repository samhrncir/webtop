import { useState, useEffect, useCallback } from 'react'
import {
  readStoreCache, writeStoreCache, fetchStoreApps,
  fetchIsStoreAdmin, upsertStoreApp, deleteStoreApp,
} from '../utils/store.js'

// The catalog, cache first: whatever the last visit saw shows instantly
// (and is all an offline device gets), then a fetch replaces it. `status`
// is 'loading' until the first answer, then 'ready' or, when the fetch
// failed and nothing is cached, 'offline'.
export function useStoreCatalog() {
  const [apps, setApps] = useState(() => readStoreCache() ?? [])
  const [status, setStatus] = useState('loading')

  const refresh = useCallback(async () => {
    const { apps: fresh, error } = await fetchStoreApps()
    if (!error && fresh) {
      setApps(fresh)
      writeStoreCache(fresh)
      setStatus('ready')
    } else {
      setStatus((prev) => (prev === 'ready' ? prev : readStoreCache() ? 'ready' : 'offline'))
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Admin edits apply locally at once so the list doesn't wait on a refetch
  const replaceApp = useCallback((app) => {
    setApps((prev) => {
      const next = prev.some((a) => a.id === app.id)
        ? prev.map((a) => (a.id === app.id ? app : a))
        : [...prev, app]
      writeStoreCache(next)
      return next
    })
  }, [])

  const removeApp = useCallback((id) => {
    setApps((prev) => {
      const next = prev.filter((a) => a.id !== id)
      writeStoreCache(next)
      return next
    })
  }, [])

  return { apps, status, refresh, replaceApp, removeApp }
}

// Whether this user may manage listings, plus the write calls. `isAdmin`
// only gates the UI; RLS is what actually refuses writes from anyone else.
export function useStoreAdmin({ replaceApp, removeApp } = {}) {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchIsStoreAdmin().then((yes) => { if (!cancelled) setIsAdmin(yes) })
    return () => { cancelled = true }
  }, [])

  const saveApp = useCallback(async (row) => {
    const { app, error } = await upsertStoreApp(row)
    if (!error && app) replaceApp?.(app)
    return { app, error }
  }, [replaceApp])

  const deleteApp = useCallback(async (id) => {
    const { error } = await deleteStoreApp(id)
    if (!error) removeApp?.(id)
    return { error }
  }, [removeApp])

  return { isAdmin, saveApp, deleteApp }
}
