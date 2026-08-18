import React, { useState, useCallback } from 'react'
import { getInitialLetter, getColorForName } from '../../utils/favicon.js'
import { useIconSource } from '../../hooks/useIconSource.js'
import './FolderIcon.css'

function PreviewCell({ bookmark }) {
  const { src: iconSrc, onError: onIconError, emoji } = useIconSource(bookmark)
  const bg = getColorForName(bookmark.name)
  const letter = getInitialLetter(bookmark.name)

  if (emoji) {
    return (
      <div className="folder-preview-cell folder-preview-cell--emoji" role="img" aria-label={bookmark.name}>
        {emoji}
      </div>
    )
  }

  if (!iconSrc) {
    return (
      <div className="folder-preview-cell">
        <div className="folder-preview-letter" style={{ background: bg }}>
          {letter}
        </div>
      </div>
    )
  }

  return (
    <div className="folder-preview-cell" style={{ background: bg }}>
      <img src={iconSrc} alt="" onError={onIconError} />
    </div>
  )
}

export default function FolderIcon({ item, editMode, onDelete, onRename, onClick }) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(item.name)

  const previewItems = item.items.slice(0, 4)

  const handleClick = useCallback((e) => {
    if (editMode) return
    if (onClick) onClick(item)
  }, [editMode, item, onClick])

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
      className={`folder-icon${editMode ? ' edit-mode' : ''}`}
      onClick={handleClick}
      title={item.name}
    >
      <div className="folder-icon-preview">
        {editMode && (
          <button
            className="folder-icon-delete"
            onClick={handleDeleteClick}
            aria-label={`Delete folder ${item.name}`}
          >
            &times;
          </button>
        )}
        {Array.from({ length: 4 }).map((_, idx) => {
          const bm = previewItems[idx]
          if (!bm) return <div key={idx} className="folder-preview-empty" />
          return <PreviewCell key={bm.id} bookmark={bm} />
        })}
      </div>

      {renaming ? (
        <input
          className="folder-icon-rename-input"
          value={renameValue}
          autoFocus
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleRenameBlur}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="folder-icon-label"
          onDoubleClick={handleLabelDoubleClick}
        >
          {item.name}
        </span>
      )}
    </div>
  )
}
