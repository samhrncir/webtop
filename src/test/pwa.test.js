import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// The PWA manifest is static config, but a typo'd path or malformed JSON
// silently breaks installability with no build error — so pin it here.

const root = resolve(__dirname, '../..')
const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf-8'))

describe('PWA manifest', () => {
  it('carries the fields Chrome requires for installability', () => {
    expect(manifest).toMatchObject({
      name: 'BrowserHome',
      start_url: '/',
      display: 'standalone',
    })
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2)
    const sizes = manifest.icons.map((i) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
  })

  it('every icon it references exists in public/', () => {
    for (const icon of manifest.icons) {
      expect(existsSync(resolve(root, 'public', icon.src.replace(/^\//, ''))), icon.src).toBe(true)
    }
  })

  it('index.html links the manifest and the apple touch icon', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf-8')
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"')
    expect(html).toContain('rel="apple-touch-icon" href="/icons/apple-touch-icon.png"')
    expect(existsSync(resolve(root, 'public/icons/apple-touch-icon.png'))).toBe(true)
  })

  it('theme and background match the app dark palette', () => {
    expect(manifest.theme_color).toBe('#1a1a2e')
    expect(manifest.background_color).toBe('#1a1a2e')
  })
})
