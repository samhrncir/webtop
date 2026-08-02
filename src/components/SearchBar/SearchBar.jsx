import React, { useState, useRef, useEffect } from 'react'
import { getFaviconUrl, getInitialLetter, getColorForName } from '../../utils/favicon.js'
import './SearchBar.css'

function ResultIcon({ item }) {
  const [imgError, setImgError] = useState(false)
  const faviconUrl = item.type === 'bookmark' ? getFaviconUrl(item.url) : null
  const bg = getColorForName(item.name)
  const letter = getInitialLetter(item.name)

  if (item.type === 'folder' || !faviconUrl || imgError) {
    return (
      <div className="search-result-icon" style={{ background: bg }}>
        {item.type === 'folder' ? '📁' : letter}
      </div>
    )
  }

  return (
    <div className="search-result-icon" style={{ background: bg }}>
      <img src={faviconUrl} alt="" onError={() => setImgError(true)} />
    </div>
  )
}

export default function SearchBar({ data, onNavigateToPage, onOpenFolder }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const itemRefs = useRef([])

  const handleClear = () => {
    setQuery('')
    setActiveIndex(0)
    inputRef.current?.focus()
  }

  // Gather all searchable items across all pages
  const allResults = React.useMemo(() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()
    const results = []

    data.pages.forEach((page, pageIdx) => {
      page.items.forEach((item) => {
        const nameMatch = item.name.toLowerCase().includes(q)
        const urlMatch = item.type === 'bookmark' && item.url.toLowerCase().includes(q)
        if (nameMatch || urlMatch) {
          results.push({ item, pageIdx })
        }
        // Search inside folders too
        if (item.type === 'folder') {
          item.items.forEach((bm) => {
            const bmNameMatch = bm.name.toLowerCase().includes(q)
            const bmUrlMatch = bm.url.toLowerCase().includes(q)
            if (bmNameMatch || bmUrlMatch) {
              results.push({ item: bm, pageIdx, inFolder: item.name })
            }
          })
        }
      })
    })

    return results
  }, [query, data])

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
          placeholder="Search bookmarks..."
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
            <div className="search-no-results">No bookmarks found</div>
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
                  {result.inFolder && (
                    <span className="search-result-url">in {result.inFolder}</span>
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
