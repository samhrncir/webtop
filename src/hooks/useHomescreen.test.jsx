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
