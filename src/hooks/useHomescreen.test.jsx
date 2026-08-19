import { describe, it, expect } from 'vitest'
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
