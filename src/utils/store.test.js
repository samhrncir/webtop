import { describe, it, expect } from 'vitest'
import {
  hostOf, installedHosts, isInstalled, installPayload,
  filterApps, groupByCategory, featuredApps, categoriesOf,
  slugify, normalizeListing, validateListing,
  readStoreCache, writeStoreCache,
  fetchStoreApps, fetchIsStoreAdmin, upsertStoreApp, deleteStoreApp,
} from './store.js'

const app = (slug, over = {}) => ({
  id: `id-${slug}`, slug, name: slug, url: `https://www.${slug}.com/`,
  tagline: '', description: '', category: 'Other', tags: [],
  icon_url: null, featured: false, rank: 0, published: true, install: {},
  ...over,
})

describe('what counts as installed', () => {
  it('matches on host, ignoring www, path and case', () => {
    const data = { pages: [{ id: 'p', items: [
      { id: 'a', type: 'bookmark', name: 'YT', url: 'https://youtube.com/feed' },
      { id: 'f', type: 'folder', name: 'F', items: [
        { id: 'b', type: 'bookmark', name: 'GH', url: 'https://GitHub.com' },
      ] },
    ] }] }
    const hosts = installedHosts(data)
    expect(isInstalled(app('youtube', { url: 'https://www.youtube.com/' }), hosts)).toBe(true)
    expect(isInstalled(app('github', { url: 'https://github.com/' }), hosts)).toBe(true)
    expect(isInstalled(app('reddit'), hosts)).toBe(false)
  })

  it('counts hidden bookmarks too', () => {
    const hosts = installedHosts({ pages: [] }, [
      { id: 'h', type: 'bookmark', name: 'X', url: 'https://x.com' },
    ])
    expect(hosts.has('x.com')).toBe(true)
  })

  it('shrugs at bookmarks with unparsable URLs', () => {
    expect(hostOf('not a url')).toBeNull()
    expect(isInstalled({ url: 'nope' }, new Set(['nope']))).toBe(false)
  })
})

describe('installPayload (the bookmark an install creates)', () => {
  it('carries name, url, normalized tags and the icon', () => {
    expect(installPayload(app('yt', { name: 'YouTube', tags: ['Video', ' video ', 'Fun'], icon_url: 'https://i.test/yt.png' })))
      .toEqual({ name: 'YouTube', url: 'https://www.yt.com/', tags: ['video', 'fun'], icon: 'https://i.test/yt.png' })
  })

  it('merges install extras over the listing fields', () => {
    const payload = installPayload(app('gh', { install: { aliases: ['hub'], url: 'https://github.com/notifications' } }))
    expect(payload.aliases).toEqual(['hub'])
    expect(payload.url).toBe('https://github.com/notifications')
    expect(installPayload(app('x', { install: 'junk' })).aliases).toBeUndefined()
  })
})

describe('browsing the catalog', () => {
  const apps = [
    app('reddit', { category: 'Social', rank: 2, tagline: 'Communities' }),
    app('x', { category: 'Social', rank: 1, tags: ['news'] }),
    app('github', { category: 'Developer', featured: true }),
    app('draft', { category: 'Developer', published: false }),
    app('zoo', { category: 'Animals' }),
    app('bank', { category: 'Finance & Travel', featured: true, rank: 5 }),
  ]

  it('hides unpublished listings and searches name, tagline, tags and host', () => {
    expect(filterApps(apps).map((a) => a.slug)).not.toContain('draft')
    expect(filterApps(apps, { query: 'commun' }).map((a) => a.slug)).toEqual(['reddit'])
    expect(filterApps(apps, { query: 'NEWS' }).map((a) => a.slug)).toEqual(['x'])
    expect(filterApps(apps, { query: 'github.com' }).map((a) => a.slug)).toEqual(['github'])
    expect(filterApps(apps, { category: 'Social' })).toHaveLength(2)
    expect(filterApps(apps, { category: 'Social', query: 'zzz' })).toHaveLength(0)
  })

  it('groups into rows in display order, ranked within each', () => {
    const rows = groupByCategory(filterApps(apps))
    expect(rows.map((r) => r.category)).toEqual(['Social', 'Developer', 'Finance & Travel', 'Animals'])
    expect(rows[0].apps.map((a) => a.slug)).toEqual(['x', 'reddit'])
    expect(categoriesOf(filterApps(apps))).toEqual(['Social', 'Developer', 'Finance & Travel', 'Animals'])
  })

  it('lists featured listings by rank', () => {
    expect(featuredApps(apps).map((a) => a.slug)).toEqual(['github', 'bank'])
  })
})

describe('admin drafts', () => {
  it('derives the slug from the name and tidies every field', () => {
    const row = normalizeListing({
      name: '  Hacker News ', url: ' https://news.ycombinator.com/ ', tags: 'News, Tech ,, news',
      rank: '7', featured: 1, icon_url: '', install: '{"aliases":["hn"]}',
    })
    expect(row).toMatchObject({
      slug: 'hacker-news', name: 'Hacker News', url: 'https://news.ycombinator.com/',
      tags: ['news', 'tech'], rank: 7, featured: true, published: true,
      icon_url: null, category: 'Other', install: { aliases: ['hn'] },
    })
    expect(validateListing(row)).toEqual({})
  })

  it('keeps an explicit slug and id, and a false published flag', () => {
    const row = normalizeListing({ id: 'abc', slug: 'Custom Slug!', name: 'N', url: 'https://n.test', published: false, rank: 'x' })
    expect(row).toMatchObject({ id: 'abc', slug: 'custom-slug', published: false, rank: 0 })
  })

  it('names every field that would make the listing unusable', () => {
    const errors = validateListing(normalizeListing({ name: '', url: 'ftp://x', icon_url: 'nope', install: '{bad' }))
    expect(Object.keys(errors).sort()).toEqual(['icon_url', 'install', 'name', 'slug', 'url'])
    expect(validateListing(normalizeListing({ name: 'A', url: 'https://a.test', install: '[1]' })).install).toBeTruthy()
  })

  it('slugify handles accents and symbols', () => {
    expect(slugify('Disney+ Après Ski')).toBe('disney-apres-ski')
    expect(slugify('')).toBe('')
  })
})

describe('offline cache', () => {
  it('round-trips the catalog and tolerates garbage', () => {
    expect(readStoreCache()).toBeNull()
    writeStoreCache([app('a')])
    expect(readStoreCache()).toHaveLength(1)
    localStorage.setItem('browserhome_store', '{not json')
    expect(readStoreCache()).toBeNull()
    localStorage.setItem('browserhome_store', '{"pages":[]}')
    expect(readStoreCache()).toBeNull()
  })
})

describe('without a backend (the inert stub)', () => {
  it('every data call reports an error instead of throwing', async () => {
    expect(await fetchStoreApps()).toMatchObject({ apps: null, error: { code: 'OFFLINE' } })
    expect(await fetchIsStoreAdmin()).toBe(false)
    expect((await upsertStoreApp({ slug: 'x' })).error).toBeTruthy()
    expect((await deleteStoreApp('id')).error).toBeTruthy()
  })
})
