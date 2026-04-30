import React from 'react'
import './PageIndicator.css'

export default function PageIndicator({ pages, currentPage, onNavigate, onAddPage }) {
  return (
    <div className="page-indicator">
      {pages.map((page, idx) => (
        <button
          key={page.id}
          className={`page-dot${idx === currentPage ? ' active' : ''}`}
          onClick={() => onNavigate(idx)}
          aria-label={`Go to page ${idx + 1}`}
          title={`Page ${idx + 1}`}
        />
      ))}
      <button
        className="page-add-btn"
        onClick={onAddPage}
        aria-label="Add new page"
        title="Add new page"
      >
        +
      </button>
    </div>
  )
}
