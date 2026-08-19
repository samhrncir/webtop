import { createContext, useContext, useState, useEffect } from 'react'

const SettingsContext = createContext(null)

const DEFAULTS = {
  timeFormat: '12',
  // Upper bound on home-grid columns; the grid shows fewer when the window
  // can't fit them, and never fewer than GRID_MIN_COLUMNS
  gridMaxColumns: 4,
  // AI Chat toolbar button target: a bookmark id takes precedence, else a URL
  aiChatBookmarkId: null,
  aiChatUrl: '',
}

export const GRID_MIN_COLUMNS = 4
export const GRID_MAX_COLUMNS = 12

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
