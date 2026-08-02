import { useState, useCallback, useEffect, useMemo } from 'react'
import { getIconCandidates } from '../utils/favicon.js'

// Resolves an item's icon, walking custom icon -> favicon and advancing on load errors.
// `src` is null once every candidate has failed — render the letter avatar then.
export function useIconSource(item) {
  const candidates = useMemo(() => getIconCandidates(item), [item?.icon, item?.url])
  const [index, setIndex] = useState(0)
  const key = candidates.join('|')

  useEffect(() => { setIndex(0) }, [key])

  const onError = useCallback(() => setIndex((i) => i + 1), [])

  return { src: candidates[index] ?? null, onError }
}
