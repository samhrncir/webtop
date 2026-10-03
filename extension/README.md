# BrowserHome Companion extension

Browsers never let a web page navigate to their own internal pages
(`chrome://extensions`, `chrome://settings`, `edge://flags`, `about:blank`,
...). Only an extension may open them. This tiny extension does exactly
that for BrowserHome: when it is installed, bookmarks pointing at such URLs
open in a new tab like any other. Without it the app copies the URL to the
clipboard and asks you to paste it into the address bar.

There is no build step; the folder is the extension.

## Install (unpacked)

1. Open `chrome://extensions` and switch on **Developer mode** (top right).
2. Click **Load unpacked** and pick this `extension/` folder.
3. Any BrowserHome tab already open picks it up immediately; no reload needed.

Works the same in Edge, Brave and other Chromium browsers (open the
browser's own extensions page in step 1).

## Letting it see your deployed site

`manifest.json` lists the origins the content script may run on. It ships
with the dev server (`http://localhost/*`, any port), `127.0.0.1` and the
production site. Hosting it elsewhere too? Add that origin and reload the extension:

```json
"matches": ["http://localhost/*", "http://127.0.0.1/*", "https://browserhome.app/*"]
```

## How it works

- `content.js` runs on the matched origins, sets
  `<html data-browserhome-companion="1">` so the app knows it is installed,
  and relays the app's `postMessage({ type: 'browserhome:open-url', url })`
  to the service worker.
- `background.js` opens the URL with `chrome.tabs.create`, but only for
  browser-internal schemes; ordinary links never go through the extension.
- The app side lives in `src/utils/openUrl.js`.
