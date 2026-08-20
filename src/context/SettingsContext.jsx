import { createContext, useContext, useState, useEffect } from 'react'

const SettingsContext = createContext(null)

const DEFAULTS = {
  timeFormat: '12',
  // Upper bound on home-grid columns; the grid shows fewer when the window
  // can't fit them, and never fewer than GRID_MIN_COLUMNS
  gridMaxColumns: 4,
  // Whole-UI scale in percent (CSS zoom on the app root), independent of
  // the browser's own zoom so bookmarks can be big without pages being big
  uiScale: 100,
  // AI Chat toolbar button target: a bookmark id takes precedence, else a URL.
  // aiChatSubUrlId optionally narrows the bookmark to one of its sub pages.
  aiChatBookmarkId: null,
  aiChatSubUrlId: null,
  aiChatUrl: '',
}

export const GRID_MIN_COLUMNS = 4
export const GRID_MAX_COLUMNS = 12

export const UI_SCALE_MIN = 75
export const UI_SCALE_MAX = 200
export const UI_SCALE_STEP = 5

export function clampUiScale(n) {
  const v = Number.parseInt(n, 10)
  if (!Number.isFinite(v)) return 100
  const stepped = Math.round(v / UI_SCALE_STEP) * UI_SCALE_STEP
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, stepped))
}

export function clampGridColumns(n) {
  const v = Number.parseInt(n, 10)
  if (!Number.isFinite(v)) return GRID_MIN_COLUMNS
  return Math.min(GRID_MAX_COLUMNS, Math.max(GRID_MIN_COLUMNS, v))
}

function load() {
  try {
    const raw = localStorage.getItem('browserhome_settings')
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load)

  useEffect(() => {
    localStorage.setItem('browserhome_settings', JSON.stringify(settings))
  }, [settings])

  const setSetting = (key, value) =>
    setSettings((prev) => ({ ...prev, [key]: value }))

  return (
    <SettingsContext.Provider value={{ settings, setSetting }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
