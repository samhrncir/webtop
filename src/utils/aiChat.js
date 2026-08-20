import { flattenBookmarks } from './tags.js'
import { resolveSubUrl } from './url.js'

// The AI Chat toolbar button opens one target: either a bookmark the user
// picked (so it follows renames / URL edits) or a free-form URL.

export function normalizeChatUrl(raw) {
  const trimmed = (raw || '').trim()
  if (!trimmed) return ''
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const parsed = new URL(withScheme)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : ''
  } catch {
    return ''
  }
}

function bookmarkTarget(item) {
  const defaultSub = item.subUrls?.find((s) => s.isDefault)
  return defaultSub ? resolveSubUrl(defaultSub.url, item.url) : item.url
}

// -> { name, url, item? } or null when nothing usable is configured
export function resolveAiChat(settings, data) {
  if (settings?.aiChatBookmarkId && data) {
    const match = flattenBookmarks(data).find(({ item }) => item.id === settings.aiChatBookmarkId)
    if (match) {
      const item = match.item
      // A picked sub page overrides the bookmark's default target; if that
      // sub page was deleted, fall back to the default rather than break
      const sub = settings.aiChatSubUrlId
        ? item.subUrls?.find((s) => s.id === settings.aiChatSubUrlId)
        : null
      if (sub) {
        return { name: `${item.name} · ${sub.name}`, url: resolveSubUrl(sub.url, item.url), item }
      }
      return { name: item.name, url: bookmarkTarget(item), item }
    }
    // Bookmark was deleted — fall through to the URL if one is set
  }
  const url = normalizeChatUrl(settings?.aiChatUrl)
  if (!url) return null
  let name = 'AI Chat'
  try { name = new URL(url).hostname.replace(/^www\./, '') } catch { /* keep default */ }
  return { name, url }
}
