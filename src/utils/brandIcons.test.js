import { describe, it, expect, vi, beforeEach } from 'vitest'

// brandIcons keeps a module-level index, so every test imports a fresh copy.
async function freshModule() {
  vi.resetModules()
  return import('./brandIcons.js')
}

const REGISTRY = {
  total: 5,
  icons: [
    // Root URL + name match: the real GitHub icon
    { slug: 'github', title: 'GitHub', url: 'https://github.com/', hex: '181717', variants: ['default', 'dark'] },
    // A project whose registry URL is its GitHub repo — must NOT claim github.com
    { slug: 'thirty-seconds', title: '30 seconds of code', url: 'https://github.com/Chalarangelo/30-seconds-of-code', hex: 'aabbcc', variants: ['default'] },
    { slug: 'reddit', title: 'Reddit', url: 'https://www.reddit.com/', hex: 'ff4500', variants: ['default'] },
    // Near-black mark with no dark variant: invisible on the dark theme
    { slug: 'inkbrand', title: 'InkBrand', url: 'https://inkbrand.test/', hex: '050505', variants: ['default'] },
    // Near-white mark with a light variant
    { slug: 'snowbrand', title: 'SnowBrand', url: 'https://snowbrand.test/', hex: 'fefefe', variants: ['default', 'light'] },
  ],
}

function stubRegistryFetch(payload = REGISTRY) {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('brand icon lookup (theSVG)', () => {
  let brand
  beforeEach(async () => {
    stubRegistryFetch()
    brand = await freshModule()
    await brand.loadBrandIndex()
  })

  it('resolves a known host to its CDN mark, theme variant first', () => {
    expect(brand.getBrandIconUrl('https://github.com/pulls', 'dark')).toBe('https://thesvg.org/icons/github/dark.svg')
    expect(brand.getBrandIconUrl('https://github.com/pulls', 'light')).toBe('https://thesvg.org/icons/github/default.svg')
  })

  it('gives a contested host to the best-scoring claimant, not the first one', () => {
    // Regression: naive first-wins mapped github.com to a project that lists
    // a github.com repo as its URL
    expect(brand.getBrandIconUrl('https://github.com', 'light')).toContain('/github/')
  })

  it('walks subdomains up to a known parent, but never a bare TLD', () => {
    expect(brand.getBrandIconUrl('https://docs.github.com/en', 'light')).toContain('/github/')
    expect(brand.getBrandIconUrl('https://unknown-thing.com', 'dark')).toBeNull()
  })

  it('ignores the www prefix in registry URLs', () => {
    expect(brand.getBrandIconUrl('https://reddit.com/r/all', 'dark')).toBe('https://thesvg.org/icons/reddit/default.svg')
  })

  it('withholds marks that would be invisible on the current theme', () => {
    // near-black, no dark variant: nothing on dark, default on light
    expect(brand.getBrandIconUrl('https://inkbrand.test', 'dark')).toBeNull()
    expect(brand.getBrandIconUrl('https://inkbrand.test', 'light')).toBe('https://thesvg.org/icons/inkbrand/default.svg')
    // near-white with a light variant: light variant on the light theme
    expect(brand.getBrandIconUrl('https://snowbrand.test', 'light')).toBe('https://thesvg.org/icons/snowbrand/light.svg')
  })

  it('returns null before the index has loaded and for junk URLs', async () => {
    const cold = await freshModule() // fresh module, index not loaded
    localStorage.clear()
    expect(cold.getBrandIconUrl('https://github.com', 'dark')).toBeNull()
    expect(brand.getBrandIconUrl('not a url', 'dark')).toBeNull()
  })
})

describe('registry caching', () => {
  it('serves the second session from localStorage without refetching', async () => {
    const fetch1 = stubRegistryFetch()
    const first = await freshModule()
    await first.loadBrandIndex()
    expect(fetch1).toHaveBeenCalledTimes(1)

    const fetch2 = stubRegistryFetch()
    const second = await freshModule() // new session, same localStorage
    await second.loadBrandIndex()
    expect(fetch2).not.toHaveBeenCalled()
    expect(second.getBrandIconUrl('https://github.com', 'dark')).toContain('/github/')
  })

  it('falls back to a stale cache when the network fails', async () => {
    stubRegistryFetch()
    const first = await freshModule()
    await first.loadBrandIndex()

    // Expire the cache and kill the network
    const cached = JSON.parse(localStorage.getItem('browserhome_brand_icons_v2'))
    cached.ts = 0
    localStorage.setItem('browserhome_brand_icons_v2', JSON.stringify(cached))
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))

    const second = await freshModule()
    await second.loadBrandIndex()
    expect(second.getBrandIconUrl('https://github.com', 'dark')).toContain('/github/')
  })

  it('concurrent loads share one request', async () => {
    const fetchMock = stubRegistryFetch()
    const mod = await freshModule()
    await Promise.all([mod.loadBrandIndex(), mod.loadBrandIndex(), mod.loadBrandIndex()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('manual refresh', () => {
  it('refetches the registry, bumps the version, and cache-busts icon URLs', async () => {
    const fetchMock = stubRegistryFetch()
    const mod = await freshModule()
    await mod.loadBrandIndex()
    const v0 = mod.getBrandIconsVersion()

    expect(mod.bustIconUrl('https://x.test/a.svg')).toBe('https://x.test/a.svg')
    await mod.refreshBrandIcons()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(mod.getBrandIconsVersion()).toBeGreaterThan(v0)
    expect(mod.bustIconUrl('https://x.test/a.svg')).toBe('https://x.test/a.svg?r=1')
    expect(mod.bustIconUrl('https://x.test/a?b=1')).toBe('https://x.test/a?b=1&r=1')
    expect(mod.bustIconUrl('data:image/png;base64,AA')).toBe('data:image/png;base64,AA')
  })

  it('notifies subscribers when the index changes', async () => {
    stubRegistryFetch()
    const mod = await freshModule()
    const spy = vi.fn()
    mod.subscribeBrandIcons(spy)
    await mod.loadBrandIndex()
    expect(spy).toHaveBeenCalled()
  })
})
