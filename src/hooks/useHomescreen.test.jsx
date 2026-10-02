import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHomescreen } from './useHomescreen.js'

// Behavioral specs for the homescreen data layer. These run fully offline:
// the hook bootstraps from localStorage and the Supabase stub answers like a
// dead network, so every path below is the same one an offline user takes.

const NOW = new Date().toISOString()

const page = (id, position) => ({ id, position, deleted_at: null, updated_at: NOW })
const bm = (id, page_id, position, content = {}, over = {}) => ({
  id, page_id, folder_id: null, type: 'bookmark', position,
  deleted_at: null, updated_at: NOW,
  content: { name: id, url: `https://${id}.test`, ...content },
  ...over,
})
const folder = (id, page_id, position, name = id) => ({
  ...bm(id, page_id, position, {}), type: 'folder', content: { name },
})

function mount(rows) {
  localStorage.setItem('browserhome_rows', JSON.stringify(rows))
  localStorage.setItem('browserhome_dirty', JSON.stringify({ pages: [], items: [] }))
  return renderHook(() => useHomescreen())
}

const gridIds = (hs, pageIdx = 0) => hs.data.pages[pageIdx]?.items.map((i) => i.id) ?? []
const folderChildIds = (hs, folderId, pageIdx = 0) =>
  hs.data.pages[pageIdx].items.find((i) => i.id === folderId)?.items.map((c) => c.id)

describe('hiding a bookmark', () => {
  it('removes it from the home screen and lists it under hidden', () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [bm('b1', 'p1', 'a'), bm('b2', 'p1', 'b')] })
    act(() => result.current.setHidden('b1', true))
    expect(gridIds(result.current)).toEqual(['b2'])
    expect(result.current.hidden.map((h) => h.id)).toEqual(['b1'])
  })

  it('detaches it from its folder, so it survives the folder being deleted', () => {
    const { result } = mount({
      pages: [page('p1', 'a')],
      items: [folder('f1', 'p1', 'a'), bm('c1', 'p1', 'a', {}, { folder_id: 'f1' })],
    })
    act(() => result.current.setHidden('c1', true))
    expect(folderChildIds(result.current, 'f1')).toEqual([])

    // The folder now looks empty; deleting it must not take the hidden
    // bookmark down with it (regression: they used to be tombstoned)
    act(() => result.current.deleteItem('f1'))
    expect(result.current.hidden.map((h) => h.id)).toEqual(['c1'])
  })

  it('unhide appends to the end of the first page with room', () => {
    const { result } = mount({
      pages: [page('p1', 'a')],
      items: [bm('b1', 'p1', 'a'), bm('h1', 'p1', 'b', { hidden: true })],
    })
    act(() => result.current.setHidden('h1', false))
    expect(gridIds(result.current)).toEqual(['b1', 'h1'])
    expect(result.current.hidden).toHaveLength(0)
  })

  it('unhide overflows to a new page when every page is full', () => {
    const filler = Array.from({ length: 20 }, (_, i) =>
      bm(`b${i}`, 'p1', `a${String(i).padStart(2, '0')}`)
    )
    const { result } = mount({
      pages: [page('p1', 'a')],
      items: [...filler, bm('h1', 'p1', 'z', { hidden: true })],
    })
    act(() => result.current.setHidden('h1', false))
    expect(result.current.data.pages).toHaveLength(2)
    expect(gridIds(result.current, 1)).toEqual(['h1'])
  })
})

