import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchBar from './SearchBar.jsx'
import { LONG_PRESS_MS } from '../../hooks/useLongPress.js'
import { FAVORITES_FILTER } from '../../utils/tags.js'

const data = {
  pages: [
    {
      id: 'p1',
      items: [
        { id: 'b1', type: 'bookmark', name: 'GitHub', url: 'https://github.com', tags: ['dev', 'work'], aliases: ['hub'], favorite: true },
        { id: 'f1', type: 'folder', name: 'Design Tools', items: [
          { id: 'c1', type: 'bookmark', name: 'Figma', url: 'https://figma.com', tags: ['design'] },
        ] },
      ],
    },
    { id: 'p2', items: [{ id: 'b2', type: 'bookmark', name: 'Dribbble', url: 'https://dribbble.com', tags: ['design'] }] },
  ],
}

function mount(props = {}) {
  const handlers = {
    onNavigateToPage: vi.fn(),
    onOpenFolder: vi.fn(),
    onSelectTag: vi.fn(),
    ...props,
  }
  render(<SearchBar data={data} {...handlers} />)
  return handlers
}

const input = () => screen.getByRole('combobox')
const resultNames = () =>
  screen.getAllByRole('option').map((r) => r.querySelector('.search-result-name').textContent)

beforeEach(() => {
  vi.spyOn(window, 'open').mockImplementation(() => null)
})

describe('SearchBar results', () => {
  it('lists matching tags ahead of bookmarks', async () => {
    mount()
    await userEvent.type(input(), 'de')
    expect(resultNames()).toEqual(['#design', '#dev', 'GitHub', 'Design Tools', 'Figma', 'Dribbble'])
    expect(screen.getByText(/Tag · 2 bookmarks/)).toBeInTheDocument()
  })

  it('clicking a bookmark opens it and navigates to its page', async () => {
    const h = mount()
    await userEvent.type(input(), 'dribbble')
    await userEvent.click(screen.getByText('Dribbble'))
    expect(window.open).toHaveBeenCalledWith('https://dribbble.com', '_blank', 'noopener,noreferrer')
    expect(h.onNavigateToPage).toHaveBeenCalledWith(1)
    expect(input()).toHaveValue('') // search cleared after opening
  })

  it('clicking a folder opens the folder instead of a URL', async () => {
    const h = mount()
    await userEvent.type(input(), 'design tools')
    await userEvent.click(screen.getByText('Design Tools'))
    expect(h.onOpenFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }), 0)
    expect(window.open).not.toHaveBeenCalled()
  })

  it('surfaces the matching alias only when the name does not explain the hit', async () => {
    mount()
    await userEvent.type(input(), 'hub')
    // "GitHub" contains "hub", so no alias line is shown
    expect(screen.queryByText(/alias:/)).not.toBeInTheDocument()
  })
})

describe('tags as search results', () => {
  it('picking a tag row filters the home screen and clears the query', async () => {
    const h = mount()
    await userEvent.type(input(), 'design')
    await userEvent.click(screen.getByText('#design'))
    expect(h.onSelectTag).toHaveBeenCalledWith('design')
    expect(input()).toHaveValue('')
  })

  it('clicking a tag pill on a bookmark row selects the tag without opening the bookmark', async () => {
    const h = mount()
    await userEvent.type(input(), 'github')
    await userEvent.click(screen.getByRole('button', { name: 'work' }))
    expect(h.onSelectTag).toHaveBeenCalledWith('work')
    expect(window.open).not.toHaveBeenCalled()
  })

  it('while a tag is active, results are scoped to it and folders drop out', async () => {
    mount({ activeTag: 'design' })
    expect(input()).toHaveAttribute('placeholder', 'Search #design...')
    await userEvent.type(input(), 'd')
    expect(resultNames()).toEqual(['#dev', 'Figma', 'Dribbble']) // no GitHub, no folder
  })
})

describe('favorites scoping', () => {
  it('while the favorites filter is active, results are only favorites', async () => {
    mount({ activeTag: FAVORITES_FILTER })
    expect(input()).toHaveAttribute('placeholder', 'Search favorites...')
    await userEvent.type(input(), 'd')
    expect(resultNames()).toEqual(['#design', '#dev', 'GitHub']) // Figma/Dribbble not favorited
  })

  it('says so when nothing favorited matches', async () => {
    mount({ activeTag: FAVORITES_FILTER })
    await userEvent.type(input(), 'zzz')
    expect(screen.getByText('No favorites found')).toBeInTheDocument()
  })
})

describe('keyboard navigation', () => {
  it('arrows move across tag and bookmark rows; Enter picks the active one', async () => {
    const h = mount()
    await userEvent.type(input(), 'de')
    fireEvent.keyDown(input(), { key: 'ArrowDown' }) // -> #dev
    fireEvent.keyDown(input(), { key: 'ArrowDown' }) // -> GitHub
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(window.open).toHaveBeenCalledWith('https://github.com', '_blank', 'noopener,noreferrer')
    expect(h.onSelectTag).not.toHaveBeenCalled()
  })

  it('Enter on the default first row picks the top tag', async () => {
    const h = mount()
    await userEvent.type(input(), 'de')
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(h.onSelectTag).toHaveBeenCalledWith('design')
  })

  it('Escape clears the query and closes the overlay', async () => {
    mount()
    await userEvent.type(input(), 'git')
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(input()).toHaveValue('')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })
})

