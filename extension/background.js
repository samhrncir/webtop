// Opens browser-internal pages on the app's behalf. Only the schemes a web
// page cannot open itself are accepted; keep in sync with INTERNAL_SCHEMES
// in src/utils/openUrl.js.

const INTERNAL_URL = /^(chrome|edge|brave|vivaldi|opera|about):/i

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'open-url' || typeof message.url !== 'string') return
  if (!INTERNAL_URL.test(message.url)) return
  const openerIndex = sender.tab ? sender.tab.index + 1 : undefined
  chrome.tabs.create({ url: message.url, index: openerIndex })
})
