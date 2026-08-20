import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TagFilterBar from './TagFilterBar.jsx'
import { FAVORITES_FILTER } from '../../utils/tags.js'

const tags = [{ tag: 'dev', count: 2 }]

describe('TagFilterBar favorites chip', () => {
  it('renders nothing when there are no tags and no favorites', () => {
    const { container } = render(<TagFilterBar tags={[]} favoritesCount={0} activeTag={null} onSelect={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the star chip (with count) once anything is favorited — even with no tags', () => {
    render(<TagFilterBar tags={[]} favoritesCount={3} activeTag={null} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: /★\s*3/ })).toBeInTheDocument()
  })

  it('clicking the star filters by favorites; clicking it again clears', async () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <TagFilterBar tags={tags} favoritesCount={1} activeTag={null} onSelect={onSelect} />
    )
    await userEvent.click(screen.getByRole('button', { name: /★/ }))
    expect(onSelect).toHaveBeenCalledWith(FAVORITES_FILTER)

    rerender(<TagFilterBar tags={tags} favoritesCount={1} activeTag={FAVORITES_FILTER} onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: /★/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /★/ }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('tag chips still work alongside the star', async () => {
    const onSelect = vi.fn()
    render(<TagFilterBar tags={tags} favoritesCount={1} activeTag={null} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /dev/ }))
    expect(onSelect).toHaveBeenCalledWith('dev')
  })
})
