import { Capacitor } from '@capacitor/core'

// Which UI shell to run. The mobile shell serves every touch-first surface —
// the Android app always, and browsers whose primary pointer is coarse
// (phones, tablets). Desktops — including touchscreen laptops, whose primary
// pointer is the trackpad — get the desktop shell. Pointer capability is the
// signal, not viewport width: a phone in landscape is still a thumb, a
// half-snapped desktop window is still a mouse.
//
// `?shell=desktop` / `?shell=mobile` overrides the pick (dev + escape hatch).

export function resolveShell({ query, isNative, coarsePointer }) {
  const forced = /[?&]shell=(mobile|desktop)\b/.exec(query || '')
  if (forced) return forced[1]
  return isNative || coarsePointer ? 'mobile' : 'desktop'
}

export function pickShell() {
  return resolveShell({
    query: window.location.search,
    isNative: Capacitor.isNativePlatform(),
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
  })
}
