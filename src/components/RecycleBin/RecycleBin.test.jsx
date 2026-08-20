import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecycleBin from './RecycleBin.jsx'

const recent = new Date(Date.now() - 2 * 60 * 1000).toISOString()

function mount(trash = { pages: [], folders: [] }) {
  const restorePage = vi.fn()
  const restoreFolder = vi.fn()
  render(<RecycleBin trash={trash} restorePage={restorePage} restoreFolder={restoreFolder} />)
  return { restorePage, restoreFolder }
}

describe('RecycleBin', () => {
  it('shows empty states when nothing has been deleted', () => {
    mount()
    expect(screen.getByText('No deleted pages.')).toBeInTheDocument()
    expect(screen.getByText('No deleted folders.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument()
  })

  it('lists deleted pages with their contents and when they were deleted', () => {
    mount({ pages: [{ id: 'p9', deletedAt: recent, itemCount: 3 }], folders: [] })
    expect(screen.getByText('Pages (1)')).toBeInTheDocument()
    expect(screen.getByText('Page with 3 items')).toBeInTheDocument()
    expect(screen.getByText(/2 min ago/)).toBeInTheDocument()
  })

  it('lists deleted folders by name with their bookmark count', () => {
    mount({ pages: [], folders: [{ id: 'f9', name: 'Work', deletedAt: recent, itemCount: 1 }] })
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText(/1 bookmark ·/)).toBeInTheDocument()
  })

  it('Restore hands the right id to the right handler', async () => {
    const h = mount({
      pages: [{ id: 'p9', deletedAt: recent, itemCount: 2 }],
      folders: [{ id: 'f9', name: 'Work', deletedAt: recent, itemCount: 1 }],
    })
    const buttons = screen.getAllByRole('button', { name: 'Restore' })
    await userEvent.click(buttons[0])
    expect(h.restorePage).toHaveBeenCalledWith('p9')
    await userEvent.click(buttons[1])
    expect(h.restoreFolder).toHaveBeenCalledWith('f9')
  })

  it('explains that restores bring back everything deleted together', () => {
    mount({ pages: [{ id: 'p9', deletedAt: recent, itemCount: 2 }], folders: [] })
    expect(screen.getByText(/Restoring brings back everything/)).toBeInTheDocument()
  })
})
