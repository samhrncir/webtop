export function resolveSubUrl(subUrl, baseUrl) {
  if (!subUrl.startsWith('http://') && !subUrl.startsWith('https://')) {
    try {
      return new URL(subUrl, baseUrl).href
    } catch {
      return subUrl
    }
  }
  return subUrl
}
