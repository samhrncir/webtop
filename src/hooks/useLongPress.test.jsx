import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useLongPress, LONG_PRESS_MS } from './useLongPress.js'

function Holdable({ onLongPress, onTap }) {
  const { bind, consumeLongPress } = useLongPress(onLongPress)
  return (
    <div
      data-testid="row"
      {...bind}
      onClick={() => {
        if (consumeLongPress()) return
        onTap()
      }}
    >
      hold me
    </div>
  )
}

const row = () => screen.getByTestId('row')
const press = (init = {}) => fireEvent.pointerDown(row(), { button: 0, clientX: 10, clientY: 10, ...init })
const hold = () => act(() => vi.advanceTimersByTime(LONG_PRESS_MS))

let onLongPress, onTap
beforeEach(() => {
  vi.useFakeTimers()
  onLongPress = vi.fn()
  onTap = vi.fn()
})
afterEach(() => vi.useRealTimers())

describe('useLongPress', () => {
  beforeEach(() => {
    render(<Holdable onLongPress={onLongPress} onTap={onTap} />)
  })

  it('fires once the pointer has been held still for the delay', () => {
    press()
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS - 1))
    expect(onLongPress).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('a quick tap never fires it and still clicks', () => {
    press()
    act(() => vi.advanceTimersByTime(100))
    fireEvent.pointerUp(row())
    fireEvent.click(row())
    hold()
    expect(onLongPress).not.toHaveBeenCalled()
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('drifting past the tolerance (the finger is scrolling) abandons the hold', () => {
    press()
    fireEvent.pointerMove(row(), { clientX: 10, clientY: 40 })
    hold()
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('a small wobble under the tolerance keeps the hold alive', () => {
    press()
    fireEvent.pointerMove(row(), { clientX: 14, clientY: 13 })
    hold()
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('the browser cancelling the pointer abandons the hold', () => {
    press()
    fireEvent.pointerCancel(row())
    hold()
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('the click that ends a long press is swallowed; the next tap is not', () => {
    press()
    hold()
    fireEvent.pointerUp(row())
    fireEvent.click(row())
    expect(onTap).not.toHaveBeenCalled()
    press()
    fireEvent.pointerUp(row())
    fireEvent.click(row())
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('a right-click counts as a long press and suppresses the native menu', () => {
    fireEvent.pointerDown(row(), { button: 2 })
    const nativeMenuKept = fireEvent.contextMenu(row())
    expect(nativeMenuKept).toBe(false)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('the native long press arriving after the timer does not fire twice', () => {
    press()
    hold()
    fireEvent.contextMenu(row())
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('a swallowed click does not poison the next right-click', () => {
    press()
    hold() // no click follows: the browser suppressed it
    fireEvent.pointerDown(row(), { button: 2 })
    fireEvent.contextMenu(row())
    expect(onLongPress).toHaveBeenCalledTimes(2)
  })
})

describe('useLongPress without a callback', () => {
  it('is inert: taps click and the native menu is kept', () => {
    render(<Holdable onTap={onTap} />)
    press()
    hold()
    expect(fireEvent.contextMenu(row())).toBe(true)
    fireEvent.click(row())
    expect(onTap).toHaveBeenCalledTimes(1)
  })
})
