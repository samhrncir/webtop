import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
  {
    id: 'f1', type: 'folder', name: 'Vault',
    items: [{ id: 'c1', type: 'bookmark', name: 'Inside', url: 'https://inside.test' }],
  },
]
const visible = [
  { item: { id: 'v1', type: 'bookmark', name: 'Visible One', url: 'https://v1.test' }, pageIdx: 0, inFolder: null },
  {
    item: { id: 'vf', type: 'folder', name: 'Work', items: [{ id: 'v2', type: 'bookmark', name: 'In Folder', url: 'https://v2.test' }] },
    pageIdx: 1, inFolder: null,
  },
  { item: { id: 'v2', type: 'bookmark', name: 'In Folder', url: 'https://v2.test' }, pageIdx: 1, inFolder: 'Work' },
]

function mount(props = {}) {
  const handlers = {
    setHidden: vi.fn(), reorderHidden: vi.fn(), addHiddenFolder: vi.fn(),
    addToFolder: vi.fn(), removeFromFolder: vi.fn(), ejectFromFolder: vi.fn(), reorderFolderItems: vi.fn(),
    deleteItem: vi.fn(), renameItem: vi.fn(), updateBookmark: vi.fn(),
    toggleFavorite: vi.fn(), toggleAccount: vi.fn(), onBack: vi.fn(),
    ...props,
  }
  render(
    <ThemeProvider>
      <SettingsProvider>
        <IncognitoScreen
          hiddenItems={props.hiddenItems ?? hidden}
          visibleItems={props.visibleItems ?? visible}
          {...handlers}
        />
      </SettingsProvider>
    </ThemeProvider>
  )
  return handlers
}

const enterEditMode = () => userEvent.click(screen.getByRole('button', { name: /Edit/ }))
const openAddMenu = () => userEvent.click(screen.getByRole('button', { name: 'Hide a bookmark or add a folder' }))

beforeEach(() => {
  vi.spyOn(window, 'open').mockImplementation(() => null)
})

describe('the hidden bookmarks home screen', () => {
  it('lays hidden bookmarks and folders out as icons under an incognito header, not as a list', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Hidden bookmarks' })).toBeInTheDocument()
    expect(screen.getByText(/3 hidden/)).toBeInTheDocument() // folder contents count
    expect(screen.getByTitle('Secret')).toHaveClass('app-icon')
    expect(screen.getByTitle('Other')).toHaveClass('app-icon')
    expect(screen.getByTitle('Vault')).toHaveClass('folder-icon')
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
    mount({ hiddenItems: [] })
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

  it('× on a folder sends it to the Recycle Bin with its contents, no prompt', async () => {
    const h = mount()
    vi.spyOn(window, 'confirm')
    await enterEditMode()
    await userEvent.click(screen.getByRole('button', { name: 'Delete folder Vault' }))
    expect(window.confirm).not.toHaveBeenCalled()
    expect(h.deleteItem).toHaveBeenCalledWith('f1', null)
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

  it('on touch, a tap on a bookmark in edit mode opens App Info; folders keep their own controls', async () => {
    mount({ touchUi: true })
    await enterEditMode()
    await userEvent.click(screen.getByTitle('Vault'))
    expect(screen.queryByText('App Info')).not.toBeInTheDocument()
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

describe('folders', () => {
  it('opening a folder shows its bookmarks and a way to put the whole folder back', async () => {
    const h = mount()
    await userEvent.click(screen.getByTitle('Vault'))
    expect(screen.getByRole('heading', { name: 'Vault' })).toBeInTheDocument()
    expect(screen.getByText('Inside')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Show on home screen/ }))
    expect(h.setHidden).toHaveBeenCalledWith('f1', false)
    expect(screen.queryByRole('heading', { name: 'Vault' })).not.toBeInTheDocument()
  })

  it('a bookmark inside a folder gets App Info, and unhiding it lifts it out onto the home screen', async () => {
    const h = mount()
    await userEvent.click(screen.getByTitle('Vault'))
    await userEvent.dblClick(screen.getByTitle('Inside'))
    expect(screen.getByText('App Info')).toBeInTheDocument()
    const info = screen.getByText('App Info').closest('.app-info-modal')
    await userEvent.click(within(info).getByRole('button', { name: /Show on home screen/ }))
    expect(h.setHidden).toHaveBeenCalledWith('c1', false)
  })

  it('in edit mode, × inside the folder deletes that bookmark', async () => {
    const h = mount()
    await userEvent.click(screen.getByTitle('Vault'))
    await enterEditMode()
    await userEvent.click(screen.getByRole('button', { name: 'Delete Inside' }))
    expect(h.removeFromFolder).toHaveBeenCalledWith('c1', 'f1', null)
  })
})

describe('the + button', () => {
  it('"Hide existing" lists bookmarks and folders with their location, and hides the pick', async () => {
    const h = mount()
    await openAddMenu()
    expect(screen.getByRole('option', { name: 'Visible One — Page 1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '📁 Work (1) — Page 2' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'In Folder — Page 2 · Work' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Bookmark to hide'), { target: { value: 'vf' } })
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(h.setHidden).toHaveBeenCalledWith('vf', true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"New folder" creates an empty folder on the hidden screen', async () => {
    const h = mount()
    await openAddMenu()
    await userEvent.click(screen.getByRole('tab', { name: 'New folder' }))
    expect(screen.getByRole('button', { name: 'Create folder' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Folder name'), 'Receipts{Enter}')
    expect(h.addHiddenFolder).toHaveBeenCalledWith('Receipts')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says so when there is nothing left to hide', async () => {
    mount({ visibleItems: [] })
    await openAddMenu()
    expect(screen.getByRole('option', { name: 'Nothing left to hide' })).toBeInTheDocument()
  })

  it('Cancel closes the menu without changing anything', async () => {
    const h = mount()
    await openAddMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(h.setHidden).not.toHaveBeenCalled()
    expect(h.addHiddenFolder).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
