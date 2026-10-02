import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IncognitoScreen from './IncognitoScreen.jsx'
import { ThemeProvider } from '../../context/ThemeContext.jsx'
import { SettingsProvider } from '../../context/SettingsContext.jsx'

// App Info pulls the emoji picker in lazily; the stub keeps these specs fast
// and offline (the picker itself is covered in AppInfoModal.test.jsx)
vi.mock('emoji-picker-react', () => ({ default: () => null }))

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
  const handlers = {
    setHidden: vi.fn(), reorderHidden: vi.fn(), deleteItem: vi.fn(), renameItem: vi.fn(),
    updateBookmark: vi.fn(), toggleFavorite: vi.fn(), toggleAccount: vi.fn(), onBack: vi.fn(),
    ...props,
  }
  render(
    <ThemeProvider>
      <SettingsProvider>
        <IncognitoScreen
          hiddenBookmarks={props.hiddenBookmarks ?? hidden}
          visibleBookmarks={props.visibleBookmarks ?? visible}
          {...handlers}
        />
      </SettingsProvider>
    </ThemeProvider>
  )
  return handlers
}

const enterEditMode = () => userEvent.click(screen.getByRole('button', { name: /Edit/ }))

beforeEach(() => {
  vi.spyOn(window, 'open').mockImplementation(() => null)
})

describe('the hidden bookmarks home screen', () => {
  it('lays hidden bookmarks out as icons under an incognito header, not as a list', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Hidden bookmarks' })).toBeInTheDocument()
    expect(screen.getByText(/2 hidden/)).toBeInTheDocument()
    expect(screen.getByTitle('Secret')).toHaveClass('app-icon')
    expect(screen.getByTitle('Other')).toHaveClass('app-icon')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('tapping an icon opens the bookmark, honoring its default sub page', async () => {
    mount()
    await userEvent.click(screen.getByTitle('Secret'))
    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith('https://secret.test/inbox', '_blank', 'noopener,noreferrer')
    )
  })

  it('shows an empty state when nothing is hidden', () => {
    mount({ hiddenBookmarks: [] })
    expect(screen.getByText('Nothing hidden yet')).toBeInTheDocument()
    expect(screen.getByText(/^Nothing hidden ·/)).toBeInTheDocument()
  })

  it('the back button returns to the home screen', async () => {
    const h = mount()
    await userEvent.click(screen.getByRole('button', { name: 'Back to home screen' }))
    expect(h.onBack).toHaveBeenCalled()
  })
})

describe('edit mode', () => {
  it('× deletes a hidden bookmark, confirming first when it has sub pages', async () => {
    const h = mount()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await enterEditMode()

    await userEvent.click(screen.getByRole('button', { name: 'Delete Secret' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(h.deleteItem).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Delete Other' }))
    expect(h.deleteItem).toHaveBeenCalledWith('h2', null)
  })

  it('double-clicking a label renames the bookmark', async () => {
    const h = mount()
    await enterEditMode()
    await userEvent.dblClick(screen.getByText('Other'))
    const input = screen.getByDisplayValue('Other')
    await userEvent.clear(input)
    await userEvent.type(input, 'Renamed{Enter}')
    expect(h.renameItem).toHaveBeenCalledWith('h2', null, 'Renamed')
  })

  it('on touch, a tap on an icon in edit mode opens App Info', async () => {
    mount({ touchUi: true })
    await enterEditMode()
    await userEvent.click(screen.getByTitle('Other'))
    expect(screen.getByText('App Info')).toBeInTheDocument()
    expect(window.open).not.toHaveBeenCalled()
  })
})

describe('App Info on a hidden bookmark', () => {
  it('opens on double-click and offers "Show on home screen" in place of Hide and Pin', async () => {
    const h = mount()
    await userEvent.dblClick(screen.getByTitle('Other'))
    expect(screen.getByText('App Info')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Hide from home screen/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /taskbar/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Show on home screen/ }))
    expect(h.setHidden).toHaveBeenCalledWith('h2', false)
    expect(screen.queryByText('App Info')).not.toBeInTheDocument()
  })

  it('renders inside the given host so the mobile shell can style it as a sheet', async () => {
    mount({ touchUi: true, infoHostClassName: 'mobile-sheet-host' })
    await userEvent.dblClick(screen.getByTitle('Other'))
    expect(document.querySelector('.mobile-sheet-host .app-info-modal')).toBeInTheDocument()
  })
})

describe('the + button (hide a bookmark)', () => {
  it('opens a picker labelled with each bookmark’s page and folder, and hides the pick', async () => {
    const h = mount()
    await userEvent.click(screen.getByRole('button', { name: 'Hide a bookmark' }))
    expect(screen.getByRole('option', { name: 'Visible One — Page 1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'In Folder — Page 2 · Work' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Bookmark to hide'), { target: { value: 'v2' } })
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(h.setHidden).toHaveBeenCalledWith('v2', true)
    expect(screen.queryByRole('dialog', { name: 'Hide a bookmark' })).not.toBeInTheDocument()
  })

  it('says so when there is nothing left to hide', async () => {
    mount({ visibleBookmarks: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Hide a bookmark' }))
    expect(screen.getByRole('option', { name: 'No visible bookmarks' })).toBeInTheDocument()
  })

  it('Cancel closes the picker without hiding anything', async () => {
    const h = mount()
    await userEvent.click(screen.getByRole('button', { name: 'Hide a bookmark' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(h.setHidden).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
