import { createContext, useContext, useState, useEffect } from 'react'

const SettingsContext = createContext(null)

const DEFAULTS = {
  timeFormat: '12',
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
