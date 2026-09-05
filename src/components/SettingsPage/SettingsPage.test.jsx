import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsPage from './SettingsPage.jsx'
import { ThemeProvider } from '../../context/ThemeContext.jsx'
import { SettingsProvider } from '../../context/SettingsContext.jsx'

const data = {
  pages: [{
    id: 'p1',
    items: [{
      id: 'bm1', type: 'bookmark', name: 'Claude', url: 'https://claude.ai',
      subUrls: [{ id: 's1', name: 'New chat', url: '/new', isDefault: true }],
    }],
  }],
}

// Four tags across three bookmarks; "work" is the only one used twice
const taggedData = {
  pages: [{
    id: 'p1',
    items: [
      { id: 'bm1', type: 'bookmark', name: 'Claude', url: 'https://claude.ai', tags: ['ai', 'work'] },
      { id: 'bm2', type: 'bookmark', name: 'GitHub', url: 'https://github.com', tags: ['work', 'dev'] },
      { id: 'bm3', type: 'bookmark', name: 'YouTube', url: 'https://youtube.com', tags: ['fun'] },
    ],
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
          data={props.data ?? data}
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

  it('the stepper buttons nudge the display scale by one step (issue #33)', async () => {
    mount()
    await userEvent.click(screen.getByRole('button', { name: 'Increase display scale' }))
    expect(storedSettings().uiScale).toBe(105)
    expect(screen.getByText('105%')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Decrease display scale' }))
    expect(storedSettings().uiScale).toBe(100)
  })

  it('the steppers disable at the slider bounds', () => {
    mount()
    fireEvent.change(screen.getByLabelText('Display scale'), { target: { value: '75' } })
    expect(screen.getByRole('button', { name: 'Decrease display scale' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Display scale'), { target: { value: '200' } })
    expect(screen.getByRole('button', { name: 'Increase display scale' })).toBeDisabled()
  })

  it('grid columns get steppers too, stepping by one column', async () => {
    mount()
    await userEvent.click(screen.getByRole('button', { name: 'Increase maximum grid columns' }))
    expect(storedSettings().gridMaxColumns).toBe(5)
    fireEvent.change(screen.getByLabelText('Maximum grid columns'), { target: { value: '4' } })
    expect(screen.getByRole('button', { name: 'Decrease maximum grid columns' })).toBeDisabled()
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

describe('home screen tags', () => {
  const seedSettings = (partial) =>
    localStorage.setItem('browserhome_settings', JSON.stringify(partial))

  it('the Tags section sits right after Appearance', () => {
    mount({ data: taggedData })
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titles.indexOf('Tags')).toBe(titles.indexOf('Appearance') + 1)
    expect(screen.getByText('Home screen chips')).toBeInTheDocument()
  })

  it('switching to Chosen persists the mode and swaps the count slider for a checklist', async () => {
    mount({ data: taggedData })
    expect(screen.getByText('Show up to')).toBeInTheDocument()
    expect(screen.getByText('Most-used tags shown as chips')).toBeInTheDocument()
    expect(screen.getByLabelText('Maximum home screen tags')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Tags shown on the home screen' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Chosen' }))
    expect(storedSettings().homeTagsMode).toBe('chosen')
    expect(screen.queryByText('Show up to')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Maximum home screen tags')).not.toBeInTheDocument()
    const list = screen.getByRole('group', { name: 'Tags shown on the home screen' })
    expect(within(list).getAllByRole('checkbox')).toHaveLength(4)

    await userEvent.click(screen.getByRole('button', { name: 'Most used' }))
    expect(storedSettings().homeTagsMode).toBe('top')
    expect(screen.getByLabelText('Maximum home screen tags')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Tags shown on the home screen' })).not.toBeInTheDocument()
  })

  it('the checklist lists every tag alphabetically with how many bookmarks carry it', () => {
    seedSettings({ homeTagsMode: 'chosen' })
    mount({ data: taggedData })
    const names = screen.getAllByRole('checkbox').map((box) => box.closest('label').textContent)
    expect(names).toEqual(['ai1', 'dev1', 'fun1', 'work2'])
    const work = screen.getByText('work').closest('label')
    expect(within(work).getByText('2')).toBeInTheDocument()
  })

  it('the count slider is clamped to 1–12 and persists', async () => {
    mount({ data: taggedData })
    const slider = screen.getByLabelText('Maximum home screen tags')
    expect(slider).toHaveAttribute('min', '1')
    expect(slider).toHaveAttribute('max', '12')
    expect(screen.getByText(/The 5 most-used tags get a chip/)).toBeInTheDocument()

    fireEvent.change(slider, { target: { value: '8' } })
    expect(storedSettings().homeTagsMax).toBe(8)
    expect(screen.getByText(/The 8 most-used tags get a chip/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Increase maximum home screen tags' }))
    expect(storedSettings().homeTagsMax).toBe(9)

    fireEvent.change(slider, { target: { value: '12' } })
    expect(screen.getByRole('button', { name: 'Increase maximum home screen tags' })).toBeDisabled()
    fireEvent.change(slider, { target: { value: '1' } })
    expect(storedSettings().homeTagsMax).toBe(1)
    expect(screen.getByRole('button', { name: 'Decrease maximum home screen tags' })).toBeDisabled()
  })

  it('ticking a tag in Chosen mode stores it; unticking removes it', async () => {
    seedSettings({ homeTagsMode: 'chosen' })
    mount({ data: taggedData })
    expect(screen.getByRole('checkbox', { name: /work/ })).not.toBeChecked()

    await userEvent.click(screen.getByRole('checkbox', { name: /work/ }))
    expect(storedSettings().homeTagsChosen).toEqual(['work'])
    expect(screen.getByRole('checkbox', { name: /work/ })).toBeChecked()

    await userEvent.click(screen.getByRole('checkbox', { name: /^ai/ }))
    expect(storedSettings().homeTagsChosen).toEqual(['work', 'ai'])

    await userEvent.click(screen.getByRole('checkbox', { name: /work/ }))
    expect(storedSettings().homeTagsChosen).toEqual(['ai'])
    expect(screen.getByRole('checkbox', { name: /work/ })).not.toBeChecked()
  })

  it("the row's description reports how many tags get a chip", async () => {
    // "gone" is a pick whose tag no longer exists on any bookmark
    seedSettings({ homeTagsMode: 'chosen', homeTagsChosen: ['work', 'fun', 'gone'] })
    mount({ data: taggedData })
    expect(screen.getByText(/2 of 4 tags get a chip/)).toBeInTheDocument()
    // Stored picks come back ticked
    expect(screen.getByRole('checkbox', { name: /work/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /fun/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /dev/ })).not.toBeChecked()

    await userEvent.click(screen.getByRole('checkbox', { name: /dev/ }))
    expect(screen.getByText(/3 of 4 tags get a chip/)).toBeInTheDocument()
    // The vanished pick is kept, so it comes back if the tag is re-added
    expect(storedSettings().homeTagsChosen).toEqual(['work', 'fun', 'gone', 'dev'])
  })

  it('with no tags the checklist explains where tags come from', () => {
    seedSettings({ homeTagsMode: 'chosen' })
    mount()
    expect(screen.getByText(/No tags yet — add tags to a bookmark from its App Info panel/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByText(/0 of 0 tags get a chip/)).toBeInTheDocument()
  })

  it('an unknown stored mode falls back to Most used', () => {
    seedSettings({ homeTagsMode: 'bogus', homeTagsMax: 'lots' })
    mount({ data: taggedData })
    expect(screen.getByLabelText('Maximum home screen tags')).toHaveValue('5')
    expect(screen.getByText(/The 5 most-used tags get a chip/)).toBeInTheDocument()
  })

  it('a corrupt stored pick list is treated as empty', async () => {
    seedSettings({ homeTagsMode: 'chosen', homeTagsChosen: 'work' })
    mount({ data: taggedData })
    expect(screen.getByText(/0 of 4 tags get a chip/)).toBeInTheDocument()
    screen.getAllByRole('checkbox').forEach((box) => expect(box).not.toBeChecked())

    await userEvent.click(screen.getByRole('checkbox', { name: /dev/ }))
    expect(storedSettings().homeTagsChosen).toEqual(['dev'])
  })
})

describe('AI chat target', () => {
  it('picking a bookmark stores it and reports where the button goes', () => {
    mount()
    fireEvent.change(screen.getByLabelText('Default AI chat'), { target: { value: 'bm1' } })
    expect(storedSettings().aiChatBookmarkId).toBe('bm1')
    expect(screen.getByText(/AI Chat button opens Claude/)).toBeInTheDocument()
  })

  it('a bookmark sub page can be the target (issue #26)', () => {
    mount()
    fireEvent.change(screen.getByLabelText('Default AI chat'), { target: { value: 'bm1::s1' } })
    expect(storedSettings().aiChatBookmarkId).toBe('bm1')
    expect(storedSettings().aiChatSubUrlId).toBe('s1')
    expect(screen.getByText(/AI Chat button opens Claude · New chat/)).toBeInTheDocument()
  })

  it('picking the plain bookmark clears a previously picked sub page', () => {
    mount()
    fireEvent.change(screen.getByLabelText('Default AI chat'), { target: { value: 'bm1::s1' } })
    fireEvent.change(screen.getByLabelText('Default AI chat'), { target: { value: 'bm1' } })
    expect(storedSettings().aiChatBookmarkId).toBe('bm1')
    expect(storedSettings().aiChatSubUrlId).toBeNull()
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
