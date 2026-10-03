import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StoreScreen from './StoreScreen.jsx'

const app = (slug, over = {}) => ({
  id: `id-${slug}`, slug, name: slug, url: `https://www.${slug}.com/`,
  tagline: `${slug} tagline`, description: `All about ${slug}.`, category: 'Other',
  tags: [], icon_url: null, featured: false, rank: 0, published: true, install: {},
  ...over,
})

const catalog = [
  app('youtube', { name: 'YouTube', category: 'Video', featured: true, tags: ['video'] }),
  app('netflix', { name: 'Netflix', category: 'Video' }),
  app('github', { name: 'GitHub', category: 'Developer', tags: ['dev', 'code'] }),
  app('secret', { name: 'Secret', category: 'Developer', published: false }),
]

function mount(props = {}) {
  const handlers = {
    onInstall: vi.fn(), onOpen: vi.fn(), onBack: vi.fn(), onManage: vi.fn(),
  }
  render(
    <StoreScreen
      apps={catalog}
      installedHosts={new Set(['github.com'])}
      {...handlers}
      {...props}
    />
  )
  return handlers
}

describe('browsing the store', () => {
  it('shows a Featured row and one row per category, published listings only', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Featured' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Video ›' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Developer ›' })).toBeInTheDocument()
    expect(screen.queryByText('Secret')).not.toBeInTheDocument()
    // YouTube is featured and in Video, so it appears twice
    expect(screen.getAllByText('YouTube')).toHaveLength(2)
  })

  it('offers Install for new sites and Open for ones already on the home screen', async () => {
    const h = mount()
    await userEvent.click(screen.getByRole('button', { name: 'Install Netflix' }))
    expect(h.onInstall).toHaveBeenCalledWith(expect.objectContaining({ slug: 'netflix' }))
    await userEvent.click(screen.getByRole('button', { name: 'Open GitHub' }))
    expect(h.onOpen).toHaveBeenCalledWith('https://www.github.com/')
    expect(screen.queryByRole('button', { name: 'Install GitHub' })).not.toBeInTheDocument()
  })

  it('searching flattens the view into matches and says how many', async () => {
    mount()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the store' }), 'code')
    expect(screen.getByRole('heading', { name: '1 site' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Featured' })).not.toBeInTheDocument()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByRole('heading', { name: 'No matches' })).toBeInTheDocument()
  })

  it('a category chip filters to that category and toggles off again', async () => {
    mount()
    await userEvent.click(screen.getByRole('tab', { name: 'Video' }))
    expect(screen.getByRole('heading', { name: '2 sites' })).toBeInTheDocument()
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Video' }))
    expect(screen.getByRole('heading', { name: 'Featured' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Developer ›' }))
    expect(screen.getByRole('heading', { name: '1 site' })).toBeInTheDocument()
  })

  it('opens a listing page with the description and installs from there', async () => {
    const h = mount()
    await userEvent.click(screen.getByRole('button', { name: 'Netflix: details' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('All about netflix.')).toBeInTheDocument()
    expect(within(dialog).getByText('netflix.com')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Install' }))
    expect(h.onInstall).toHaveBeenCalledWith(expect.objectContaining({ slug: 'netflix' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('an installed listing page says so and offers Open', async () => {
    const h = mount()
    await userEvent.click(screen.getByRole('button', { name: 'GitHub: details' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('✓ On your home screen')).toBeInTheDocument()
    expect(within(dialog).getByText('dev')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Open' }))
    expect(h.onOpen).toHaveBeenCalledWith('https://www.github.com/')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('explains an empty store: loading, offline, or truly empty', () => {
    const { rerender } = render(<StoreScreen apps={[]} status="loading" installedHosts={new Set()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading the store')
    rerender(<StoreScreen apps={[]} status="offline" installedHosts={new Set()} />)
    expect(screen.getByRole('status')).toHaveTextContent(/reach the store/)
    rerender(<StoreScreen apps={[]} status="ready" installedHosts={new Set()} />)
    expect(screen.getByRole('status')).toHaveTextContent('The store is empty.')
  })

  it('shows Manage only to admins, and goes back', async () => {
    const h = mount()
    expect(screen.queryByRole('button', { name: 'Manage' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(h.onBack).toHaveBeenCalled()
  })

  it('admins get a Manage button', async () => {
    const h = mount({ isAdmin: true })
    await userEvent.click(screen.getByRole('button', { name: 'Manage' }))
    expect(h.onManage).toHaveBeenCalled()
  })
})