describe('recycle bin', () => {
  it('a deleted folder is listed with its contents and restores intact', () => {
    const { result } = mount({
      pages: [page('p1', 'a')],
      items: [
        folder('f1', 'p1', 'a', 'Work'),
        bm('c1', 'p1', 'a', {}, { folder_id: 'f1' }),
        bm('c2', 'p1', 'b', {}, { folder_id: 'f1' }),
      ],
    })
    act(() => result.current.deleteItem('f1'))
    expect(gridIds(result.current)).toEqual([])
    expect(result.current.trash.folders).toMatchObject([{ name: 'Work', itemCount: 2 }])

    act(() => result.current.restoreFolder('f1'))
    expect(folderChildIds(result.current, 'f1')).toEqual(['c1', 'c2'])
    expect(result.current.trash.folders).toHaveLength(0)
  })

  it('a deleted page restores as the last page with everything it held', () => {
    const { result } = mount({
      pages: [page('p1', 'a'), page('p2', 'b')],
      items: [
        bm('keep', 'p1', 'a'),
        bm('b2', 'p2', 'a'),
        folder('f2', 'p2', 'b'),
        bm('c2', 'p2', 'a', {}, { folder_id: 'f2' }),
      ],
    })
    act(() => result.current.deletePage('p2'))
    expect(result.current.data.pages).toHaveLength(1)
    expect(result.current.trash.pages).toMatchObject([{ itemCount: 2 }])
    // The folder went down with its page — it is covered by the page entry,
    // not double-listed as its own bin row
    expect(result.current.trash.folders).toHaveLength(0)

    act(() => result.current.restorePage(result.current.trash.pages[0].id))
    const pages = result.current.data.pages
    expect(pages).toHaveLength(2)
    expect(pages[1].items.map((i) => i.id)).toEqual(['b2', 'f2'])
    expect(pages[1].items[1].items.map((c) => c.id)).toEqual(['c2'])
    expect(result.current.trash.pages).toHaveLength(0)
  })
})

describe('taskbar pins', () => {
  it('pins keep their own order, reorder independently, and unpin', () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [bm('b1', 'p1', 'a'), bm('b2', 'p1', 'b')] })
    act(() => result.current.togglePin('b1'))
    act(() => result.current.togglePin('b2'))
    expect(result.current.pinned.map((p) => p.id)).toEqual(['b1', 'b2'])

    act(() => result.current.reorderPinned(0, 1))
    expect(result.current.pinned.map((p) => p.id)).toEqual(['b2', 'b1'])

    act(() => result.current.togglePin('b1'))
    expect(result.current.pinned.map((p) => p.id)).toEqual(['b2'])
  })

  it('hiding a pinned bookmark removes it from the taskbar too', () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [bm('b1', 'p1', 'a')] })
    act(() => result.current.togglePin('b1'))
    act(() => result.current.setHidden('b1', true))
    expect(result.current.pinned).toHaveLength(0)
  })
})

describe('favorites', () => {
  it('toggleFavorite flips the flag and it rides the content blob', () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [bm('b1', 'p1', 'a')] })
    act(() => result.current.toggleFavorite('b1'))
    expect(result.current.data.pages[0].items[0].favorite).toBe(true)
    act(() => result.current.toggleFavorite('b1'))
    expect(result.current.data.pages[0].items[0].favorite).toBeUndefined()
  })

  it('only bookmarks can be favorited', () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [folder('f1', 'p1', 'a')] })
    act(() => result.current.toggleFavorite('f1'))
    expect(result.current.data.pages[0].items[0].favorite).toBeUndefined()
  })
})

describe('site accounts', () => {
  it('toggleAccount notes that the user has an account on the site', () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [bm('b1', 'p1', 'a')] })
    act(() => result.current.toggleAccount('b1'))
    expect(result.current.data.pages[0].items[0].hasAccount).toBe(true)
    act(() => result.current.toggleAccount('b1'))
    expect(result.current.data.pages[0].items[0].hasAccount).toBeUndefined()
  })

  it('toggling the note off also forgets that the account was closed', () => {
    const { result } = mount({
      pages: [page('p1', 'a')],
      items: [bm('b1', 'p1', 'a', { hasAccount: true, accountClosed: true })],
    })
    act(() => result.current.toggleAccount('b1'))
    const item = result.current.data.pages[0].items[0]
    expect(item.hasAccount).toBeUndefined()
    expect(item.accountClosed).toBeUndefined()
  })

  it('only bookmarks can carry the account note', () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [folder('f1', 'p1', 'a')] })
    act(() => result.current.toggleAccount('f1'))
    expect(result.current.data.pages[0].items[0].hasAccount).toBeUndefined()
  })
})

