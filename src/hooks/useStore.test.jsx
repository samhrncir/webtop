import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useStoreCatalog, useStoreAdmin } from './useStore.js'
import * as store from '../utils/store.js'

// The hook runs against the inert Supabase stub, so every fetch fails the
// way a dead network would; the cache is what keeps the store usable.

const app = (slug, over = {}) => ({ id: `id-${slug}`, slug, name: slug, url: `https://${slug}.test`, published: true, ...over })

describe('useStoreCatalog', () => {
  it('shows the cached catalog instantly and stays ready when the fetch fails', async () => {
    store.writeStoreCache([app('a')])
    const { result } = renderHook(() => useStoreCatalog())
    expect(result.current.apps).toHaveLength(1)
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('reports offline when nothing is cached and the fetch fails', async () => {
    const { result } = renderHook(() => useStoreCatalog())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('offline'))
    expect(result.current.apps).toEqual([])
  })

  it('replaces the cache when a fetch succeeds', async () => {
    store.writeStoreCache([app('stale')])
    vi.spyOn(store, 'fetchStoreApps').mockResolvedValue({ apps: [app('fresh')], error: null })
    const { result } = renderHook(() => useStoreCatalog())
    await waitFor(() => expect(result.current.apps.map((a) => a.slug)).toEqual(['fresh']))
    expect(store.readStoreCache().map((a) => a.slug)).toEqual(['fresh'])
    expect(result.current.status).toBe('ready')
  })

  it('applies admin edits locally: replace by id, append new, remove', async () => {
    store.writeStoreCache([app('a'), app('b')])
    const { result } = renderHook(() => useStoreCatalog())
    act(() => result.current.replaceApp(app('a', { name: 'A!' })))
    act(() => result.current.replaceApp(app('c')))
    act(() => result.current.removeApp('id-b'))
    expect(result.current.apps.map((a) => a.name)).toEqual(['A!', 'c'])
    expect(store.readStoreCache().map((a) => a.slug)).toEqual(['a', 'c'])
  })
})

describe('useStoreAdmin', () => {
  it('is not an admin without a store_admins row, and surfaces write errors', async () => {
    const replaceApp = vi.fn()
    const removeApp = vi.fn()
    const { result } = renderHook(() => useStoreAdmin({ replaceApp, removeApp }))
    expect(result.current.isAdmin).toBe(false)
    const saved = await result.current.saveApp({ slug: 'x', name: 'X', url: 'https://x.test' })
    expect(saved.error).toBeTruthy()
    expect(replaceApp).not.toHaveBeenCalled()
    const deleted = await result.current.deleteApp('id-x')
    expect(deleted.error).toBeTruthy()
    expect(removeApp).not.toHaveBeenCalled()
  })

  it('becomes an admin when the server says so and pushes successful writes into the catalog', async () => {
    vi.spyOn(store, 'fetchIsStoreAdmin').mockResolvedValue(true)
    vi.spyOn(store, 'upsertStoreApp').mockResolvedValue({ app: app('x'), error: null })
    vi.spyOn(store, 'deleteStoreApp').mockResolvedValue({ error: null })
    const replaceApp = vi.fn()
    const removeApp = vi.fn()
    const { result } = renderHook(() => useStoreAdmin({ replaceApp, removeApp }))
    await waitFor(() => expect(result.current.isAdmin).toBe(true))
    await act(() => result.current.saveApp({ slug: 'x' }))
    expect(replaceApp).toHaveBeenCalledWith(app('x'))
    await act(() => result.current.deleteApp('id-x'))
    expect(removeApp).toHaveBeenCalledWith('id-x')
  })
})
