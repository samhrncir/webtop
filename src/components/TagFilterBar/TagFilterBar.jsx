import React from 'react'
import './TagFilterBar.css'

// One tag at a time: picking a chip replaces the selection, picking the
// active chip (or "All") clears it. Renders nothing until something is
// tagged, so untagged users see no extra chrome.
export default function TagFilterBar({ tags, activeTag, onSelect }) {
  if (tags.length === 0) return null

  return (
    <div className="tag-filter-bar" role="group" aria-label="Filter by tag">
      <button
        className={`tag-filter-chip${activeTag === null ? ' active' : ''}`}
        onClick={() => onSelect(null)}
        aria-pressed={activeTag === null}
      >
        All
      </button>
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
