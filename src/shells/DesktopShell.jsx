import React from 'react'
import HomescreenApp from './HomescreenApp.jsx'

// Mouse/keyboard-first UI. Once the mobile shell owns its own screens, the
// touch plumbing (TouchSensor, swipe recognizers, long-press paths) moves out
// of the shared components and this tree simplifies to pure pointer input.
export default function DesktopShell() {
  return <HomescreenApp />
}
