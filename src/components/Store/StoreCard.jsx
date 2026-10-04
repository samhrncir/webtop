import React from 'react'
import StoreIcon from './StoreIcon.jsx'

// One listing in a row or grid. The card opens the detail view; the button
// adds the site, or opens it once it is on the home screen (the Play Store pattern).
export default function StoreCard({ app, installed, onSelect, onInstall, onOpen }) {
  return (
    <div className="store-card" role="listitem">
      <button
        type="button"
        className="store-card-main"
        onClick={() => onSelect(app)}
        aria-label={`${app.name}: details`}
      >
        <StoreIcon app={app} />
        <span className="store-card-name">{app.name}</span>
        {app.tagline && <span className="store-card-tagline">{app.tagline}</span>}
      </button>
      {installed ? (
        <button
          type="button"
          className="store-btn store-btn--open"
          onClick={() => onOpen(app.url)}
          aria-label={`Open ${app.name}`}
        >
          Open
        </button>
      ) : (
        <button
          type="button"
          className="store-btn store-btn--install"
          onClick={() => onInstall(app)}
          aria-label={`Add ${app.name}`}
        >
          Add
        </button>
      )}
    </div>
  )
}
