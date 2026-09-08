import { useRef, useCallback, useEffect, useMemo } from 'react'

export const LONG_PRESS_MS = 500
export const LONG_PRESS_TOLERANCE_PX = 10

// Long-press detection for one element. `onLongPress` fires once the
// primary pointer has been held still for `delay` ms; drifting past
// `tolerance` px, lifting, or the browser cancelling the pointer (it
// decided the touch is a scroll) abandons the hold. The browser's own
// contextmenu event — a right-click, or Android reporting its native long
// press — counts as a long press too, so the same thing opens and the
// native menu never does.
//
// Spread `bind` onto the element. In its click handler call
// `consumeLongPress()` first and bail when it returns true: the finger
// lifting after a long press still clicks, and that click must not run the
// element's tap action on top of the menu.
//
// Without a callback the hook is inert — no listeners, native menu kept —
// so a shell that doesn't offer hold actions is unaffected.
export function useLongPress(onLongPress, { delay = LONG_PRESS_MS, tolerance = LONG_PRESS_TOLERANCE_PX } = {}) {
  const timer = useRef(null)
  const origin = useRef(null)
  const fired = useRef(false)
  const callback = useRef(onLongPress)
  callback.current = onLongPress

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    origin.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  const fire = useCallback(() => {
    cancel()
    fired.current = true
    callback.current?.()
  }, [cancel])

  const consumeLongPress = useCallback(() => {
    const was = fired.current
    fired.current = false
    return was
  }, [])

  const enabled = Boolean(onLongPress)
  const bind = useMemo(() => {
    if (!enabled) return {}
    return {
      onPointerDown: (e) => {
        // A long press whose click the browser swallowed leaves the flag
        // set; every new press starts clean
        fired.current = false
        if (e.button !== 0) return // a right-click reaches onContextMenu instead
        origin.current = { x: e.clientX, y: e.clientY }
        timer.current = setTimeout(fire, delay)
      },
      onPointerMove: (e) => {
        if (!origin.current) return
        if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > tolerance) cancel()
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu: (e) => {
        e.preventDefault()
        // Android fires this for the same hold the timer already answered
        if (!fired.current) fire()
      },
    }
  }, [enabled, delay, tolerance, fire, cancel])

  return { bind, consumeLongPress }
}
