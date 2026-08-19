import { useMemo } from 'react'
import { getClientRect } from '@dnd-kit/core'
import { useSettings, clampUiScale } from '../context/SettingsContext.jsx'

// The UI scale setting applies CSS `zoom` to the app root. Zoom scales
// layout lengths but not pointer coordinates or getBoundingClientRect, so
// dnd-kit would otherwise move dragged items by zoom× the pointer delta and
// place the drag overlay at zoom× its origin. This hands every DndContext a
// consistent zoomed-space coordinate system: rects measured ÷zoom, pointer
// deltas ÷zoom, and the pointer ÷zoom for pointer-based collision detection.

function scaleRect(rect, f) {
  return {
    top: rect.top * f,
    left: rect.left * f,
    right: rect.right * f,
    bottom: rect.bottom * f,
    width: rect.width * f,
    height: rect.height * f,
  }
}

const identity = (detector) => detector

export function useDndZoom() {
  const { settings } = useSettings()
  const zoom = clampUiScale(settings.uiScale) / 100

  return useMemo(() => {
    if (zoom === 1) return { modifiers: undefined, measuring: undefined, collision: identity }

    const inv = 1 / zoom
    const measure = (node) => scaleRect(getClientRect(node), inv)
    const unzoom = ({ transform }) => ({ ...transform, x: transform.x * inv, y: transform.y * inv })
    const collision = (detector) => (args) =>
      detector({
        ...args,
        pointerCoordinates: args.pointerCoordinates
          ? { x: args.pointerCoordinates.x * inv, y: args.pointerCoordinates.y * inv }
          : args.pointerCoordinates,
      })

    return {
      modifiers: [unzoom],
      measuring: {
        draggable: { measure },
        droppable: { measure },
        dragOverlay: { measure },
      },
      collision,
    }
  }, [zoom])
}
