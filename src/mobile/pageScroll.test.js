import { describe, it, expect } from 'vitest'
import { pageFromScroll, scrollLeftForPage } from './pageScroll.js'

describe('pageFromScroll', () => {
  it('maps scroll position to the nearest page', () => {
    expect(pageFromScroll(0, 390, 3)).toBe(0)
    expect(pageFromScroll(390, 390, 3)).toBe(1)
    expect(pageFromScroll(560, 390, 3)).toBe(1) // mid-swipe rounds to nearest
    expect(pageFromScroll(780, 390, 3)).toBe(2)
  })

  it('clamps to the page range and survives a zero width', () => {
    expect(pageFromScroll(5000, 390, 3)).toBe(2)
    expect(pageFromScroll(-100, 390, 3)).toBe(0)
    expect(pageFromScroll(100, 0, 3)).toBe(0)
    expect(pageFromScroll(100, 390, 0)).toBe(0)
  })
})

describe('scrollLeftForPage', () => {
  it('is the inverse mapping', () => {
    expect(scrollLeftForPage(2, 390)).toBe(780)
    expect(scrollLeftForPage(-1, 390)).toBe(0)
    expect(pageFromScroll(scrollLeftForPage(1, 390), 390, 3)).toBe(1)
  })
})
