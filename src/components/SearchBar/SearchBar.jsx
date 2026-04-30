import React, { useState, useRef } from 'react'
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

export default function SearchBar({ data, onNavigateToPage }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  const handleClear = () => {
    setQuery('')
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
    if (result.item.type === 'bookmark') {
      window.open(result.item.url, '_blank', 'noopener,noreferrer')
    }
    if (onNavigateToPage) {
      onNavigateToPage(result.pageIdx)
    }
    setQuery('')
  }

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
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="search-bar-clear" onClick={handleClear} aria-label="Clear search">
            &times;
          </button>
        )}
      </div>

      {showOverlay && (
        <div className="search-results-overlay">
          {allResults.length === 0 ? (
            <div className="search-no-results">No bookmarks found</div>
          ) : (
            allResults.map((result, idx) => (
              <div
                key={idx}
                className="search-result-item"
                onClick={() => handleResultClick(result)}
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
