import { describe, it, expect } from 'vitest'
import {
  normalizeTag, getTags, hasTag, normalizeTagList,
  flattenBookmarks, allTags, itemMatchesQuery, compareByName,
  itemMatchesFilter, isFavorite, FAVORITES_FILTER, pickHomeTags,
} from './tags.js'

describe('normalizeTag', () => {
  it('trims, collapses whitespace and lowercases', () => {
    expect(normalizeTag('  Deep   Work  ')).toBe('deep work')
  })
  it('caps length at 24 characters', () => {
    expect(normalizeTag('x'.repeat(40))).toHaveLength(24)
  })
  it('returns empty string for non-strings', () => {
    expect(normalizeTag(null)).toBe('')
    expect(normalizeTag(42)).toBe('')
  })
})

describe('normalizeTagList', () => {
  it('dedupes case-insensitively, preserving first-seen order', () => {
    expect(normalizeTagList(['Work', 'work', 'Dev', ' WORK '])).toEqual(['work', 'dev'])
  })
  it('drops empties and tolerates a missing list', () => {
    expect(normalizeTagList(['', '  ', 'a'])).toEqual(['a'])
    expect(normalizeTagList(undefined)).toEqual([])
  })
})

describe('getTags / hasTag', () => {
  it('never assumes the tags key exists (items predate tags)', () => {
    expect(getTags({})).toEqual([])
    expect(getTags(null)).toEqual([])
    expect(hasTag({}, 'x')).toBe(false)
  })
})

const data = {
  pages: [
    {
      id: 'p1',
      items: [
        { id: 'b1', type: 'bookmark', name: 'Alpha', url: 'https://a.test', tags: ['work'] },
        {
          id: 'f1', type: 'folder', name: 'Tools',
          items: [{ id: 'c1', type: 'bookmark', name: 'Child', url: 'https://c.test', tags: ['work', 'dev'] }],
        },
      ],
    },
    { id: 'p2', items: [{ id: 'b2', type: 'bookmark', name: 'Beta', url: 'https://b.test' }] },
  ],
}

describe('flattenBookmarks', () => {
  it('walks every page, top level and folder contents, tagging the source', () => {
    expect(flattenBookmarks(data)).toEqual([
      { item: expect.objectContaining({ id: 'b1' }), pageIdx: 0, inFolder: null },
      { item: expect.objectContaining({ id: 'c1' }), pageIdx: 0, inFolder: 'Tools' },
      { item: expect.objectContaining({ id: 'b2' }), pageIdx: 1, inFolder: null },
    ])
  })
  it('with includeFolders, emits the folder just before its children', () => {
    const ids = flattenBookmarks(data, { includeFolders: true }).map((e) => e.item.id)
    expect(ids).toEqual(['b1', 'f1', 'c1', 'b2'])
  })
})

describe('allTags', () => {
  it('counts every use across pages and folders, sorted by name', () => {
    expect(allTags(data)).toEqual([
      { tag: 'dev', count: 1 },
      { tag: 'work', count: 2 },
    ])
  })
})

describe('itemMatchesQuery', () => {
  const bm = data.pages[0].items[0]
  const folder = data.pages[0].items[1]
  it('matches bookmarks on name, url and tag', () => {
    expect(itemMatchesQuery(bm, 'alph')).toBe(true)
    expect(itemMatchesQuery(bm, 'a.test')).toBe(true)
    expect(itemMatchesQuery(bm, 'work')).toBe(true)
    expect(itemMatchesQuery(bm, 'zzz')).toBe(false)
  })
  it('matches folders on name only', () => {
    expect(itemMatchesQuery(folder, 'tool')).toBe(true)
    expect(itemMatchesQuery(folder, 'c.test')).toBe(false)
  })
  it('an empty query matches nothing', () => {
    expect(itemMatchesQuery(bm, '')).toBe(false)
  })
})

describe('favorites filter', () => {
  it('the sentinel matches favorited bookmarks only', () => {
    expect(itemMatchesFilter({ favorite: true }, FAVORITES_FILTER)).toBe(true)
    expect(itemMatchesFilter({ tags: ['work'] }, FAVORITES_FILTER)).toBe(false)
  })
  it('tag filters and no-filter behave as before', () => {
    expect(itemMatchesFilter({ tags: ['work'] }, 'work')).toBe(true)
    expect(itemMatchesFilter({ tags: ['work'] }, 'dev')).toBe(false)
    expect(itemMatchesFilter({}, null)).toBe(true)
  })
  it('isFavorite never assumes the key exists', () => {
    expect(isFavorite({})).toBe(false)
    expect(isFavorite(null)).toBe(false)
    expect(isFavorite({ favorite: true })).toBe(true)
  })
})

describe('compareByName', () => {
  it('sorts case-insensitively and tolerates missing names', () => {
    const sorted = [{ name: 'beta' }, { name: 'Alpha' }, {}].sort(compareByName)
    expect(sorted.map((x) => x.name)).toEqual([undefined, 'Alpha', 'beta'])
  })
})

describe('pickHomeTags (which tags get a home screen chip)', () => {
  const tags = [
    { tag: 'dev', count: 8 }, { tag: 'media', count: 5 }, { tag: 'news', count: 1 },
    { tag: 'shopping', count: 1 }, { tag: 'work', count: 6 },
  ]
  const names = (list) => list.map((t) => t.tag)

  it("'top' shows the most-used tags (ties alphabetical) and overflows the rest alphabetically", () => {
    const { shown, overflow } = pickHomeTags(tags, { mode: 'top', max: 3 })
    expect(names(shown)).toEqual(['dev', 'work', 'media'])
    expect(names(overflow)).toEqual(['news', 'shopping'])
  })

  it('shows everything, with nothing to overflow, when the limit covers every tag', () => {
    const { shown, overflow } = pickHomeTags(tags, { mode: 'top', max: 10 })
    expect(shown).toHaveLength(5)
    expect(overflow).toEqual([])
  })

  it("'chosen' shows exactly the picked tags and ignores names that no longer exist", () => {
    const { shown, overflow } = pickHomeTags(tags, { mode: 'chosen', chosen: ['work', 'news', 'gone'] })
    expect(names(shown)).toEqual(['news', 'work'])
    expect(names(overflow)).toEqual(['dev', 'media', 'shopping'])
  })

  it('the active tag always gets a chip, even when it would otherwise overflow', () => {
    const { shown, overflow } = pickHomeTags(tags, { mode: 'top', max: 2, activeTag: 'shopping' })
    expect(names(shown)).toEqual(['dev', 'work', 'shopping'])
    expect(names(overflow)).toEqual(['media', 'news'])
  })

  it('the favorites filter and unknown active tags add no chip', () => {
    expect(pickHomeTags(tags, { max: 1, activeTag: FAVORITES_FILTER }).shown).toHaveLength(1)
    expect(pickHomeTags(tags, { max: 1, activeTag: 'nope' }).shown).toHaveLength(1)
  })

  it('tolerates junk input', () => {
    expect(pickHomeTags(undefined)).toEqual({ shown: [], overflow: [] })
    expect(pickHomeTags(tags, { mode: 'chosen', chosen: null }).shown).toEqual([])
    expect(pickHomeTags(tags, { max: 'x' }).shown).toHaveLength(5)
  })
})