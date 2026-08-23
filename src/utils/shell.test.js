import { describe, it, expect, vi } from 'vitest'
import { resolveShell, pickShell } from './shell.js'

describe('resolveShell', () => {
  it('the Android app always gets the mobile shell', () => {
    expect(resolveShell({ query: '', isNative: true, coarsePointer: false })).toBe('mobile')
  })

  it('coarse-pointer browsers (phones, tablets) get the mobile shell', () => {
    expect(resolveShell({ query: '', isNative: false, coarsePointer: true })).toBe('mobile')
  })

  it('fine-pointer browsers get the desktop shell', () => {
    expect(resolveShell({ query: '', isNative: false, coarsePointer: false })).toBe('desktop')
  })

  it('?shell= overrides the detection in both directions', () => {
    expect(resolveShell({ query: '?shell=desktop', isNative: true, coarsePointer: true })).toBe('desktop')
    expect(resolveShell({ query: '?foo=1&shell=mobile', isNative: false, coarsePointer: false })).toBe('mobile')
  })

  it('junk or missing overrides fall back to detection', () => {
    expect(resolveShell({ query: '?shell=tablet', isNative: false, coarsePointer: false })).toBe('desktop')
    expect(resolveShell({ query: undefined, isNative: false, coarsePointer: true })).toBe('mobile')
  })
})

describe('pickShell', () => {
  it('reads the real environment (jsdom: not native, pointer per matchMedia)', () => {
    expect(pickShell()).toBe('desktop') // setup.js matchMedia stub reports matches: false

    vi.stubGlobal('matchMedia', (q) => ({ matches: q === '(pointer: coarse)', media: q, addEventListener() {}, removeEventListener() {} }))
    expect(pickShell()).toBe('mobile')
  })
})
