import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HiddenBookmarks from './HiddenBookmarks.jsx'

const hidden = [
  {
    id: 'h1', type: 'bookmark', name: 'Secret', url: 'https://secret.test',
    subUrls: [{ id: 's1', name: 'Inbox', url: '/inbox', isDefault: true }],
  },
  { id: 'h2', type: 'bookmark', name: 'Other', url: 'https://other.test' },
]
const visible = [
  { item: { id: 'v1', type: 'bookmark', name: 'Visible One', url: 'https://v1.test' }, pageIdx: 0, inFolder: null },
  { item: { id: 'v2', type: 'bookmark', name: 'In Folder', url: 'https://v2.test' }, pageIdx: 1, inFolder: 'Work' },
]

function mount(props = {}) {
  const setHidden = vi.fn()
  render(
    <HiddenBookmarks
      hiddenBookmarks={props.hiddenBookmarks ?? hidden}
      visibleBookmarks={props.visibleBookmarks ?? visible}
      setHidden={setHidden}
    />
  )
  return { setHidden }
}

beforeEach(() => {
  vi.spyOn(window, 'open').mockImplementation(() => null)
})

describe('hidden list', () => {
  it('lists every hidden bookmark with its URL and a count', () => {
    mount()
    expect(screen.getByText('Hidden (2)')).toBeInTheDocument()
    expect(screen.getByText('Secret')).toBeInTheDocument()
    expect(screen.getByText('https://other.test')).toBeInTheDocument()
  })

  it('Unhide sends the bookmark back to the home screen', async () => {
    const { setHidden } = mount()
    await userEvent.click(screen.getAllByRole('button', { name: 'Unhide' })[0])
    expect(setHidden).toHaveBeenCalledWith('h1', false)
  })

  it('Open launches the bookmark, honoring its default sub page', async () => {
    mount()
    await userEvent.click(screen.getAllByRole('button', { name: 'Open' })[0])
    expect(window.open).toHaveBeenCalledWith('https://secret.test/inbox', '_blank', 'noopener,noreferrer')
  })

  it('shows an empty state when nothing is hidden', () => {
    mount({ hiddenBookmarks: [] })
    expect(screen.getByText('Nothing hidden yet.')).toBeInTheDocument()
  })
})

describe('hide-a-bookmark picker', () => {
  it('labels options with their page and folder location', () => {
    mount()
    expect(screen.getByRole('option', { name: 'Visible One — Page 1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'In Folder — Page 2 · Work' })).toBeInTheDocument()
  })

  it('hides the picked bookmark', async () => {
    const { setHidden } = mount()
    fireEvent.change(screen.getByLabelText('Bookmark to hide'), { target: { value: 'v2' } })
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(setHidden).toHaveBeenCalledWith('v2', true)
  })

  it('the Hide button stays disabled until something is picked', () => {
    mount()
    expect(screen.getByRole('button', { name: 'Hide' })).toBeDisabled()
  })

  it('says so when there is nothing left to hide', () => {
    mount({ visibleBookmarks: [] })
    expect(screen.getByRole('option', { name: 'No visible bookmarks' })).toBeInTheDocument()
  })
})
