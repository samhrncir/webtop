import React, { useState, useCallback } from 'react'
import { getInitialLetter, getColorForName } from '../../utils/favicon.js'
import { useIconSource } from '../../hooks/useIconSource.js'
import { resolveSubUrl } from '../../utils/url.js'
import './HiddenBookmarks.css'

function openUrl(item) {
  const defaultSub = item.subUrls?.find((s) => s.isDefault)
  const url = defaultSub ? resolveSubUrl(defaultSub.url, item.url) : item.url
  window.open(url, '_blank', 'noopener,noreferrer')
}

function RowIcon({ item }) {
  const { src: iconSrc, onError: onIconError, emoji } = useIconSource(item)
  if (emoji) {
    return (
      <div className="hidden-bm-icon hidden-bm-icon--emoji" role="img" aria-label={item.name}>
        {emoji}
      </div>
    )
  }
  if (!iconSrc) {
    return (
      <div className="hidden-bm-icon hidden-bm-icon--letter" style={{ background: getColorForName(item.name) }}>
        {getInitialLetter(item.name)}
      </div>
    )
  }
  return <img className="hidden-bm-icon" src={iconSrc} alt="" onError={onIconError} draggable={false} />
}

// Settings sub-page: everything the user has hidden from the homescreen, plus
// a picker to hide something else without leaving Settings.
export default function HiddenBookmarks({ hiddenBookmarks, visibleBookmarks, setHidden }) {
  const [pickId, setPickId] = useState('')

  const handleHidePick = useCallback(() => {
    if (!pickId) return
    setHidden(pickId, true)
    setPickId('')
  }, [pickId, setHidden])

  return (
    <>
      <section className="settings-section">
        <h2 className="settings-section-title">Hide a bookmark</h2>
        <div className="settings-card">
          <div className="hidden-bm-picker">
            <select
              className="hidden-bm-select"
              value={pickId}
              onChange={(e) => setPickId(e.target.value)}
              aria-label="Bookmark to hide"
            >
              <option value="">
                {visibleBookmarks.length ? 'Choose a bookmark…' : 'No visible bookmarks'}
              </option>
              {visibleBookmarks.map(({ item, pageIdx, inFolder }) => (
                <option key={item.id} value={item.id}>
                  {item.name} — Page {pageIdx + 1}{inFolder ? ` · ${inFolder}` : ''}
                </option>
              ))}
            </select>
            <button
              className="settings-action-btn"
              onClick={handleHidePick}
              disabled={!pickId}
            >
              Hide
            </button>
          </div>
          <p className="hidden-bm-hint">
            You can also hide a bookmark from its App Info panel. Hidden bookmarks leave the
            home screen, folders, search and taskbar but keep their settings; unhiding adds
            them to the next free spot.
          </p>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">
          Hidden ({hiddenBookmarks.length})
        </h2>
        <div className="settings-card">
          {hiddenBookmarks.length === 0 ? (
            <p className="hidden-bm-empty">Nothing hidden yet.</p>
          ) : (
            <ul className="hidden-bm-list">
              {hiddenBookmarks.map((item) => (
                <li key={item.id} className="hidden-bm-row">
                  <RowIcon item={item} />
                  <div className="hidden-bm-text">
                    <span className="hidden-bm-name">{item.name}</span>
                    <span className="hidden-bm-meta" title={item.url}>
                      {item.url}
                    </span>
                  </div>
                  <div className="hidden-bm-actions">
                    <button className="settings-action-btn" onClick={() => openUrl(item)}>
                      Open
                    </button>
                    <button
                      className="settings-action-btn hidden-bm-unhide"
                      onClick={() => setHidden(item.id, false)}
                    >
                      Unhide
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}
