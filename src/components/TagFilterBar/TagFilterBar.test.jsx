import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TagFilterBar from './TagFilterBar.jsx'
import { FAVORITES_FILTER } from '../../utils/tags.js'
import { SettingsProvider } from '../../context/SettingsContext.jsx'

const tags = [{ tag: 'dev', count: 2 }]

// Seven tags with distinct counts so the default "five most-used" pick is
// unambiguous: dev, work, music, news and games get chips; art and shop fold
const seven = [
  { tag: 'art', count: 1 },
  { tag: 'dev', count: 9 },
  { tag: 'games', count: 3 },
  { tag: 'music', count: 7 },
  { tag: 'news', count: 5 },
  { tag: 'shop', count: 2 },
  { tag: 'work', count: 8 },
]

// Fourteen tags, most used first, alphabetised like allTags() output: five
// get chips and nine fold — enough for the menu to grow a search box
const greek = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi']
  .map((tag, i) => ({ tag, count: 14 - i }))
  .sort((a, b) => a.tag.localeCompare(b.tag))

// The bar reads its chip budget from settings, so every render sits under
// the provider; `settings` seeds localStorage for non-default modes
function mount(props, settings) {
  if (settings) localStorage.setItem('browserhome_settings', JSON.stringify(settings))
  const ui = (p) => (
    <SettingsProvider>
      <TagFilterBar activeTag={null} onSelect={() => {}} favoritesCount={0} {...p} />
    </SettingsProvider>
  )
  const result = render(ui(props))
  return { ...result, rerender: (next) => result.rerender(ui({ ...props, ...next })) }
}

const chip = (name) => screen.getByRole('button', { name: new RegExp(`^${name}\\s*\\d*$`) })
const queryChip = (name) => screen.queryByRole('button', { name: new RegExp(`^${name}\\s*\\d*$`) })
const moreButton = (n) => screen.getByRole('button', { name: `+${n} more` })
const menu = () => screen.getByRole('menu', { name: 'More tags' })
const queryMenu = () => screen.queryByRole('menu', { name: 'More tags' })
const menuItems = () => within(menu()).getAllByRole('menuitemradio').map((el) => el.textContent.replace(/\d+$/, ''))

