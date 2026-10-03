import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddBookmarkModal from './AddBookmarkModal.jsx'

function mount() {
  const handlers = { onClose: vi.fn(), onAddBookmark: vi.fn(), onAddFolder: vi.fn() }
  render(<AddBookmarkModal {...handlers} />)
  return handlers
}

async function addBookmark(url, name = '') {
  await userEvent.type(screen.getByPlaceholderText('https://example.com'), url)
  if (name) await userEvent.type(screen.getByPlaceholderText('My Site'), name)
  await userEvent.click(screen.getByRole('button', { name: 'Add Bookmark' }))
}

describe('adding a bookmark', () => {
  it('prepends https:// to a bare host and names it after the domain', async () => {
    const h = mount()
    await addBookmark('github.com')
    expect(h.onAddBookmark).toHaveBeenCalledWith('https://github.com', 'Github')
    expect(h.onClose).toHaveBeenCalled()
  })

  it('accepts browser-internal pages such as chrome://extensions as typed', async () => {
    const h = mount()
    await addBookmark('chrome://extensions/')
    expect(h.onAddBookmark).toHaveBeenCalledWith('chrome://extensions/', 'Extensions')
  })

  it('rejects text that is not a URL and keeps the dialog open', async () => {
    const h = mount()
    await addBookmark('not a url')
    expect(screen.getByText(/Please enter a valid URL/)).toBeInTheDocument()
    expect(h.onAddBookmark).not.toHaveBeenCalled()
    expect(h.onClose).not.toHaveBeenCalled()
  })
})
