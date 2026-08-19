import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { SettingsProvider } from '../context/SettingsContext.jsx'
import { useDndZoom } from './dndZoom.js'

function mountAtScale(uiScale) {
  localStorage.setItem('browserhome_settings', JSON.stringify({ timeFormat: '12', uiScale }))
  const wrapper = ({ children }) => <SettingsProvider>{children}</SettingsProvider>
  return renderHook(() => useDndZoom(), { wrapper })
}

describe('useDndZoom', () => {
  it('is a complete no-op at 100% so default behavior is untouched', () => {
    const { result } = mountAtScale(100)
    expect(result.current.modifiers).toBeUndefined()
    expect(result.current.measuring).toBeUndefined()
    const detector = () => []
    expect(result.current.collision(detector)).toBe(detector)
  })

  it('divides drag transforms by the zoom factor', () => {
    const { result } = mountAtScale(150)
    const [unzoom] = result.current.modifiers
    const out = unzoom({ transform: { x: 150, y: -75, scaleX: 1, scaleY: 1 } })
    expect(out).toMatchObject({ x: 100, y: -50 })
  })

  it('divides pointer coordinates for pointer-based collision detection', () => {
    const { result } = mountAtScale(150)
    const detector = vi.fn((args) => args)
    const wrapped = result.current.collision(detector)
    wrapped({ pointerCoordinates: { x: 300, y: 150 } })
    expect(detector).toHaveBeenCalledWith(
      expect.objectContaining({ pointerCoordinates: { x: 200, y: 100 } })
    )
  })

  it('provides ÷zoom measuring for draggables, droppables and the overlay', () => {
    const { result } = mountAtScale(200)
    for (const kind of ['draggable', 'droppable', 'dragOverlay']) {
      expect(typeof result.current.measuring[kind].measure).toBe('function')
    }
  })
})
