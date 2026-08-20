import { describe, it, expect } from 'vitest'
import { normalizeAliases, matchAlias } from './aliases.js'

describe('normalizeAliases', () => {
  it('trims and dedupes case-insensitively, keeping the first spelling', () => {
    expect(normalizeAliases([' GH ', 'gh', 'Code', 'code '])).toEqual(['GH', 'Code'])
  })
  it('drops non-strings and empties; tolerates non-arrays', () => {
    expect(normalizeAliases(['ok', 42, null, '   '])).toEqual(['ok'])
    expect(normalizeAliases('nope')).toEqual([])
    expect(normalizeAliases(undefined)).toEqual([])
  })
})

describe('matchAlias', () => {
  const item = { aliases: ['GH', 'my code'] }
  it('returns the first alias containing the lowercased query', () => {
    expect(matchAlias(item, 'gh')).toBe('GH')
    expect(matchAlias(item, 'code')).toBe('my code')
  })
  it('returns null for no match, empty query, or missing aliases', () => {
    expect(matchAlias(item, 'zzz')).toBeNull()
    expect(matchAlias(item, '')).toBeNull()
    expect(matchAlias({}, 'gh')).toBeNull()
  })
})
