import { clampUiScale } from '../context/SettingsContext.jsx'

// Style for the app root that applies the Display Scale setting.
//
// CSS zoom multiplies every length in the subtree — including vh/vw units,
// which are resolved against the real viewport first. So `max-height: 85vh`
// inside a zoom:1.5 root renders 127.5% of the window tall and modals clip
// off-screen. The fix is `--ui-zoom`: viewport-unit rules in the zoomed
// subtree divide by it (`calc(85vh / var(--ui-zoom, 1))`), and pointer
// coordinates (visual px) divide by it to become subtree CSS px.
export function uiScaleStyle(uiScale) {
  const zoom = clampUiScale(uiScale) / 100
  return { zoom, '--ui-zoom': zoom }
}

// The zoom factor itself, for coordinate math in components.
export function uiZoomFactor(uiScale) {
  return clampUiScale(uiScale) / 100
}
