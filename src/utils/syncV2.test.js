import { describe, it, expect } from 'vitest'
import { rowsToNested, nestedToRows, mergeRows, ensureLivePage, byPosition } from './syncV2.js'

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-02T00:00:00.000Z'
const T2 = '2026-01-03T00:00:00.000Z'

const page = (id, position, over = {}) => ({ id, position, deleted_at: null, updated_at: T0, ...over })
const item = (id, page_id, position, over = {}) => ({
  id, page_id, folder_id: null, type: 'bookmark', position,
  content: { name: id, url: `https://${id}.test` },
  deleted_at: null, updated_at: T0, ...over,
})

describe('rowsToNested', () => {
  const rows = {
    pages: [page('p2', 'b'), page('p1', 'a'), page('p3', 'c', { deleted_at: T1 })],
    items: [
      item('b2', 'p1', 'z'),
      item('b1', 'p1', 'a'),
      item('f1', 'p1', 'm', { type: 'folder', content: { name: 'Folder' } }),
      item('c2', 'p1', 'b', { folder_id: 'f1' }),
      item('c1', 'p1', 'a', { folder_id: 'f1' }),
      item('dead', 'p1', 'q', { deleted_at: T1 }),
      item('other', 'p2', 'a'),
    ],
  }
  const nested = rowsToNested(rows)

  it('orders pages and items by position and drops tombstones', () => {
    expect(nested.pages.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(nested.pages[0].items.map((i) => i.id)).toEqual(['b1', 'f1', 'b2'])
  })

  it('nests folder children in position order', () => {
    const folder = nested.pages[0].items.find((i) => i.id === 'f1')
    expect(folder.type).toBe('folder')
    expect(folder.items.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('spreads content onto the item', () => {
    expect(nested.pages[0].items[0]).toMatchObject({ id: 'b1', type: 'bookmark', name: 'b1', url: 'https://b1.test' })
  })
})

describe('nestedToRows round trip', () => {
  it('preserves structure, ids and content through rows -> nested -> rows -> nested', () => {
    const original = {
      pages: [{
        id: 'p1',
        items: [
          { id: 'b1', type: 'bookmark', name: 'One', url: 'https://one.test', tags: ['work'] },
          { id: 'f1', type: 'folder', name: 'F', items: [{ id: 'c1', type: 'bookmark', name: 'Child', url: 'https://c.test' }] },
        ],
      }],
    }
    const twice = rowsToNested(nestedToRows(original))
    expect(twice.pages).toHaveLength(1)
    expect(twice.pages[0].items.map((i) => i.id)).toEqual(['b1', 'f1'])
    expect(twice.pages[0].items[0]).toMatchObject({ name: 'One', tags: ['work'] })
    expect(twice.pages[0].items[1].items[0]).toMatchObject({ id: 'c1', name: 'Child' })
  })
})

describe('mergeRows (last-write-wins)', () => {
  const local = { pages: [page('p1', 'a', { updated_at: T1 })], items: [item('b1', 'p1', 'a', { updated_at: T1 })] }

  it('newer server rows replace local ones', () => {
    const server = { pages: [], items: [{ ...item('b1', 'p1', 'a', { updated_at: T2 }), content: { name: 'server' } }] }
    const merged = mergeRows(local, server)
    expect(merged.items[0].content.name).toBe('server')
  })

  it('older server rows are ignored', () => {
    const server = { pages: [], items: [{ ...item('b1', 'p1', 'a', { updated_at: T0 }), content: { name: 'stale' } }] }
    expect(mergeRows(local, server).items[0].content.name).toBe('b1')
  })

  it('timestamp ties keep the local row', () => {
    const server = { pages: [], items: [{ ...item('b1', 'p1', 'a', { updated_at: T1 }), content: { name: 'tied' } }] }
    expect(mergeRows(local, server).items[0].content.name).toBe('b1')
  })

  it('rows the other side has never seen are unioned in', () => {
    const server = { pages: [page('p9', 'z')], items: [item('b9', 'p9', 'a')] }
    const merged = mergeRows(local, server)
    expect(merged.pages.map((p) => p.id).sort()).toEqual(['p1', 'p9'])
    expect(merged.items.map((i) => i.id).sort()).toEqual(['b1', 'b9'])
  })

  it('a newer server tombstone deletes the local row', () => {
    const server = { pages: [], items: [item('b1', 'p1', 'a', { deleted_at: T2, updated_at: T2 })] }
    expect(mergeRows(local, server).items[0].deleted_at).toBe(T2)
  })
})

describe('ensureLivePage', () => {
  it('adds a page when every page is tombstoned', () => {
    const rows = ensureLivePage({ pages: [page('p1', 'a', { deleted_at: T1 })], items: [] })
    expect(rows.pages.some((p) => !p.deleted_at)).toBe(true)
  })

  it('leaves rows alone when a live page exists', () => {
    const rows = { pages: [page('p1', 'a')], items: [] }
    expect(ensureLivePage(rows)).toBe(rows)
  })
})

describe('byPosition', () => {
  it('breaks position ties deterministically by id', () => {
    const a = { id: 'a', position: 'm' }
    const b = { id: 'b', position: 'm' }
    expect([b, a].sort(byPosition).map((r) => r.id)).toEqual(['a', 'b'])
  })
})