describe('SearchBar global type-to-search', () => {
  it('typing anywhere focuses the search input when typeToFocus is on', async () => {
    mount({ typeToFocus: true })
    expect(input()).not.toHaveFocus()
    await userEvent.keyboard('git')
    expect(input()).toHaveFocus()
    expect(input()).toHaveValue('git')
  })

  it('stays off by default', () => {
    mount()
    fireEvent.keyDown(document.body, { key: 'g' })
    expect(input()).not.toHaveFocus()
  })

  it('ignores shortcuts and non-printable keys', () => {
    mount({ typeToFocus: true })
    fireEvent.keyDown(document.body, { key: 'g', ctrlKey: true })
    fireEvent.keyDown(document.body, { key: 'g', metaKey: true })
    fireEvent.keyDown(document.body, { key: 'g', altKey: true })
    fireEvent.keyDown(document.body, { key: 'Enter' })
    fireEvent.keyDown(document.body, { key: 'Tab' })
    fireEvent.keyDown(document.body, { key: ' ' })
    expect(input()).not.toHaveFocus()
  })

  it('leaves typing in another field alone', async () => {
    mount({ typeToFocus: true })
    const other = document.createElement('input')
    document.body.appendChild(other)
    other.focus()
    await userEvent.keyboard('hello')
    expect(other).toHaveValue('hello')
    expect(input()).not.toHaveFocus()
    other.remove()
  })

  it('does not steal keys while a modal is open', () => {
    mount({ typeToFocus: true })
    const backdrop = document.createElement('div')
    backdrop.className = 'add-modal-backdrop'
    document.body.appendChild(backdrop)
    fireEvent.keyDown(document.body, { key: 'g' })
    expect(input()).not.toHaveFocus()
    backdrop.remove()
  })
})

describe('holding a result for its actions', () => {
  // A right-click is the browser's own long press (and how Android reports
  // one), so it stands in for the finger here; the hold timing itself is
  // specified in useLongPress.test.jsx
  const rowOf = (name) => screen.getByText(name).closest('[role="option"]')
  const hold = (name) => fireEvent.contextMenu(rowOf(name))
  const goToLocation = () => screen.queryByRole('menuitem', { name: /Go to location/ })

  it('"Go to location" reports where the bookmark lives instead of opening it', async () => {
    const h = mount({ onLocate: vi.fn() })
    await userEvent.type(input(), 'figma')
    hold('Figma')
    await userEvent.click(goToLocation())
    expect(h.onLocate).toHaveBeenCalledWith({
      item: expect.objectContaining({ id: 'c1' }),
      pageIdx: 0,
      folder: expect.objectContaining({ id: 'f1' }),
    })
    expect(window.open).not.toHaveBeenCalled()
    expect(h.onNavigateToPage).not.toHaveBeenCalled()
    expect(input()).toHaveValue('') // search cleared, like opening a result
    expect(goToLocation()).not.toBeInTheDocument()
  })

  it('a top-level bookmark reports no folder; folders can be located too', async () => {
    const h = mount({ onLocate: vi.fn() })
    await userEvent.type(input(), 'dribbble')
    hold('Dribbble')
    await userEvent.click(goToLocation())
    expect(h.onLocate).toHaveBeenCalledWith({ item: expect.objectContaining({ id: 'b2' }), pageIdx: 1, folder: null })

    await userEvent.type(input(), 'design tools')
    hold('Design Tools')
    await userEvent.click(goToLocation())
    expect(h.onLocate).toHaveBeenLastCalledWith({ item: expect.objectContaining({ id: 'f1' }), pageIdx: 0, folder: null })
    expect(h.onOpenFolder).not.toHaveBeenCalled()
  })

  it('a finger held still opens it too, and the lift that ends the hold does not open the link', () => {
    vi.useFakeTimers()
    try {
      mount({ onLocate: vi.fn() })
      fireEvent.change(input(), { target: { value: 'dribbble' } })
      const row = rowOf('Dribbble')
      fireEvent.pointerDown(row, { button: 0, clientX: 5, clientY: 5 })
      act(() => vi.advanceTimersByTime(LONG_PRESS_MS))
      fireEvent.pointerUp(row)
      fireEvent.click(row)
      expect(goToLocation()).toBeInTheDocument()
      expect(row).toHaveClass('is-active') // the held row is the active one
      expect(window.open).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('Escape closes the menu before it clears the query; a press elsewhere or a new query closes it too', async () => {
    mount({ onLocate: vi.fn() })
    await userEvent.type(input(), 'github')
    hold('GitHub')
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(goToLocation()).not.toBeInTheDocument()
    expect(input()).toHaveValue('github')

    hold('GitHub')
    fireEvent.pointerDown(document.body)
    expect(goToLocation()).not.toBeInTheDocument()

    hold('GitHub')
    fireEvent.change(input(), { target: { value: 'git' } })
    expect(goToLocation()).not.toBeInTheDocument()
  })

  it('tag rows have no actions', async () => {
    mount({ onLocate: vi.fn() })
    await userEvent.type(input(), 'design')
    expect(fireEvent.contextMenu(rowOf('#design'))).toBe(true) // native menu kept
    expect(goToLocation()).not.toBeInTheDocument()
  })

  it('without onLocate (the desktop shell) rows keep the browser menu and open none of their own', async () => {
    mount()
    await userEvent.type(input(), 'github')
    expect(fireEvent.contextMenu(rowOf('GitHub'))).toBe(true)
    expect(goToLocation()).not.toBeInTheDocument()
  })
})
