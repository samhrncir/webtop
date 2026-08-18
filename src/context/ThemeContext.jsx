import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'

const ThemeContext = createContext(null)

const STORAGE_KEY = 'browserhome_theme'
const PREFERENCES = ['system', 'light', 'dark']
const DARK_QUERY = '(prefers-color-scheme: dark)'

function systemTheme() {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

function loadPreference() {
  const saved = localStorage.getItem(STORAGE_KEY)
  // Older builds only ever stored the resolved 'light' / 'dark', so those keep
  // working as explicit choices; anything else falls back to following the OS
  return PREFERENCES.includes(saved) ? saved : 'system'
}

export function ThemeProvider({ children }) {
  // What the user asked for: 'system' | 'light' | 'dark'
  const [preference, setPreferenceState] = useState(loadPreference)
  // What the OS currently reports; only consulted while preference is 'system'
  const [osTheme, setOsTheme] = useState(systemTheme)

  const theme = preference === 'system' ? osTheme : preference

  // Track OS changes live so 'system' follows a scheduled dark mode etc.
  useEffect(() => {
    if (preference !== 'system') return
    const mq = window.matchMedia(DARK_QUERY)
    const onChange = (e) => setOsTheme(e.matches ? 'dark' : 'light')
    setOsTheme(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [preference])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, preference)
  }, [preference])

  const setPreference = useCallback((next) => {
    if (PREFERENCES.includes(next)) setPreferenceState(next)
  }, [])

  // Flips the resolved theme and pins it as an explicit choice
  const toggleTheme = useCallback(() => {
    setPreferenceState(theme === 'dark' ? 'light' : 'dark')
  }, [theme])

  const value = useMemo(
    () => ({ theme, preference, setPreference, toggleTheme }),
    [theme, preference, setPreference, toggleTheme]
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
