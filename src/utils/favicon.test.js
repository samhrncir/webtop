import { describe, it, expect } from 'vitest'
import {
  getFaviconUrl, isSafeIconUrl, normalizeEmoji, getItemEmoji,
  getIconCandidates, getInitialLetter, getColorForName,
} from './favicon.js'

describe('getFaviconUrl', () => {
  it('builds the Google s2 favicon URL from the hostname', () => {
    expect(getFaviconUrl('https://github.com/some/path')).toBe(
      'https://www.google.com/s2/favicons?domain=github.com&sz=64'
    )
  })
  it('returns null for unparsable URLs', () => {
    expect(getFaviconUrl('not a url')).toBeNull()
  })
})

describe('isSafeIconUrl', () => {
  it('accepts http(s) and data:image URLs only', () => {
    expect(isSafeIconUrl('https://x.test/icon.png')).toBe(true)
    expect(isSafeIconUrl('http://x.test/icon.png')).toBe(true)
    expect(isSafeIconUrl('data:image/png;base64,AAAA')).toBe(true)
  })
  it('rejects other schemes and junk', () => {
    // eslint-disable-next-line no-script-url
    expect(isSafeIconUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeIconUrl('ftp://x.test/icon.png')).toBe(false)
    expect(isSafeIconUrl('data:text/html,hi')).toBe(false)
    expect(isSafeIconUrl(42)).toBe(false)
  })
})

describe('normalizeEmoji (a single emoji grapheme, or nothing)', () => {
  it.each([
    ['🏠', '🏠'],
    ['  🔥 ', '🔥'],
    ['👨‍👩‍👧', '👨‍👩‍👧'], // ZWJ sequence is one grapheme
    ['🇺🇸', '🇺🇸'], // flag
    ['1️⃣', '1️⃣'], // keycap
    ['✈️', '✈️'], // pictograph with variation selector
  ])('accepts %s', (input, expected) => {
    expect(normalizeEmoji(input)).toBe(expected)
  })

  it.each([
    ['a'], ['ab'], ['🔥🔥'], [''], ['★'], [null], [42],
  ])('rejects %s', (input) => {
    expect(normalizeEmoji(input)).toBe('')
  })
})

describe('getItemEmoji', () => {
  it('returns the normalized emoji or null', () => {
    expect(getItemEmoji({ emoji: '🚀' })).toBe('🚀')
    expect(getItemEmoji({ emoji: 'nope' })).toBeNull()
    expect(getItemEmoji({})).toBeNull()
  })
})

describe('getIconCandidates', () => {
  // The theSVG brand step only joins the chain once its index has loaded;
  // in tests (network disabled) the chain is custom -> favicon.
  it('puts a safe custom icon URL ahead of the favicon', () => {
    const item = { icon: 'https://cdn.test/icon.svg', url: 'https://github.com' }
    expect(getIconCandidates(item)).toEqual([
      'https://cdn.test/icon.svg',
      'https://www.google.com/s2/favicons?domain=github.com&sz=64',
    ])
  })
  it('skips unsafe custom URLs', () => {
    const item = { icon: 'javascript:x', url: 'https://github.com' }
    expect(getIconCandidates(item)).toEqual([
      'https://www.google.com/s2/favicons?domain=github.com&sz=64',
    ])
  })
  it('is empty when there is nothing to try', () => {
    expect(getIconCandidates({})).toEqual([])
  })
})

describe('letter avatars', () => {
  it('uses the first letter, uppercased, with ? for empty names', () => {
    expect(getInitialLetter('github')).toBe('G')
    expect(getInitialLetter('  ')).toBe('?')
    expect(getInitialLetter('')).toBe('?')
  })
  it('assigns a stable color per name', () => {
    expect(getColorForName('GitHub')).toBe(getColorForName('GitHub'))
    expect(getColorForName('GitHub')).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
