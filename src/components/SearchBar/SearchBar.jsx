import React, { useState, useRef, useEffect } from 'react'
import { getInitialLetter, getColorForName } from '../../utils/favicon.js'
import { useIconSource } from '../../hooks/useIconSource.js'
import { matchAlias } from '../../utils/aliases.js'
import { flattenBookmarks, getTags, hasTag, itemMatchesQuery } from '../../utils/tags.js'
import './SearchBar.css'

function ResultIcon({ item }) {
  const { src: iconSrc, onError: onIconError, emoji } = useIconSource(item)
  const bg = getColorForName(item.name)
  const letter = getInitialLetter(item.name)

  if (item.type === 'folder' || !iconSrc) {
    return (
      <div className="search-result-icon" style={{ background: bg }}>
        {item.type === 'folder' ? '📁' : letter}
      </div>
    )
  }

  if (emoji) {
    return (
      <div className="search-result-icon search-result-icon--emoji" role="img" aria-label={item.name}>
        {emoji}
      </div>
    )
  }

  return (
    <div className="search-result-icon" style={{ background: bg }}>
      <img src={iconSrc} alt="" onError={onIconError} />
    </div>
  )
}

export default function SearchBar({ data, onNavigateToPage, onOpenFolder, activeTag = null }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const itemRefs = useRef([])

  const handleClear = () => {
    setQuery('')
    setActiveIndex(0)
    inputRef.current?.focus()
  }

  // Gather all searchable items across all pages. Bookmarks match on name,
  // url, alias or tag; folders on name only. A tag filter narrows results to
  // that tag, which means folders drop out entirely — they can't be tagged.
  const allResults = React.useMemo(() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()

    return flattenBookmarks(data, { includeFolders: !activeTag })
      .map((entry) => ({
        ...entry,
        // Only surface the alias when the name doesn't already explain the hit
        matchedAlias: entry.item.name?.toLowerCase().includes(q)
          ? null
          : matchAlias(entry.item, q),
      }))
      .filter(({ item, matchedAlias }) => itemMatchesQuery(item, q) || matchedAlias)
      .filter(({ item }) => !activeTag || hasTag(item, activeTag))
  }, [query, data, activeTag])

  const handleResultClick = (result) => {
    if (result.item.type === 'folder') {
      onNavigateToPage?.(result.pageIdx)
      onOpenFolder?.(result.item, result.pageIdx)
    } else {
      window.open(result.item.url, '_blank', 'noopener,noreferrer')
      onNavigateToPage?.(result.pageIdx)
    }
    setQuery('')
    setActiveIndex(0)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleClear()
      return
    }
    if (e.key === 'Enter') {
      const result = allResults[activeIndex]
      if (result) handleResultClick(result)
      return
    }
    if (allResults.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % allResults.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + allResults.length) % allResults.length)
    }
  }

  // Keep the active row visible inside the scrolling overlay
  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const showOverlay = query.trim().length > 0

  return (
    <div className="search-bar-wrapper">
      <div className="search-bar-input-row">
        <span className="search-bar-icon">&#128269;</span>
        <input
          ref={inputRef}
          className="search-bar-input"
          type="text"
          placeholder={activeTag ? `Search #${activeTag}...` : 'Search bookmarks...'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={showOverlay}
          aria-controls="search-results-listbox"
          aria-activedescendant={
            showOverlay && allResults[activeIndex] ? `search-result-${activeIndex}` : undefined
          }
        />
        {query && (
          <button className="search-bar-clear" onClick={handleClear} aria-label="Clear search">
            &times;
          </button>
        )}
      </div>

      {showOverlay && (
        <div className="search-results-overlay" id="search-results-listbox" role="listbox">
          {allResults.length === 0 ? (
            <div className="search-no-results">
              {activeTag ? `No bookmarks tagged “${activeTag}” found` : 'No bookmarks found'}
            </div>
          ) : (
            allResults.map((result, idx) => (
              <div
                key={idx}
                id={`search-result-${idx}`}
                ref={(el) => (itemRefs.current[idx] = el)}
                className={`search-result-item${idx === activeIndex ? ' is-active' : ''}`}
                role="option"
                aria-selected={idx === activeIndex}
                onClick={() => handleResultClick(result)}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <ResultIcon item={result.item} />
                <div className="search-result-info">
                  <span className="search-result-name">{result.item.name}</span>
                  {result.item.type === 'bookmark' && (
                    <span className="search-result-url">{result.item.url}</span>
                  )}
                  {result.matchedAlias && (
                    <span className="search-result-alias">alias: {result.matchedAlias}</span>
                  )}
                  {result.inFolder && (
                    <span className="search-result-url">in {result.inFolder}</span>
                  )}
                  {getTags(result.item).length > 0 && (
                    <span className="search-result-tags">
                      {getTags(result.item).map((tag) => (
                        <span key={tag} className="search-result-tag">{tag}</span>
                      ))}
                    </span>
                  )}
                </div>
                <span className="search-result-page-badge">
                  p{result.pageIdx + 1}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