describe('editing bookmarks', () => {
  it('addBookmark appends to the current page', () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [bm('b1', 'p1', 'a')] })
    act(() => result.current.addBookmark('https://new.test', 'New One'))
    const items = result.current.data.pages[0].items
    expect(items).toHaveLength(2)
    expect(items[1]).toMatchObject({ name: 'New One', url: 'https://new.test' })
  })

  it('updateBookmark merges into content without clobbering other keys', () => {
    const { result } = mount({
      pages: [page('p1', 'a')],
      items: [bm('b1', 'p1', 'a', { tags: ['work'] })],
    })
    act(() => result.current.updateBookmark('b1', 'p1', { emoji: '🚀' }))
    expect(result.current.data.pages[0].items[0]).toMatchObject({ emoji: '🚀', tags: ['work'] })
  })

  it('deleteItem tombstones a bookmark (bookmarks are not binned)', () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [bm('b1', 'p1', 'a')] })
    act(() => result.current.deleteItem('b1'))
    expect(gridIds(result.current)).toEqual([])
    expect(result.current.trash.pages).toHaveLength(0)
    expect(result.current.trash.folders).toHaveLength(0)
  })

  it('reorderItems indexes into the visible list even with hidden rows interleaved', () => {
    const { result } = mount({
      pages: [page('p1', 'a')],
      items: [
        bm('b1', 'p1', 'a'),
        bm('h1', 'p1', 'b', { hidden: true }),
        bm('b2', 'p1', 'c'),
        bm('b3', 'p1', 'd'),
      ],
    })
    // Visible order is [b1, b2, b3]; move b1 to the end of the *visible* list
    act(() => result.current.reorderItems('p1', 0, 2))
    expect(gridIds(result.current)).toEqual(['b2', 'b3', 'b1'])
  })
})

describe('pages', () => {
  it('addPage appends an empty page and navigates to it', () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [bm('b1', 'p1', 'a')] })
    act(() => result.current.addPage())
    expect(result.current.data.pages).toHaveLength(2)
    expect(result.current.data.pages[1].items).toEqual([])
    expect(result.current.currentPage).toBe(1)
  })

  it('deletePage refuses to delete the last remaining page', () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [bm('b1', 'p1', 'a')] })
    act(() => result.current.deletePage('p1'))
    expect(result.current.data.pages).toHaveLength(1)
    expect(gridIds(result.current)).toEqual(['b1'])
  })

  it('deletePage ignores unknown page ids', () => {
    const { result } = mount({ pages: [page('p1', 'a'), page('p2', 'b')], items: [] })
    act(() => result.current.deletePage('nope'))
    expect(result.current.data.pages).toHaveLength(2)
  })
})

describe('folders', () => {
  const twoChildFolder = () => ({
    pages: [page('p1', 'a')],
    items: [
      folder('f1', 'p1', 'a'),
      bm('c1', 'p1', 'a', {}, { folder_id: 'f1' }),
      bm('c2', 'p1', 'b', {}, { folder_id: 'f1' }),
    ],
  })

  it('addFolder creates an empty folder on the current page', () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [bm('b1', 'p1', 'a')] })
    act(() => result.current.addFolder('Stuff'))
    const items = result.current.data.pages[0].items
    expect(items[1]).toMatchObject({ type: 'folder', name: 'Stuff', items: [] })
  })

  it('addToFolder moves a bookmark in at the end of the folder', () => {
    const { result } = mount({
      pages: [page('p1', 'a')],
      items: [folder('f1', 'p1', 'a'), bm('c1', 'p1', 'a', {}, { folder_id: 'f1' }), bm('b1', 'p1', 'b')],
    })
    act(() => result.current.addToFolder('b1', 'f1', 'p1'))
    expect(gridIds(result.current)).toEqual(['f1'])
    expect(folderChildIds(result.current, 'f1')).toEqual(['c1', 'b1'])
  })

  it('addToFolder refuses non-folders and missing rows', () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [bm('b1', 'p1', 'a'), bm('b2', 'p1', 'b')] })
    act(() => result.current.addToFolder('b1', 'b2', 'p1')) // target is a bookmark
    act(() => result.current.addToFolder('ghost', 'b2', 'p1'))
    expect(gridIds(result.current)).toEqual(['b1', 'b2'])
  })

  it('reorderFolderItems reorders children by visible index', () => {
    const { result } = mount(twoChildFolder())
    act(() => result.current.reorderFolderItems('f1', 'p1', 0, 1))
    expect(folderChildIds(result.current, 'f1')).toEqual(['c2', 'c1'])
  })

  it('removeFromFolder deletes the bookmark outright', () => {
    const { result } = mount(twoChildFolder())
    act(() => result.current.removeFromFolder('c1', 'f1', 'p1'))
    expect(folderChildIds(result.current, 'f1')).toEqual(['c2'])
    expect(result.current.hidden).toHaveLength(0)
    expect(result.current.trash.folders).toHaveLength(0)
  })

  it('ejectFromFolder drops the bookmark back onto the page when there is room', () => {
    const { result } = mount(twoChildFolder())
    act(() => result.current.ejectFromFolder('c1', 'f1', 'p1'))
    expect(gridIds(result.current)).toEqual(['f1', 'c1'])
    expect(folderChildIds(result.current, 'f1')).toEqual(['c2'])
  })

  it('ejectFromFolder overflows to a new page when the source page is full', () => {
    const filler = Array.from({ length: 19 }, (_, i) =>
      bm(`b${i}`, 'p1', `b${String(i).padStart(2, '0')}`)
    )
    const { result } = mount({
      pages: [page('p1', 'a')],
      items: [folder('f1', 'p1', 'a'), ...filler, bm('c1', 'p1', 'a', {}, { folder_id: 'f1' })],
    })
    act(() => result.current.ejectFromFolder('c1', 'f1', 'p1'))
    expect(result.current.data.pages).toHaveLength(2)
    expect(gridIds(result.current, 1)).toEqual(['c1'])
    expect(result.current.currentPage).toBe(1) // follows the ejected bookmark
  })
})

