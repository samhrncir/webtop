import React from 'react'
import './PageIndicator.css'

export default function PageIndicator({ pages, currentPage, onNavigate, onAddPage, onDeletePage, editMode }) {
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
      {editMode && pages.length > 1 && (
        <button
          className="page-delete-btn"
          onClick={() => onDeletePage(pages[currentPage].id)}
          aria-label="Delete current page"
          title="Delete current page"
        >
          −
        </button>
      )}
      {editMode && (
        <button
          className="page-add-btn"
          onClick={onAddPage}
          aria-label="Add new page"
          title="Add new page"
        >
          +
        </button>
      )}
    </div>
  )
}
