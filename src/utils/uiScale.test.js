import { describe, it, expect } from 'vitest'
import { uiScaleStyle, uiZoomFactor } from './uiScale.js'

// vh/vw units inside a zoomed subtree render zoom× the real viewport, so the
// app root must publish --ui-zoom for modal CSS to divide by (issue #28).

describe('uiScaleStyle', () => {
  it('applies the zoom and publishes the matching --ui-zoom variable', () => {
    expect(uiScaleStyle(150)).toEqual({ zoom: 1.5, '--ui-zoom': 1.5 })
    expect(uiScaleStyle(100)).toEqual({ zoom: 1, '--ui-zoom': 1 })
  })

  it('clamps like the settings slider does', () => {
    expect(uiScaleStyle(500).zoom).toBe(2)
    expect(uiScaleStyle(10).zoom).toBe(0.75)
    expect(uiScaleStyle('junk').zoom).toBe(1)
  })
})

describe('uiZoomFactor', () => {
  it('is the same factor, for pointer-coordinate math', () => {
    expect(uiZoomFactor(175)).toBe(1.75)
    expect(uiZoomFactor(undefined)).toBe(1)
  })
})
