import { useState, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { getIconCandidates, getItemEmoji } from '../utils/favicon.js'
import { loadBrandIndex, subscribeBrandIcons, getBrandIconsVersion } from '../utils/brandIcons.js'
import { useTheme } from '../context/ThemeContext.jsx'

// Resolves an item's icon, walking custom icon -> theSVG brand mark -> favicon
// and advancing on load errors. `src` is null once every candidate has failed —
// render the letter avatar then. `emoji` is set when the item wants an emoji
// tile instead; it takes priority over `src` but leaves the image chain
// intact, so clearing it falls back cleanly.
export function useIconSource(item) {
  // Brand marks come in a theme-appropriate variant; outside a ThemeProvider
  // (tests, harnesses) assume dark
  const theme = useTheme()?.theme ?? 'dark'
  // Re-resolve when the theSVG index arrives or is manually refreshed
  const brandVersion = useSyncExternalStore(subscribeBrandIcons, getBrandIconsVersion)
  useEffect(() => { loadBrandIndex() }, [])

  const candidates = useMemo(
    () => getIconCandidates(item, { theme }),
    [item?.icon, item?.url, theme, brandVersion]
  )
  const [index, setIndex] = useState(0)
  // brandVersion is part of the key so a manual refresh restarts the chain
  // even when the candidate URLs come out identical
  const key = `${candidates.join('|')}#${brandVersion}`

  useEffect(() => { setIndex(0) }, [key])

  const onError = useCallback(() => setIndex((i) => i + 1), [])

  return { src: candidates[index] ?? null, onError, emoji: getItemEmoji(item) }
}
