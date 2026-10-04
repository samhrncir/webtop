import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HomescreenApp from './HomescreenApp.jsx'
import { ThemeProvider } from '../context/ThemeContext.jsx'
import { SettingsProvider } from '../context/SettingsContext.jsx'

// Desktop shell integration specs: the real useHomescreen hook against
// seeded storage, the Supabase stub answering like a dead network.

const NOW = new Date().toISOString()
const page = (id, position) => ({ id, position, deleted_at: null, updated_at: NOW })
const bm = (id, page_id, position, content = {}) => ({
  id, page_id, folder_id: null, type: 'bookmark', position,
  deleted_at: null, updated_at: NOW,
  content: { name: id, url: `https://${id}.test`, ...content },
})

const listing = {
  id: 'id-gh', slug: 'github', name: 'GitHub', url: 'https://github.com/',
  tagline: 'Code', description: 'Repos.', category: 'Developer', tags: ['dev'],
  icon_url: null, featured: false, rank: 1, published: true, install: { aliases: ['hub'] },
}

function mount(rows, catalog = [listing]) {
  localStorage.setItem('browserhome_rows', JSON.stringify(rows))
  localStorage.setItem('browserhome_dirty', JSON.stringify({ pages: [], items: [] }))
  localStorage.setItem('browserhome_settings', JSON.stringify({ timeFormat: '12' }))
  localStorage.setItem('browserhome_store', JSON.stringify(catalog))
  return render(
    <ThemeProvider>
      <SettingsProvider>
        <HomescreenApp />
      </SettingsProvider>
    </ThemeProvider>
  )
}

describe('the store on desktop', () => {
  it('opens from the toolbar, installs with the listing extras, and the grid shows the new app', async () => {
    mount({ pages: [page('p1', 'a')], items: [bm('alpha', 'p1', 'a')] })
    await userEvent.click(screen.getByRole('button', { name: '🛍️ Marketplace' }))
    expect(screen.getByRole('heading', { name: 'Marketplace' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add GitHub' }))
    expect(screen.getByRole('button', { name: 'Open GitHub' })).toBeInTheDocument()
    expect(document.querySelector('.app-notice')).toHaveTextContent('Added GitHub to your home screen')

    const stored = JSON.parse(localStorage.getItem('browserhome_rows'))
    const added = stored.items.find((i) => i.content.url === 'https://github.com/')
    expect(added.content).toMatchObject({ name: 'GitHub', tags: ['dev'], aliases: ['hub'] })

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    // The store pane stays mounted while it slides out; look at the grid
    expect(within(document.querySelector('.app-home')).getByText('GitHub')).toBeInTheDocument()
  })

  it('a site already on the home screen offers Open, which opens it in a new tab', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => null)
    mount({ pages: [page('p1', 'a')], items: [bm('gh', 'p1', 'a', { url: 'https://www.github.com/x' })] })
    await userEvent.click(screen.getByRole('button', { name: '🛍️ Marketplace' }))
    await userEvent.click(screen.getByRole('button', { name: 'Open GitHub' }))
    expect(window.open).toHaveBeenCalledWith('https://github.com/', '_blank', 'noopener,noreferrer')
  })

  it('the add dialog links to the store', async () => {
    mount({ pages: [page('p1', 'a')], items: [] })
    await userEvent.click(screen.getByRole('button', { name: 'Add bookmark or folder' }))
    await userEvent.click(screen.getByRole('button', { name: /pick a popular site/ }))
    expect(screen.getByRole('heading', { name: 'Marketplace' })).toBeInTheDocument()
    expect(screen.queryByText('Add New')).not.toBeInTheDocument()
  })

  it('Settings > Store lands on the store, and Back returns home', async () => {
    mount({ pages: [page('p1', 'a')], items: [] })
    await userEvent.click(screen.getByTitle('Settings'))
    await userEvent.click(screen.getByRole('button', { name: '🛍️ Browse ›' }))
    expect(screen.getByRole('heading', { name: 'Marketplace' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('button', { name: '🛍️ Marketplace' })).toBeInTheDocument()
  })
})
