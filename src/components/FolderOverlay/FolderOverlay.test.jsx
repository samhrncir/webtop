import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FolderOverlay from './FolderOverlay.jsx'
import { SettingsProvider } from '../../context/SettingsContext.jsx'

const folder = {
  id: 'f1',
  name: 'Work',
  items: [
    { id: 'c1', type: 'bookmark', name: 'Alpha', url: 'https://a.test' },
    { id: 'c2', type: 'bookmark', name: 'Beta', url: 'https://b.test' },
  ],
}

function mount(props = {}) {
  const handlers = {
    onClose: vi.fn(),
    onOpenBookmark: vi.fn(),
    onOpenAppInfo: vi.fn(),
    onDeleteFromFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onEjectFromFolder: vi.fn(),
    onReorderFolderItems: vi.fn(),
  }
  render(
    <SettingsProvider>
      <FolderOverlay
        folder={props.folder ?? folder}
        editMode={props.editMode ?? false}
        appInfoOpen={props.appInfoOpen ?? false}
        {...handlers}
      />
    </SettingsProvider>
  )
  return handlers
}

describe('FolderOverlay', () => {
  it('shows the folder name and its bookmarks', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Work' })).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('says so when the folder is empty', () => {
    mount({ folder: { ...folder, items: [] } })
    expect(screen.getByText('This folder is empty')).toBeInTheDocument()
  })

  it('the close button and a backdrop click both close it', async () => {
    const h = mount()
    await userEvent.click(screen.getByRole('button', { name: 'Close folder' }))
    expect(h.onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(document.querySelector('.folder-overlay-backdrop'))
    expect(h.onClose).toHaveBeenCalledTimes(2)
  })

  it('Escape closes the folder — unless App Info is stacked above it', () => {
    const h = mount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(h.onClose).toHaveBeenCalledTimes(1)
  })

  it('leaves Escape to the App Info modal when that is open', () => {
    const h = mount({ appInfoOpen: true })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(h.onClose).not.toHaveBeenCalled()
  })

  it('double-clicking the title in edit mode renames the folder', async () => {
    const h = mount({ editMode: true })
    fireEvent.doubleClick(screen.getByRole('heading', { name: 'Work' }))
    const input = screen.getByDisplayValue('Work')
    await userEvent.clear(input)
    await userEvent.type(input, 'Projects{Enter}')
    expect(h.onRenameFolder).toHaveBeenCalledWith('f1', 'Projects')
  })

  it('edit-mode delete asks for confirmation, then removes from the folder', async () => {
    const h = mount({ editMode: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const dels = screen.getAllByRole('button', { name: /Delete/ })
    await userEvent.click(dels[0])
    expect(h.onDeleteFromFolder).toHaveBeenCalledWith('c1', 'f1')
  })
})