describe('TagFilterBar favorites chip', () => {
  it('renders nothing when there are no tags and no favorites', () => {
    const { container } = mount({ tags: [], favoritesCount: 0 })
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the star chip (with count) once anything is favorited — even with no tags', () => {
    mount({ tags: [], favoritesCount: 3 })
    expect(screen.getByRole('button', { name: /★\s*3/ })).toBeInTheDocument()
  })

  it('clicking the star filters by favorites; clicking it again clears', async () => {
    const onSelect = vi.fn()
    const { rerender } = mount({ tags, favoritesCount: 1, onSelect })
    await userEvent.click(screen.getByRole('button', { name: /★/ }))
    expect(onSelect).toHaveBeenCalledWith(FAVORITES_FILTER)

    rerender({ activeTag: FAVORITES_FILTER })
    expect(screen.getByRole('button', { name: /★/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /★/ }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('tag chips still work alongside the star', async () => {
    const onSelect = vi.fn()
    mount({ tags, favoritesCount: 1, onSelect })
    await userEvent.click(screen.getByRole('button', { name: /dev/ }))
    expect(onSelect).toHaveBeenCalledWith('dev')
  })
})

describe('TagFilterBar folds tags behind a "+N more" chip', () => {
  it('with few tags nothing is folded', () => {
    mount({ tags: seven.slice(0, 5) })
    for (const { tag } of seven.slice(0, 5)) expect(chip(tag)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /more$/ })).not.toBeInTheDocument()
  })

  it('shows the five most-used tags and folds the rest behind a +N more chip', () => {
    mount({ tags: seven })
    for (const tag of ['dev', 'work', 'music', 'news', 'games']) {
      expect(chip(tag)).toHaveAttribute('aria-pressed', 'false')
    }
    expect(queryChip('art')).not.toBeInTheDocument()
    expect(queryChip('shop')).not.toBeInTheDocument()
    expect(moreButton(2)).toHaveAttribute('aria-expanded', 'false')
    expect(queryMenu()).not.toBeInTheDocument()
  })

  it('the More menu lists the folded tags; picking one applies the filter and closes the menu', async () => {
    const onSelect = vi.fn()
    mount({ tags: seven, onSelect })
    await userEvent.click(moreButton(2))

    expect(moreButton(2)).toHaveAttribute('aria-expanded', 'true')
    // The chip is announced as a menu button, points at the menu it opened
    // and lights up like an active chip for as long as the menu is showing
    expect(moreButton(2)).toHaveAttribute('aria-haspopup', 'menu')
    expect(moreButton(2).getAttribute('aria-controls')).toBe(menu().id)
    expect(moreButton(2)).toHaveClass('active')
    expect(menuItems()).toEqual(['art', 'shop'])
    // Nothing folded is active, so no item is checked
    for (const item of within(menu()).getAllByRole('menuitemradio')) {
      expect(item).toHaveAttribute('aria-checked', 'false')
    }
    // Plenty of room to the right in a 1024px viewport, so the menu hangs
    // from the chip's left edge
    expect(menu()).not.toHaveClass('tag-filter-menu--right')

    await userEvent.click(within(menu()).getByRole('menuitemradio', { name: /^art/ }))
    expect(onSelect).toHaveBeenCalledWith('art')
    expect(queryMenu()).not.toBeInTheDocument()
    expect(moreButton(2)).toHaveAttribute('aria-expanded', 'false')
    expect(moreButton(2)).not.toHaveClass('active')
  })

  it('a folded tag that is active still gets its own chip, and the More count drops by one', () => {
    mount({ tags: seven, activeTag: 'art' })
    expect(chip('art')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('dev')).toHaveAttribute('aria-pressed', 'false')
    expect(moreButton(1)).toBeInTheDocument()
  })

  it('picking the active tag again from a chip clears the filter', async () => {
    const onSelect = vi.fn()
    mount({ tags: seven, activeTag: 'art', onSelect })
    await userEvent.click(chip('art'))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('the menu is short enough to scan with seven tags, so it has no search box', async () => {
    mount({ tags: seven })
    await userEvent.click(moreButton(2))
    expect(within(menu()).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('chosen mode shows only the tags picked in settings', () => {
    mount({ tags: seven }, { homeTagsMode: 'chosen', homeTagsChosen: ['art', 'shop'] })
    expect(chip('art')).toBeInTheDocument()
    expect(chip('shop')).toBeInTheDocument()
    // The most-used tag gets no chip unless it was picked
    expect(queryChip('dev')).not.toBeInTheDocument()
    expect(moreButton(5)).toBeInTheDocument()
  })

  it('the chip budget follows the homeTagsMax setting', () => {
    mount({ tags: seven }, { homeTagsMax: 2 })
    expect(chip('dev')).toBeInTheDocument()
    expect(chip('work')).toBeInTheDocument()
    expect(queryChip('music')).not.toBeInTheDocument()
    expect(moreButton(5)).toBeInTheDocument()
  })

  it('settings the bar cannot make sense of fall back to the defaults', () => {
    mount({ tags: seven }, { homeTagsMode: 'bogus', homeTagsMax: 'lots' })
    for (const tag of ['dev', 'work', 'music', 'news', 'games']) expect(chip(tag)).toBeInTheDocument()
    expect(moreButton(2)).toBeInTheDocument()
  })

  it('the chip budget is clamped to the allowed range', () => {
    // 0 sits below the floor of one chip, so exactly one survives
    mount({ tags: seven }, { homeTagsMax: 0 })
    expect(chip('dev')).toBeInTheDocument()
    expect(queryChip('work')).not.toBeInTheDocument()
    expect(moreButton(6)).toBeInTheDocument()
  })

  it('Escape closes the menu and hands focus back to the More chip', async () => {
    mount({ tags: greek })
    await userEvent.click(moreButton(9))
    // The search box took focus, so getting it back is a real hand-off
    expect(screen.getByRole('textbox', { name: 'Find a tag' })).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(queryMenu()).not.toBeInTheDocument()
    expect(moreButton(9)).toHaveFocus()
  })

  it('pressing outside closes the menu; pressing inside it does not', async () => {
    mount({ tags: seven })
    await userEvent.click(moreButton(2))

    fireEvent.pointerDown(menu())
    expect(menu()).toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    expect(queryMenu()).not.toBeInTheDocument()
  })

  it('clicking the More chip again closes the menu', async () => {
    mount({ tags: seven })
    await userEvent.click(moreButton(2))
    expect(menu()).toBeInTheDocument()
    await userEvent.click(moreButton(2))
    expect(queryMenu()).not.toBeInTheDocument()
  })

  it('with many folded tags the menu offers a search box that narrows the list', async () => {
    mount({ tags: greek })
    await userEvent.click(moreButton(9))
    expect(menuItems()).toHaveLength(9)

    const search = screen.getByRole('textbox', { name: 'Find a tag' })
    // Matching is a case-insensitive substring, so "TA" finds eta, iota, theta and zeta
    await userEvent.type(search, 'TA')
    expect(menuItems()).toEqual(['eta', 'iota', 'theta', 'zeta'])

    // Stray spaces around the query are ignored
    await userEvent.clear(search)
    await userEvent.type(search, '  kap ')
    expect(menuItems()).toEqual(['kappa'])

    await userEvent.clear(search)
    await userEvent.type(search, 'zzz')
    expect(within(menu()).queryAllByRole('menuitemradio')).toHaveLength(0)
    expect(within(menu()).getByText('No tags match')).toBeInTheDocument()
  })

  it('closing the menu forgets the search, so it reopens showing every folded tag', async () => {
    mount({ tags: greek })
    await userEvent.click(moreButton(9))
    await userEvent.type(screen.getByRole('textbox', { name: 'Find a tag' }), 'kap')
    expect(menuItems()).toEqual(['kappa'])

    fireEvent.keyDown(document, { key: 'Escape' })
    await userEvent.click(moreButton(9))
    expect(screen.getByRole('textbox', { name: 'Find a tag' })).toHaveValue('')
    expect(menuItems()).toHaveLength(9)
  })

  it('the menu closes on its own when the last folded tag becomes a chip', () => {
    // Six tags: five chips, art alone folds
    const six = seven.slice(0, 6)
    const { rerender } = mount({ tags: six })
    fireEvent.click(moreButton(1))
    expect(menu()).toBeInTheDocument()

    // Filtering by art promotes it to a chip, leaving nothing to fold
    rerender({ activeTag: 'art' })
    expect(queryMenu()).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /more$/ })).not.toBeInTheDocument()

    // ...and when a tag folds again the menu stays closed until asked for
    rerender({ activeTag: null })
    expect(moreButton(1)).toHaveAttribute('aria-expanded', 'false')
    expect(queryMenu()).not.toBeInTheDocument()
  })

  it('the menu hangs to the left when the chip sits near the right edge of the viewport', async () => {
    mount({ tags: seven })
    // 280px of menu would not fit between a chip at x=900 and a 1024px viewport
    moreButton(2).parentElement.getBoundingClientRect = () => ({
      left: 900, right: 960, top: 40, bottom: 64, width: 60, height: 24, x: 900, y: 40, toJSON() {},
    })
    await userEvent.click(moreButton(2))
    expect(menu()).toHaveClass('tag-filter-menu--right')
  })
})
