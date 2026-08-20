import { describe, it, expect } from 'vitest'
import { positionBetween, seqPositions } from './fractional.js'

// Fractional keys are the backbone of every ordering in the app (grid slots,
// folder contents, taskbar pins). The invariant everything relies on: a key
// inserted between two neighbours sorts strictly between them, forever.

describe('positionBetween', () => {
  it('returns a key strictly between both bounds', () => {
    expect(positionBetween('a', 'b') > 'a').toBe(true)
    expect(positionBetween('a', 'b') < 'b').toBe(true)
  })

  it('treats empty bounds as unbounded', () => {
    const first = positionBetween('', '')
    expect(first.length).toBeGreaterThan(0)
    expect(positionBetween(first, '') > first).toBe(true)
    expect(positionBetween('', first) < first).toBe(true)
  })

  it('throws when the bounds are not in order', () => {
    expect(() => positionBetween('b', 'a')).toThrow()
    expect(() => positionBetween('a', 'a')).toThrow()
  })

  it('never emits a key ending in the smallest digit (would leave no room below)', () => {
    let low = ''
    let high = positionBetween('', '')
    for (let i = 0; i < 200; i++) {
      const mid = positionBetween(low, high)
      expect(mid.endsWith('0')).toBe(false)
      // squeeze both ways alternately to stress prefix recursion
      if (i % 2 === 0) high = mid
      else low = mid
    }
  })

  it('survives 500 random adjacent insertions without breaking sort order', () => {
    const keys = [positionBetween('', '')]
    let seed = 42
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    for (let i = 0; i < 500; i++) {
      const slot = Math.floor(rand() * (keys.length + 1))
      const a = slot === 0 ? '' : keys[slot - 1]
      const b = slot === keys.length ? '' : keys[slot]
      keys.splice(slot, 0, positionBetween(a, b))
    }
    const sorted = [...keys].sort()
    expect(keys).toEqual(sorted)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('seqPositions', () => {
  it('returns n strictly increasing keys', () => {
    const keys = seqPositions(50)
    expect(keys).toHaveLength(50)
    for (let i = 1; i < keys.length; i++) expect(keys[i] > keys[i - 1]).toBe(true)
  })

  it('leaves room to insert between any two neighbours', () => {
    const keys = seqPositions(10)
    for (let i = 1; i < keys.length; i++) {
      const mid = positionBetween(keys[i - 1], keys[i])
      expect(mid > keys[i - 1] && mid < keys[i]).toBe(true)
    }
  })
})