describe('moving between pages', () => {
  it('moveItem places the item at the target index among visible items', () => {
    const { result } = mount({
      pages: [page('p1', 'a'), page('p2', 'b')],
      items: [bm('b1', 'p1', 'a'), bm('b2', 'p1', 'b'), bm('x1', 'p2', 'a'), bm('x2', 'p2', 'b')],
    })
    act(() => result.current.moveItem('b1', 'p1', 'p2', 1))
    expect(gridIds(result.current, 0)).toEqual(['b2'])
    expect(gridIds(result.current, 1)).toEqual(['x1', 'b1', 'x2'])
  })

  it('moveItem clears folder membership on the way out', () => {
    const { result } = mount({
      pages: [page('p1', 'a'), page('p2', 'b')],
      items: [folder('f1', 'p1', 'a'), bm('c1', 'p1', 'a', {}, { folder_id: 'f1' })],
    })
    act(() => result.current.moveItem('c1', 'p1', 'p2', 0))
    expect(folderChildIds(result.current, 'f1')).toEqual([])
    expect(gridIds(result.current, 1)).toEqual(['c1'])
  })
})

describe('renaming', () => {
  it('renameItem changes the label and keeps everything else', () => {
    const { result } = mount({
      pages: [page('p1', 'a')],
      items: [bm('b1', 'p1', 'a', { tags: ['work'] })],
    })
    act(() => result.current.renameItem('b1', 'p1', 'Renamed'))
    expect(result.current.data.pages[0].items[0]).toMatchObject({
      name: 'Renamed', url: 'https://b1.test', tags: ['work'],
    })
  })
})

