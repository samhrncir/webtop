import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StoreAdmin from './StoreAdmin.jsx'

const app = (slug, over = {}) => ({
  id: `id-${slug}`, slug, name: slug, url: `https://www.${slug}.com/`,
  tagline: '', description: '', category: 'Other', tags: [],
  icon_url: null, featured: false, rank: 0, published: true, install: {},
  ...over,
})

const catalog = [
  app('youtube', { name: 'YouTube', category: 'Video', featured: true, rank: 1, tags: ['video'] }),
  app('github', { name: 'GitHub', category: 'Developer', install: { aliases: ['hub'] } }),
  app('draft', { name: 'Draft', category: 'Developer', published: false }),
]

function mount(props = {}) {
  const handlers = {
    onSave: vi.fn(async (row) => ({ app: { ...row, id: row.id ?? 'id-new' }, error: null })),
    onDelete: vi.fn(async () => ({ error: null })),
    onBack: vi.fn(),
  }
  const all = { ...handlers, ...props }
  render(<StoreAdmin apps={catalog} {...all} />)
  return all
}

describe('managing listings', () => {
  it('lists every listing, drafts included, and filters by text', async () => {
    mount()
    expect(screen.getByText('3 listings, 1 unpublished')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter listings' }), 'git')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('GitHub')).toBeInTheDocument()
  })

  it('quick toggles save the whole row with the flag flipped', async () => {
    const h = mount()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Featured: GitHub' }))
    expect(h.onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'id-github', slug: 'github', featured: true, install: { aliases: ['hub'] } }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Published: YouTube' }))
    expect(h.onSave).toHaveBeenLastCalledWith(expect.objectContaining({ slug: 'youtube', published: false }))
  })

  it('shows what the server refused', async () => {
    const h = mount({ onSave: vi.fn(async () => ({ app: null, error: { message: 'row-level security' } })) })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Featured: GitHub' }))
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save GitHub: row-level security")
    expect(h.onSave).toHaveBeenCalled()
  })

  it('deleting asks first', async () => {
    const h = mount()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.click(screen.getByRole('button', { name: 'Delete GitHub' }))
    expect(h.onDelete).not.toHaveBeenCalled()
    window.confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Delete GitHub' }))
    expect(h.onDelete).toHaveBeenCalledWith('id-github')
  })

  it('goes back', async () => {
    const h = mount()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(h.onBack).toHaveBeenCalled()
  })
})

describe('adding a listing', () => {
  it('fills the name and slug from the URL, previews the card, and saves a normalized row', async () => {
    const h = mount()
    await userEvent.click(screen.getByRole('button', { name: '+ New listing' }))
    expect(screen.getByRole('heading', { name: 'New listing' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('URL'), 'https://news.ycombinator.com/')
    await userEvent.click(screen.getByRole('button', { name: 'Fill from URL' }))
    expect(screen.getByLabelText('Name')).toHaveValue('News')
    expect(screen.getByLabelText('Slug')).toHaveValue('news')
    await userEvent.clear(screen.getByLabelText('Name'))
    await userEvent.type(screen.getByLabelText('Name'), 'Hacker News')
    await userEvent.type(screen.getByLabelText('Tagline'), 'Tech news')
    await userEvent.clear(screen.getByLabelText('Category'))
    await userEvent.type(screen.getByLabelText('Category'), 'News')
    await userEvent.type(screen.getByLabelText('Tags'), 'News, tech')
    await userEvent.type(screen.getByLabelText('Rank'), '3')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Featured' }))

    const preview = screen.getByRole('complementary', { name: 'Preview' })
    expect(within(preview).getByText('Hacker News')).toBeInTheDocument()
    expect(within(preview).getByText('Tech news')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add listing' }))
    expect(h.onSave).toHaveBeenCalledWith({
      slug: 'news', name: 'Hacker News', url: 'https://news.ycombinator.com/', tagline: 'Tech news',
      description: '', category: 'News', tags: ['news', 'tech'], icon_url: null,
      featured: true, rank: 3, published: true, install: {},
    })
    // Back on the list once saved
    expect(screen.getByRole('heading', { name: 'Manage marketplace' })).toBeInTheDocument()
  })

  it('refuses an unusable draft and a slug already in use', async () => {
    const h = mount()
    await userEvent.click(screen.getByRole('button', { name: '+ New listing' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add listing' }))
    expect(screen.getByText('Give the listing a name')).toBeInTheDocument()
    expect(screen.getByText('Enter a full http(s) URL')).toBeInTheDocument()
    expect(h.onSave).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Name'), 'GitHub')
    await userEvent.type(screen.getByLabelText('URL'), 'https://github.com/')
    await userEvent.type(screen.getByLabelText('Extra bookmark fields (JSON)'), '{{oops')
    await userEvent.click(screen.getByRole('button', { name: 'Add listing' }))
    expect(screen.getByText('Another listing already uses this slug')).toBeInTheDocument()
    expect(screen.getByText('Extra fields must be a JSON object')).toBeInTheDocument()
    expect(h.onSave).not.toHaveBeenCalled()
  })
})

describe('editing a listing', () => {
  it('prefills the form, keeps the id, and stays open when the server refuses', async () => {
    const onSave = vi.fn(async () => ({ app: null, error: { message: 'nope' } }))
    mount({ onSave })
    await userEvent.click(screen.getByRole('button', { name: 'Edit GitHub' }))
    expect(screen.getByRole('heading', { name: 'Edit GitHub' })).toBeInTheDocument()
    expect(screen.getByLabelText('URL')).toHaveValue('https://www.github.com/')
    expect(screen.getByLabelText('Extra bookmark fields (JSON)')).toHaveValue(JSON.stringify({ aliases: ['hub'] }, null, 2))
    await userEvent.type(screen.getByLabelText('Tagline'), 'Code')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'id-github', slug: 'github', tagline: 'Code', install: { aliases: ['hub'] } }))
    expect(screen.getByRole('alert')).toHaveTextContent('nope')
    expect(screen.getByRole('heading', { name: 'Edit GitHub' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { name: 'Manage marketplace' })).toBeInTheDocument()
  })
})
