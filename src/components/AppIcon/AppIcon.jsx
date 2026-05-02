import React, { useState, useCallback, useRef, useEffect } from 'react'
import { getFaviconUrl, getInitialLetter, getColorForName } from '../../utils/favicon.js'
import { resolveSubUrl } from '../../utils/url.js'
import './AppIcon.css'

export default function AppIcon({ item, editMode, onDelete, onRename, onOpen, onInfoOpen }) {
  const [imgError, setImgError] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(item.name)
  const clickTimer = useRef(null)

  const faviconUrl = getFaviconUrl(item.url)
  const letter = getInitialLetter(item.name)
  const bgColor = getColorForName(item.name)
  const hasSubUrls = item.subUrls?.length > 0

  useEffect(() => {
    return () => { if (clickTimer.current) clearTimeout(clickTimer.current) }
  }, [])

  const handleClick = useCallback(() => {
    if (editMode) return
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      return
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      const defaultSub = item.subUrls?.find((s) => s.isDefault)
      const url = defaultSub ? resolveSubUrl(defaultSub.url, item.url) : item.url
      if (onOpen) onOpen(url)
    }, 220)
  }, [editMode, item, onOpen])

  const handleDoubleClick = useCallback(() => {
    if (editMode) return
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    if (onInfoOpen) onInfoOpen()
  }, [editMode, onInfoOpen])

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
      onDoubleClick={handleDoubleClick}
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
        {hasSubUrls && !editMode && (
          <button
            className="app-icon-suburl-badge"
            title="View sub pages"
            onClick={(e) => { e.stopPropagation(); if (onInfoOpen) onInfoOpen() }}
          >▾</button>
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