describe('import / export', () => {
  const readBlob = (blob) => new Promise((resolve) => {
    const r = new FileReader()
    r.onload = (e) => resolve(e.target.result)
    r.readAsText(blob)
  })

  function captureDownload() {
    const captured = {}
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { captured.blob = blob; return 'blob:test' })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { captured.filename = this.download })
    return captured
  }

  it('exportData downloads the current data as a dated JSON backup', async () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [bm('b1', 'p1', 'a', { tags: ['work'] })] })
    const captured = captureDownload()
    act(() => result.current.exportData())
    expect(captured.filename).toMatch(/^webtop-backup-\d{4}-\d{2}-\d{2}\.json$/)
    const parsed = JSON.parse(await readBlob(captured.blob))
    expect(parsed.pages[0].items[0]).toMatchObject({ id: 'b1', name: 'b1', tags: ['work'] })
  })

  it('importData replaces everything with the file contents and returns to page 1', async () => {
    const { result } = mount({ pages: [page('p1', 'a'), page('p2', 'b')], items: [bm('old', 'p1', 'a')] })
    act(() => result.current.setCurrentPage(1))
    const blob = { pages: [{ id: 'np', items: [{ id: 'nb', type: 'bookmark', name: 'Imported', url: 'https://i.test' }] }] }
    const file = new File([JSON.stringify(blob)], 'backup.json', { type: 'application/json' })
    await act(async () => { await result.current.importData(file) })
    expect(result.current.data.pages).toHaveLength(1)
    expect(gridIds(result.current)).toEqual(['nb'])
    expect(result.current.currentPage).toBe(0)
  })

  it('hidden bookmarks survive an export/import round trip', async () => {
    const { result } = mount({
      pages: [page('p1', 'a')],
      items: [bm('b1', 'p1', 'a'), bm('h1', 'p1', 'b', { hidden: true })],
    })
    const captured = captureDownload()
    act(() => result.current.exportData())
    const text = await readBlob(captured.blob)

    const file = new File([text], 'backup.json', { type: 'application/json' })
    await act(async () => { await result.current.importData(file) })
    expect(gridIds(result.current)).toEqual(['b1'])
    expect(result.current.hidden.map((h) => h.id)).toEqual(['h1'])
  })

  it('importData rejects non-JSON files and leaves the data alone', async () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [bm('b1', 'p1', 'a')] })
    const file = new File(['nope'], 'notes.txt', { type: 'text/plain' })
    await expect(result.current.importData(file)).rejects.toThrow()
    expect(gridIds(result.current)).toEqual(['b1'])
  })
})

describe('persistence', () => {
  it('mutations survive a remount (fresh hook, same storage)', () => {
    const first = mount({ pages: [page('p1', 'a')], items: [bm('b1', 'p1', 'a')] })
    act(() => first.result.current.addBookmark('https://new.test', 'Kept'))
    act(() => first.result.current.togglePin('b1'))
    first.unmount()

    const second = renderHook(() => useHomescreen()) // no re-seed: reads storage
    expect(second.result.current.data.pages[0].items.map((i) => i.name)).toEqual(['b1', 'Kept'])
    expect(second.result.current.pinned.map((p) => p.id)).toEqual(['b1'])
  })

  it('first run with no v2 rows seeds from the legacy v1 blob', () => {
    localStorage.setItem('browserhome_data', JSON.stringify({
      pages: [{ id: 'lp', items: [{ id: 'lb', type: 'bookmark', name: 'Legacy', url: 'https://l.test' }] }],
    }))
    const { result } = renderHook(() => useHomescreen())
    expect(result.current.data.pages[0].items[0]).toMatchObject({ id: 'lb', name: 'Legacy' })
  })

  it('a completely fresh start gets one empty page', () => {
    const { result } = renderHook(() => useHomescreen())
    expect(result.current.data.pages).toHaveLength(1)
    expect(result.current.data.pages[0].items).toEqual([])
  })
})

describe('mobile lifecycle', () => {
  it('re-syncs when the app returns to the foreground (visibilitychange)', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { unmount } = mount({ pages: [page('p1', 'a')], items: [] })
    expect(addSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})

describe('edit mode', () => {
  it('toggleEditMode flips the flag', () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [] })
    expect(result.current.editMode).toBe(false)
    act(() => result.current.toggleEditMode())
    expect(result.current.editMode).toBe(true)
    act(() => result.current.toggleEditMode())
    expect(result.current.editMode).toBe(false)
  })
})

