import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { FAVORITES_FILTER, pickHomeTags } from '../../utils/tags.js'
import { useSettings, normalizeHomeTagsMode, clampHomeTagsMax } from '../../context/SettingsContext.jsx'
import './TagFilterBar.css'

// The menu's CSS max-width and the viewport gutter it must keep clear of.
// Both are device px, like getBoundingClientRect, so no zoom math is needed
const MENU_MAX_WIDTH = 280
const VIEWPORT_GUTTER = 16
// Up to this many folded tags the menu is short enough to scan; past it, it
// grows a search box
const SEARCH_THRESHOLD = 8

// One filter at a time: picking a chip replaces the selection, picking the
// active chip (or "All") clears it. Favorites are a chip like any tag.
// Renders nothing until something is tagged or starred, so new users see
// no extra chrome. Only the tags picked in Settings (the most-used few, or
// a chosen set) get a chip of their own; the rest fold behind a "+N more"
// menu. The active tag is always a chip so the filter stays visible and
// clearable wherever it was picked from.
export default function TagFilterBar({ tags, activeTag, onSelect, favoritesCount = 0 }) {
  const { settings } = useSettings()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [alignRight, setAlignRight] = useState(false)
  const moreRef = useRef(null)
  const moreButtonRef = useRef(null)

  const { shown, overflow } = useMemo(
    () => pickHomeTags(tags, {
      mode: normalizeHomeTagsMode(settings.homeTagsMode),
      max: clampHomeTagsMax(settings.homeTagsMax),
      chosen: settings.homeTagsChosen,
      activeTag,
    }),
    [tags, activeTag, settings.homeTagsMode, settings.homeTagsMax, settings.homeTagsChosen]
  )

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  // A folded tag can be promoted to a chip (or removed altogether) while the
  // menu is open, so the menu must not outlive its contents
  useEffect(() => {
    if (overflow.length === 0) close()
  }, [overflow.length, close])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      close()
      // Keyboard users land back on the chip they opened the menu from
      moreButtonRef.current?.focus()
    }
    const onPointerDown = (e) => {
      // Closing on pointerdown would unmount the menu before its own click
      // landed, so a press inside it has to be left alone
      if (moreRef.current && !moreRef.current.contains(e.target)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, close])

  const toggleMenu = () => {
    if (open) {
      close()
      return
    }
    // Hang the menu to the left of the chip when it would otherwise run off
    // the right edge of the viewport
    const rect = moreRef.current?.getBoundingClientRect()
    setAlignRight(!!rect && rect.left + MENU_MAX_WIDTH > window.innerWidth - VIEWPORT_GUTTER)
    setOpen(true)
  }

  if (tags.length === 0 && favoritesCount === 0) return null

  const q = query.trim().toLowerCase()
  const visible = q ? overflow.filter(({ tag }) => tag.toLowerCase().includes(q)) : overflow

  return (
    <div className="tag-filter-bar" role="group" aria-label="Filter by tag">
      <div className="tag-filter-scroll">
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
        {shown.map(({ tag, count }) => (
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
      {overflow.length > 0 && (
        <div className="tag-filter-more" ref={moreRef}>
          <button
            ref={moreButtonRef}
            type="button"
            className={`tag-filter-chip tag-filter-chip--more${open ? ' active' : ''}`}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls="tag-filter-menu"
            onClick={toggleMenu}
          >
            +{overflow.length} more
          </button>
          {open && (
            <div
              id="tag-filter-menu"
              role="menu"
              aria-label="More tags"
              className={`tag-filter-menu${alignRight ? ' tag-filter-menu--right' : ''}`}
            >
              {overflow.length > SEARCH_THRESHOLD && (
                <input
                  className="tag-filter-menu-search"
                  type="text"
                  placeholder="Find a tag…"
                  aria-label="Find a tag"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              )}
              {visible.map(({ tag, count }) => (
                <button
                  key={tag}
                  type="button"
                  role="menuitemradio"
                  aria-checked={activeTag === tag}
                  className={`tag-filter-menu-item${activeTag === tag ? ' active' : ''}`}
                  onClick={() => {
                    onSelect(activeTag === tag ? null : tag)
                    close()
                  }}
                >
                  <span className="tag-filter-menu-item-name">{tag}</span>
                  <span className="tag-filter-count">{count}</span>
                </button>
              ))}
              {visible.length === 0 && <div className="tag-filter-menu-empty">No tags match</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
