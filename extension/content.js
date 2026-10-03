// Runs inside the BrowserHome page. Marks the page so the app knows the
// companion is installed (src/utils/openUrl.js reads this attribute), and
// relays the app's open-url messages to the service worker, which is the
// only context allowed to open chrome:// pages.

document.documentElement.dataset.browserhomeCompanion = '1'

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return
  const data = event.data
  if (!data || data.type !== 'browserhome:open-url' || typeof data.url !== 'string') return
  chrome.runtime.sendMessage({ type: 'open-url', url: data.url })
})