describe('the hidden home screen order', () => {
  const three = () => ({
    pages: [page('p1', 'a')],
    items: [bm('a', 'p1', 'a'), bm('b', 'p1', 'b'), bm('c', 'p1', 'c')],
  })
  const hiddenIds = (hs) => hs.hidden.map((h) => h.id)

  it('newly hidden bookmarks land at the end, in the order they were hidden', () => {
    const { result } = mount(three())
    act(() => result.current.setHidden('c', true))
    act(() => result.current.setHidden('a', true))
    expect(hiddenIds(result.current)).toEqual(['c', 'a'])
  })

  it('reorderHidden drops a bookmark where it was dragged, and the order is saved', () => {
    const { result } = mount(three())
    act(() => result.current.setHidden('a', true))
    act(() => result.current.setHidden('b', true))
    act(() => result.current.setHidden('c', true))

    act(() => result.current.reorderHidden(2, 0))
    expect(hiddenIds(result.current)).toEqual(['c', 'a', 'b'])
    act(() => result.current.reorderHidden(0, 1))
    expect(hiddenIds(result.current)).toEqual(['a', 'c', 'b'])

    const stored = JSON.parse(localStorage.getItem('browserhome_rows'))
    const keyOf = (id) => stored.items.find((i) => i.id === id).position
    expect(keyOf('a') < keyOf('c') && keyOf('c') < keyOf('b')).toBe(true)
  })

  it('rows hidden on different pages with colliding keys sort by name until the first drag re-keys them', () => {
    const { result } = mount({
      pages: [page('p1', 'a'), page('p2', 'b')],
      items: [
        bm('zeta', 'p1', 'a', { hidden: true }),
        bm('alpha', 'p2', 'a', { hidden: true }),
        bm('mid', 'p1', 'a', { hidden: true }),
        bm('shown', 'p1', 'd'),
      ],
    })
    expect(hiddenIds(result.current)).toEqual(['alpha', 'mid', 'zeta'])

    act(() => result.current.reorderHidden(2, 0))
    expect(hiddenIds(result.current)).toEqual(['zeta', 'alpha', 'mid'])

    // Every row now has its own key, so a later hide appends rather than sorting in
    act(() => result.current.setHidden('shown', true))
    expect(hiddenIds(result.current)).toEqual(['zeta', 'alpha', 'mid', 'shown'])
  })

  it('unhiding re-slots the bookmark, so hiding it again appends at the end', () => {
    const { result } = mount(three())
    act(() => result.current.setHidden('a', true))
    act(() => result.current.setHidden('b', true))
    act(() => result.current.setHidden('a', false))
    expect(gridIds(result.current)).toEqual(['c', 'a'])

    act(() => result.current.setHidden('a', true))
    expect(hiddenIds(result.current)).toEqual(['b', 'a'])
  })
})

