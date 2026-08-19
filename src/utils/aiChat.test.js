import { describe, it, expect } from 'vitest'
import { normalizeChatUrl, resolveAiChat } from './aiChat.js'

describe('normalizeChatUrl', () => {
  it('adds https:// when the scheme is missing', () => {
    expect(normalizeChatUrl('claude.ai/new')).toBe('https://claude.ai/new')
  })
  it('keeps http(s) URLs and rejects everything else', () => {
    expect(normalizeChatUrl('https://chatgpt.com')).toBe('https://chatgpt.com/')
    expect(normalizeChatUrl('not a url at all')).toBe('')
    expect(normalizeChatUrl('')).toBe('')
    expect(normalizeChatUrl(undefined)).toBe('')
  })
})

describe('resolveAiChat', () => {
  const data = {
    pages: [{
      id: 'p1',
      items: [
        {
          id: 'bm1', type: 'bookmark', name: 'Claude', url: 'https://claude.ai',
          subUrls: [{ id: 's1', name: 'New chat', url: '/new', isDefault: true }],
        },
      ],
    }],
  }

  it('prefers the picked bookmark and honors its default sub page', () => {
    const chat = resolveAiChat({ aiChatBookmarkId: 'bm1' }, data)
    expect(chat.name).toBe('Claude')
    expect(chat.url).toBe('https://claude.ai/new')
  })

  it('falls back to the custom URL when the bookmark is gone', () => {
    const chat = resolveAiChat({ aiChatBookmarkId: 'deleted', aiChatUrl: 'https://chatgpt.com' }, data)
    expect(chat.url).toBe('https://chatgpt.com/')
    expect(chat.name).toBe('chatgpt.com')
  })

  it('treats a bare word as a hostname (intranet hosts are allowed)', () => {
    expect(resolveAiChat({ aiChatUrl: 'chatbox' }, data)).toMatchObject({ url: 'https://chatbox/' })
  })

  it('returns null when nothing usable is configured', () => {
    expect(resolveAiChat({}, data)).toBeNull()
    expect(resolveAiChat({ aiChatUrl: 'not a url at all' }, data)).toBeNull()
  })
})
