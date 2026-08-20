import React from 'react'
import { FAVORITES_FILTER } from '../../utils/tags.js'
import './TagFilterBar.css'

// One filter at a time: picking a chip replaces the selection, picking the
// active chip (or "All") clears it. Favorites are a chip like any tag.
// Renders nothing until something is tagged or starred, so new users see
// no extra chrome.
export default function TagFilterBar({ tags, activeTag, onSelect, favoritesCount = 0 }) {
  if (tags.length === 0 && favoritesCount === 0) return null

  return (
    <div className="tag-filter-bar" role="group" aria-label="Filter by tag">
      <button
        className={`tag-filter-chip${activeTag === null ? ' active' : ''}`}
        onClick={() => onSelect(null)}
        aria-pressed={activeTag === null}
      >
        All
      </button>
      {favoritesCount > 0 && (
        <button
          className={`tag-filter-chip tag-filter-chip--favorites${activeTag === FAVORITES_FILTER ? ' active' : ''}`}
          onClick={() => onSelect(activeTag === FAVORITES_FILTER ? null : FAVORITES_FILTER)}
          aria-pressed={activeTag === FAVORITES_FILTER}
          title={`${favoritesCount} favorite${favoritesCount === 1 ? '' : 's'}`}
        >
          ★
          <span className="tag-filter-count">{favoritesCount}</span>
        </button>
      )}
      {tags.map(({ tag, count }) => (
        <button
          key={tag}
          className={`tag-filter-chip${activeTag === tag ? ' active' : ''}`}
          onClick={() => onSelect(activeTag === tag ? null : tag)}
          aria-pressed={activeTag === tag}
          title={`${count} app${count === 1 ? '' : 's'} tagged ${tag}`}
        >
          {tag}
          <span className="tag-filter-count">{count}</span>
        </button>
      ))}
    </div>
  )
}