describe('folders on the hidden home screen', () => {
  const hiddenIds = (hs) => hs.hidden.map((h) => h.id)
  const hiddenFolderChildIds = (hs, folderId) =>
    hs.hidden.find((i) => i.id === folderId)?.items.map((c) => c.id)
  // One visible bookmark; a hidden folder "Vault" holding two; one loose hidden bookmark
  const vault = () => ({
    pages: [page('p1', 'a')],
    items: [
      bm('v1', 'p1', 'a'),
      { ...folder('hf', 'p1', 'b'), content: { name: 'Vault', hidden: true } },
      bm('h1', 'p1', 'a', { hidden: true }, { folder_id: 'hf' }),
      bm('h2', 'p1', 'b', { hidden: true }, { folder_id: 'hf' }),
      bm('h3', 'p1', 'c', { hidden: true }),
    ],
  })

  it('lists hidden folders with their contents, and keeps them off the home screen', () => {
    const { result } = mount(vault())
    expect(gridIds(result.current)).toEqual(['v1'])
    expect(hiddenIds(result.current)).toEqual(['hf', 'h3'])
    expect(hiddenFolderChildIds(result.current, 'hf')).toEqual(['h1', 'h2'])
  })

  it('addHiddenFolder creates an empty folder at the end of the hidden screen only', () => {
    const { result } = mount({ pages: [page('p1', 'a')], items: [bm('a', 'p1', 'a'), bm('b', 'p1', 'b')] })
    act(() => result.current.setHidden('a', true))
    act(() => result.current.addHiddenFolder('Receipts'))
    expect(result.current.hidden[1]).toMatchObject({ type: 'folder', name: 'Receipts', items: [] })
    expect(gridIds(result.current)).toEqual(['b'])
  })

  it('hiding a folder takes its contents along; unhiding brings them back together', () => {
    const { result } = mount({
      pages: [page('p1', 'a')],
      items: [folder('f1', 'p1', 'a', 'Work'), bm('c1', 'p1', 'a', {}, { folder_id: 'f1' }), bm('b1', 'p1', 'b')],
    })
    act(() => result.current.setHidden('f1', true))
    expect(gridIds(result.current)).toEqual(['b1'])
    expect(hiddenIds(result.current)).toEqual(['f1'])
    expect(hiddenFolderChildIds(result.current, 'f1')).toEqual(['c1'])

    act(() => result.current.setHidden('f1', false))
    expect(gridIds(result.current)).toEqual(['b1', 'f1'])
    expect(folderChildIds(result.current, 'f1')).toEqual(['c1'])
    expect(result.current.hidden).toHaveLength(0)
  })

  it('addToFolder files a hidden bookmark into a hidden folder, never across spaces', () => {
    const { result } = mount(vault())
    act(() => result.current.addToFolder('h3', 'hf', null))
    expect(hiddenIds(result.current)).toEqual(['hf'])
    expect(hiddenFolderChildIds(result.current, 'hf')).toEqual(['h1', 'h2', 'h3'])

    act(() => result.current.addToFolder('v1', 'hf', null)) // visible into hidden: refused
    expect(gridIds(result.current)).toEqual(['v1'])
    expect(hiddenFolderChildIds(result.current, 'hf')).toEqual(['h1', 'h2', 'h3'])
  })

  it('reorderFolderItems and ejectFromFolder work inside a hidden folder', () => {
    const { result } = mount(vault())
    act(() => result.current.reorderFolderItems('hf', null, 0, 1))
    expect(hiddenFolderChildIds(result.current, 'hf')).toEqual(['h2', 'h1'])

    // Ejecting lands at the end of the hidden screen, not on a visible page
    act(() => result.current.ejectFromFolder('h2', 'hf', null))
    expect(hiddenFolderChildIds(result.current, 'hf')).toEqual(['h1'])
    expect(hiddenIds(result.current)).toEqual(['hf', 'h3', 'h2'])
    expect(gridIds(result.current)).toEqual(['v1'])
    expect(result.current.data.pages).toHaveLength(1)
  })

  it('unhiding a bookmark out of a hidden folder puts it on the home screen', () => {
    const { result } = mount(vault())
    act(() => result.current.setHidden('h1', false))
    expect(gridIds(result.current)).toEqual(['v1', 'h1'])
    expect(hiddenFolderChildIds(result.current, 'hf')).toEqual(['h2'])
  })

  it('deleting a hidden folder bins it with its contents; restore returns it to the hidden screen', () => {
    const { result } = mount(vault())
    act(() => result.current.deleteItem('hf'))
    expect(hiddenIds(result.current)).toEqual(['h3'])
    expect(result.current.trash.folders).toMatchObject([{ name: 'Vault', itemCount: 2 }])

    act(() => result.current.restoreFolder('hf'))
    expect(gridIds(result.current)).toEqual(['v1'])
    expect(hiddenIds(result.current)).toEqual(['h3', 'hf'])
    expect(hiddenFolderChildIds(result.current, 'hf')).toEqual(['h1', 'h2'])
  })

  it('deleting the page a hidden folder parks on keeps the folder and its contents', () => {
    const { result } = mount({
      pages: [page('p1', 'a'), page('p2', 'b')],
      items: [
        bm('v1', 'p1', 'a'),
        { ...folder('hf', 'p2', 'a'), content: { name: 'Vault', hidden: true } },
        bm('h1', 'p2', 'a', { hidden: true }, { folder_id: 'hf' }),
        bm('v2', 'p2', 'b'),
      ],
    })
    act(() => result.current.deletePage('p2'))
    expect(result.current.data.pages).toHaveLength(1)
    expect(hiddenIds(result.current)).toEqual(['hf'])
    expect(hiddenFolderChildIds(result.current, 'hf')).toEqual(['h1'])
    expect(result.current.trash.pages[0].itemCount).toBe(1) // v2 only
  })

  it('a hidden folder survives an export/import round trip', async () => {
    const { result } = mount(vault())
    const captured = {}
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { captured.blob = blob; return 'blob:test' })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    act(() => result.current.exportData())
    const text = await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = (e) => resolve(e.target.result)
      r.readAsText(captured.blob)
    })

    const file = new File([text], 'backup.json', { type: 'application/json' })
    await act(async () => { await result.current.importData(file) })
    expect(gridIds(result.current)).toEqual(['v1'])
    expect(hiddenIds(result.current)).toEqual(['hf', 'h3'])
    expect(hiddenFolderChildIds(result.current, 'hf')).toEqual(['h1', 'h2'])
  })
})
