import React, { useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import StoreIcon from './StoreIcon.jsx'
import { hostOf } from '../../utils/store.js'

// A listing's page: modal on wide screens, bottom sheet on narrow ones
// (Store.css switches on width, so both shells share this one component).
// Portalled to <body>: the desktop store lives in a pane that slides in
// with a CSS transform, which would otherwise make `position: fixed`
// resolve against the pane instead of the viewport.
export default function StoreDetail({ app, installed, onClose, onInstall, onOpen }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleBackdrop = useCallback((e) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  return createPortal(
    <div className="store-detail-backdrop" onClick={handleBackdrop}>
      <div className="store-detail" role="dialog" aria-modal="true" aria-labelledby="store-detail-title">
        <button type="button" className="store-detail-close" onClick={onClose} aria-label="Close">&times;</button>

        <div className="store-detail-head">
          <StoreIcon app={app} size={72} />
          <div className="store-detail-headtext">
            <h2 id="store-detail-title" className="store-detail-name">{app.name}</h2>
            <div className="store-detail-meta">
              {app.category && <span>{app.category}</span>}
              {hostOf(app.url) && <span>{hostOf(app.url)}</span>}
            </div>
          </div>
        </div>

        <div className="store-detail-actions">
          {installed ? (
            <>
              <span className="store-detail-installed">✓ On your home screen</span>
              <button type="button" className="store-btn store-btn--open" onClick={() => onOpen(app.url)}>
                Open
              </button>
            </>
          ) : (
            <button type="button" className="store-btn store-btn--install store-btn--wide" onClick={() => onInstall(app)}>
              Install
            </button>
          )}
        </div>

        {app.tagline && <p className="store-detail-tagline">{app.tagline}</p>}
        {app.description && <p className="store-detail-description">{app.description}</p>}

        {app.tags?.length > 0 && (
          <div className="store-detail-tags" aria-label="Tags">
            {app.tags.map((tag) => <span key={tag} className="store-tag">{tag}</span>)}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
