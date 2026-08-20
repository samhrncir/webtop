import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsPage from './SettingsPage.jsx'
import { ThemeProvider } from '../../context/ThemeContext.jsx'
import { SettingsProvider } from '../../context/SettingsContext.jsx'

const data = {
  pages: [{
    id: 'p1',
    items: [{ id: 'bm1', type: 'bookmark', name: 'Claude', url: 'https://claude.ai' }],
  }],
}

function mount(props = {}) {
  const handlers = {
    onBack: vi.fn(),
    importData: vi.fn(),
    exportData: vi.fn(),
    setHidden: vi.fn(),
    restorePage: vi.fn(),
    restoreFolder: vi.fn(),
    ...props,
  }
  render(
    <ThemeProvider>
      <SettingsProvider>
        <SettingsPage
          data={data}
          hiddenBookmarks={props.hiddenBookmarks ?? []}
          visibleBookmarks={[]}
          trash={props.trash ?? { pages: [], folders: [] }}
          {...handlers}
        />
      </SettingsProvider>
    </ThemeProvider>
  )
  return handlers
}

const storedSettings = () => JSON.parse(localStorage.getItem('browserhome_settings'))

describe('appearance', () => {
  it('choosing a color mode pins it and applies the theme', async () => {
    mount()
    await userEvent.click(screen.getByRole('button', { name: /Dark/ }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('browserhome_theme')).toBe('dark')
    await userEvent.click(screen.getByRole('button', { name: /System/ }))
    expect(localStorage.getItem('browserhome_theme')).toBe('system')
  })

  it('the display scale slider persists its value and offers a reset', async () => {
    mount()
    const slider = screen.getByLabelText('Display scale')
    fireEvent.change(slider, { target: { value: '150' } })
    expect(screen.getByText('150%')).toBeInTheDocument()
    expect(storedSettings().uiScale).toBe(150)

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(storedSettings().uiScale).toBe(100)
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
  })

  it('the grid columns slider is clamped to its 4-12 range', () => {
    mount()
    const slider = screen.getByLabelText('Maximum grid columns')
    expect(slider).toHaveAttribute('min', '4')
    expect(slider).toHaveAttribute('max', '12')
    fireEvent.change(slider, { target: { value: '8' } })
    expect(storedSettings().gridMaxColumns).toBe(8)
    expect(screen.getByText(/Up to 8 columns/)).toBeInTheDocument()
  })
})

describe('AI chat target', () => {
  it('picking a bookmark stores it and reports where the button goes', () => {
    mount()
    fireEvent.change(screen.getByLabelText('Default AI chat'), { target: { value: 'bm1' } })
    expect(storedSettings().aiChatBookmarkId).toBe('bm1')
    expect(screen.getByText(/AI Chat button opens Claude/)).toBeInTheDocument()
  })

  it('the custom URL flow normalizes on commit and flags junk', async () => {
    mount()
    fireEvent.change(screen.getByLabelText('Default AI chat'), { target: { value: '__custom__' } })
    const urlInput = screen.getByPlaceholderText('https://claude.ai/new')
    await userEvent.type(urlInput, 'claude.ai/new')
    fireEvent.blur(urlInput)
    expect(urlInput).toHaveValue('https://claude.ai/new')
    expect(storedSettings().aiChatUrl).toBe('https://claude.ai/new')

    await userEvent.clear(urlInput)
    await userEvent.type(urlInput, 'not a url at all')
    expect(screen.getByText('Enter a valid http(s) URL')).toBeInTheDocument()
  })
})

describe('sub-pages', () => {
  it('Hidden Bookmarks opens as a sub-page; back returns to Settings before leaving', async () => {
    const h = mount({ hiddenBookmarks: [{ id: 'h1', name: 'Secret', url: 'https://s.test' }] })
    expect(screen.getByText('1 hidden')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Manage ›' }))
    expect(screen.getByRole('heading', { name: 'Hidden Bookmarks' })).toBeInTheDocument()

    await userEvent.click(screen.getByTitle('Back'))
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(h.onBack).not.toHaveBeenCalled()

    await userEvent.click(screen.getByTitle('Back'))
    expect(h.onBack).toHaveBeenCalled()
  })

  it('the Recycle Bin sub-page shows its counts on the settings row', async () => {
    mount({ trash: { pages: [{ id: 'p9', deletedAt: new Date().toISOString(), itemCount: 1 }], folders: [] } })
    expect(screen.getByText('1 page, 0 folders')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open ›' }))
    expect(screen.getByRole('heading', { name: 'Recycle Bin' })).toBeInTheDocument()
  })
})

describe('data section', () => {
  it('Export triggers the download handler', async () => {
    const h = mount()
    await userEvent.click(screen.getByRole('button', { name: /Export/ }))
    expect(h.exportData).toHaveBeenCalled()
  })
})
