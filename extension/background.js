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

// Chrome only injects content scripts into pages loaded after the extension
// is installed or reloaded. Inject into BrowserHome tabs that are already
// open so the user needn't reload them (host_permissions covers the same
// origins as the content script's matches).
chrome.runtime.onInstalled.addListener(async () => {
  const [{ matches }] = chrome.runtime.getManifest().content_scripts
  const tabs = await chrome.tabs.query({ url: matches })
  for (const tab of tabs) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
    } catch {
      // a tab we cannot script (discarded, or mid-navigation); it picks the
      // script up on its next load
    }
  }
})
