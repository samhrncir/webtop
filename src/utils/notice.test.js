import { describe, it, expect, vi, afterEach } from 'vitest'
import { showNotice } from './notice.js'

afterEach(() => {
  vi.useRealTimers()
  document.querySelectorAll('.app-notice').forEach((el) => el.remove())
})

describe('showNotice', () => {
  it('shows the text as a status line and removes it after a while', () => {
    vi.useFakeTimers()
    showNotice('Copied', { duration: 1000 })
    const notice = document.querySelector('.app-notice')
    expect(notice).toHaveAttribute('role', 'status')
    expect(notice).toHaveTextContent('Copied')
    vi.advanceTimersByTime(1000)
    expect(document.querySelector('.app-notice')).toBeNull()
  })

  it('shows only the latest notice', () => {
    showNotice('first')
    showNotice('second')
    const notices = document.querySelectorAll('.app-notice')
    expect(notices).toHaveLength(1)
    expect(notices[0]).toHaveTextContent('second')
  })
})
