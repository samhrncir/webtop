import { describe, it, expect } from 'vitest'
import { forwardGutterWheel } from './gutterScroll.js'

const grid = (containsTarget = false) => ({
  scrollTop: 100,
  contains: () => containsTarget,
})

describe('forwardGutterWheel', () => {
  it('scrolls the grid when the wheel turns over the gutter', () => {
    const g = grid(false)
    forwardGutterWheel(g, { deltaY: 120, deltaMode: 0, target: {} })
    expect(g.scrollTop).toBe(220)
    forwardGutterWheel(g, { deltaY: -120, deltaMode: 0, target: {} })
    expect(g.scrollTop).toBe(100)
  })

  it('scales line-mode deltas to pixels', () => {
    const g = grid(false)
    forwardGutterWheel(g, { deltaY: 3, deltaMode: 1, target: {} })
    expect(g.scrollTop).toBe(220)
  })

  it('leaves wheel events over the grid to native scrolling', () => {
    const g = grid(true)
    forwardGutterWheel(g, { deltaY: 120, deltaMode: 0, target: {} })
    expect(g.scrollTop).toBe(100)
  })

  it('tolerates a missing grid', () => {
    expect(() => forwardGutterWheel(null, { deltaY: 120, deltaMode: 0, target: {} })).not.toThrow()
  })
})

describe('gutterWheelHandler', () => {
  it('reads the grid from the ref per event', async () => {
    const { gutterWheelHandler } = await import('./gutterScroll.js')
    const g = grid(false)
    const handler = gutterWheelHandler({ current: g })
    handler({ deltaY: 120, deltaMode: 0, target: {} })
    expect(g.scrollTop).toBe(220)
  })
})
