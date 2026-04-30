import React, { useState, useRef, useCallback } from 'react'
import { getFaviconUrl, getInitialLetter, getColorForName } from '../../utils/favicon.js'
import './AppIcon.css'

export default function AppIcon({ item, editMode, onDelete, onRename, onOpen, onLongPress }) {
  const [imgError, setImgError] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(item.name)
  const longPressTimer = useRef(null)

  const faviconUrl = getFaviconUrl(item.url)
  const letter = getInitialLetter(item.name)
  const bgColor = getColorForName(item.name)

  const handleMouseDown = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      if (onLongPress) onLongPress()
    }, 500)
  }, [onLongPress])

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleClick = useCallback((e) => {
    if (editMode) return
    clearLongPress()
    if (onOpen) onOpen(item.url)
  }, [editMode, item.url, onOpen, clearLongPress])

  const handleDeleteClick = useCallback((e) => {
    e.stopPropagation()
    if (onDelete) onDelete(item.id)
  }, [item.id, onDelete])

  const handleLabelDoubleClick = useCallback((e) => {
    if (!editMode) return
    e.stopPropagation()
    setRenameValue(item.name)
    setRenaming(true)
  }, [editMode, item.name])

  const handleRenameKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      const trimmed = renameValue.trim()
      if (trimmed && onRename) onRename(item.id, trimmed)
      setRenaming(false)
    }
    if (e.key === 'Escape') {
      setRenaming(false)
    }
  }, [renameValue, item.id, onRename])

  const handleRenameBlur = useCallback(() => {
    const trimmed = renameValue.trim()
    if (trimmed && onRename) onRename(item.id, trimmed)
    setRenaming(false)
  }, [renameValue, item.id, onRename])

  return (
    <div
      className={`app-icon${editMode ? ' edit-mode' : ''}`}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={clearLongPress}
      onMouseLeave={clearLongPress}
      onTouchStart={handleMouseDown}
      onTouchEnd={clearLongPress}
      title={item.name}
    >
      <div className="app-icon-image-wrapper">
        {editMode && (
          <button
            className="app-icon-delete"
            onClick={handleDeleteClick}
            aria-label={`Delete ${item.name}`}
          >
            &times;
          </button>
        )}
        {!imgError && faviconUrl ? (
          <img
            className="app-icon-favicon"
            src={faviconUrl}
            alt={item.name}
            onError={() => setImgError(true)}
            draggable={false}
          />
        ) : (
          <div className="app-icon-letter" style={{ background: bgColor }}>
            {letter}
          </div>
        )}
      </div>

      {renaming ? (
        <input
          className="app-icon-rename-input"
          value={renameValue}
          autoFocus
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleRenameBlur}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="app-icon-label"
          onDoubleClick={handleLabelDoubleClick}
        >
          {item.name}
        </span>
      )}
    </div>
  )
}
