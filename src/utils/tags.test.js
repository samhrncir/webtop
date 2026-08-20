import { describe, it, expect } from 'vitest'
import {
  normalizeTag, getTags, hasTag, normalizeTagList,
  flattenBookmarks, allTags, itemMatchesQuery, compareByName,
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

describe('compareByName', () => {
  it('sorts case-insensitively and tolerates missing names', () => {
    const sorted = [{ name: 'beta' }, { name: 'Alpha' }, {}].sort(compareByName)
    expect(sorted.map((x) => x.name)).toEqual([undefined, 'Alpha', 'beta'])
  })
})
