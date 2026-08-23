import React from 'react'
import HomescreenApp from '../shells/HomescreenApp.jsx'

// Touch-first UI for the Android app and coarse-pointer browsers.
//
// For now this renders the shared composition, so behavior is identical to
// the desktop shell — the seam exists so mobile-first screens can land here
// one at a time (paged grid tuned for thumbs, bottom-sheet App Info,
// full-screen search) without touching the desktop tree.
export default function MobileShell() {
  return <HomescreenApp />
}
