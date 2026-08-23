import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MobileShell from './MobileShell.jsx'
import { ThemeProvider } from '../context/ThemeContext.jsx'
import { SettingsProvider } from '../context/SettingsContext.jsx'

// Integration specs: the real useHomescreen hook against seeded storage,
// driven through the mobile shell the way a thumb would.

const NOW = new Date().toISOString()
const page = (id, position) => ({ id, position, deleted_at: null, updated_at: NOW })
const bm = (id, page_id, position, content = {}, over = {}) => ({
  id, page_id, folder_id: null, type: 'bookmark', position,
  deleted_at: null, updated_at: NOW,
  content: { name: id, url: `https://${id}.test`, ...content },
  ...over,
})
const folder = (id, page_id, position, name = id) => ({
  ...bm(id, page_id, position), type: 'folder', content: { name },
})

function mount(rows, settings = {}) {
  localStorage.setItem('browserhome_rows', JSON.stringify(rows))
  localStorage.setItem('browserhome_dirty', JSON.stringify({ pages: [], items: [] }))
  localStorage.setItem('browserhome_settings', JSON.stringify({ timeFormat: '12', ...settings }))
  return render(
    <ThemeProvider>
      <SettingsProvider>
        <MobileShell />
      </SettingsProvider>
    </ThemeProvider>
  )
}

const twoPages = () => ({
  pages: [page('p1', 'a'), page('p2', 'b')],
  items: [
    bm('alpha', 'p1', 'a', { tags: ['work'] }),
    bm('beta', 'p1', 'b'),
    folder('tools', 'p1', 'c', 'Tools'),
    bm('child', 'p1', 'a', {}, { folder_id: 'tools' }),
    bm('gamma', 'p2', 'a'),
  ],
})

beforeEach(() => {
  vi.spyOn(window, 'open').mockImplementation(() => null)
})

describe('mobile home', () => {
  it('lays out top bar, paged grid, page dots and the bottom bar', () => {
    mount(twoPages())
    expect(screen.getByRole('button', { name: /Edit/ })).toBeInTheDocument()
    expect(screen.getByTestId('mobile-pages')).toBeInTheDocument()
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('gamma')).toBeInTheDocument() // page 2 rendered too
    expect(screen.getByRole('combobox')).toBeInTheDocument() // search input
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })

  it('tapping a bookmark opens it', async () => {
    mount(twoPages())
    await userEvent.click(screen.getByText('alpha'))
    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith('https://alpha.test', '_blank', 'noopener,noreferrer')
    )
  })

  it('tapping a folder opens the folder overlay', async () => {
    mount(twoPages())
    await userEvent.click(screen.getByText('Tools'))
    expect(screen.getByRole('heading', { name: 'Tools' })).toBeInTheDocument()
    expect(screen.getByText('child')).toBeInTheDocument()
  })

  it('the AI chat button appears when configured and opens the target', async () => {
    mount(twoPages(), { aiChatUrl: 'https://claude.ai/new' })
    await userEvent.click(screen.getByRole('button', { name: /claude/i }))
    expect(window.open).toHaveBeenCalledWith('https://claude.ai/new', '_blank', 'noopener,noreferrer')
  })
})

describe('edit mode on mobile', () => {
  it('a tap in edit mode opens the App Info bottom sheet instead of the URL', async () => {
    mount(twoPages())
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }))
    await userEvent.click(screen.getByText('alpha'))
    expect(document.querySelector('.mobile-sheet-host .app-info-modal')).toBeInTheDocument()
    expect(window.open).not.toHaveBeenCalled()
  })

  it('hiding from the sheet removes the bookmark from the grid', async () => {
    mount(twoPages())
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }))
    await userEvent.click(screen.getByText('alpha'))
    await userEvent.click(screen.getByRole('button', { name: /Hide from home screen/ }))
    expect(document.querySelector('.mobile-sheet-host')).not.toBeInTheDocument()
    expect(screen.queryByText('alpha')).not.toBeInTheDocument()
  })

  it('the delete × still deletes in edit mode (regression: capture-phase tap hijack)', async () => {
    mount(twoPages())
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete beta' }))
    expect(screen.queryByText('beta')).not.toBeInTheDocument()
    expect(document.querySelector('.mobile-sheet-host')).not.toBeInTheDocument()
  })

  it('folders never open the bookmark-shaped sheet (regression)', async () => {
    mount(twoPages())
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }))
    await userEvent.click(screen.getByText('Tools'))
    expect(document.querySelector('.mobile-sheet-host')).not.toBeInTheDocument()
  })

  it('the FAB appears in edit mode and adds a bookmark to the grid', async () => {
    mount(twoPages())
    expect(screen.queryByRole('button', { name: 'Add bookmark or folder' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Add bookmark or folder' }))
    await userEvent.type(screen.getByPlaceholderText('https://example.com'), 'https://new.test')
    // the modal auto-suggests a name from the URL; replace it
    await userEvent.clear(screen.getByPlaceholderText('My Site'))
    await userEvent.type(screen.getByPlaceholderText('My Site'), 'Newcomer{Enter}')
    expect(screen.queryByText('Add New')).not.toBeInTheDocument() // modal closed = submit fired
    expect(await screen.findByText('Newcomer')).toBeInTheDocument()
  })
})

describe('the sheet edits real data', () => {
  it('saving a rename from the sheet updates the grid', async () => {
    mount(twoPages())
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }))
    await userEvent.click(screen.getByText('alpha'))
    await userEvent.click(within(document.querySelector('.mobile-sheet-host')).getByRole('button', { name: 'Edit' }))
    const name = screen.getByPlaceholderText('App name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Alpha Prime')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    // Save closes the sheet itself
    expect(document.querySelector('.mobile-sheet-host')).not.toBeInTheDocument()
    expect(screen.getByText('Alpha Prime')).toBeInTheDocument()
  })

  it('starring from the sheet makes the favorites chip appear', async () => {
    mount(twoPages())
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }))
    await userEvent.click(screen.getByText('alpha'))
    await userEvent.click(screen.getByRole('button', { name: /Favorite$/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('button', { name: /★/ })).toBeInTheDocument()
  })
})

describe('filters and navigation', () => {
  it('a tag chip flattens the grid to matching bookmarks and hides page dots', async () => {
    mount(twoPages())
    await userEvent.click(screen.getByRole('button', { name: /work/ }))
    expect(screen.getByTestId('mobile-filtered-grid')).toBeInTheDocument()
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.queryByText('beta')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mobile-pages')).not.toBeInTheDocument()
  })

  it('page dots drive the pager', async () => {
    mount(twoPages())
    const dot2 = screen.getByRole('button', { name: 'Go to page 2' })
    await userEvent.click(dot2)
    expect(dot2.className).toContain('active')
  })

  it('the settings button swaps to the full-screen settings page and back', async () => {
    mount(twoPages())
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    await userEvent.click(screen.getByTitle('Back'))
    expect(screen.getByTestId('mobile-pages')).toBeInTheDocument()
  })
})
