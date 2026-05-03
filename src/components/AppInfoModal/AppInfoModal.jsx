import React, { useState, useCallback, useEffect } from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getFaviconUrl, getInitialLetter, getColorForName } from '../../utils/favicon.js'
import { resolveSubUrl } from '../../utils/url.js'
import './AppInfoModal.css'

function SortableSubUrl({ sub, baseUrl, editMode, onSetDefault, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sub.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const resolvedUrl = resolveSubUrl(sub.url, baseUrl)

  return (
    <div ref={setNodeRef} style={style} className={`app-info-suburl-row${isDragging ? ' is-dragging' : ''}`}>
      {editMode && (
        <span className="app-info-suburl-drag" {...attributes} {...listeners}>⠿</span>
      )}
      <input
        type="radio"
        name="defaultSubUrl"
        checked={sub.isDefault}
        onChange={() => onSetDefault(sub.id)}
        onClick={() => { if (sub.isDefault) onSetDefault(null) }}
        className="app-info-suburl-radio"
        title="Set as default"
      />
      <a
        className="app-info-suburl-info"
        href={resolvedUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={resolvedUrl}
      >
        <span className="app-info-suburl-name">{sub.name}</span>
        <span className="app-info-suburl-url">{sub.url}</span>
      </a>
      {editMode && (
        <button
          className="app-info-suburl-delete"
          onClick={() => { if (window.confirm(`Delete "${sub.name}"?`)) onDelete(sub.id) }}
          aria-label="Delete sub page"
        >
          &times;
        </button>
      )}
    </div>
  )
}

export default function AppInfoModal({ item, onClose, onSave, onDelete }) {
  const [name, setName] = useState(item.name)
  const [url, setUrl] = useState(item.url)
  const [subUrls, setSubUrls] = useState(item.subUrls || [])
  const [editMode, setEditMode] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newSubName, setNewSubName] = useState('')
  const [newSubUrl, setNewSubUrl] = useState('')
  const [imgError, setImgError] = useState(false)

  const faviconUrl = getFaviconUrl(item.url)
  const letter = getInitialLetter(item.name)
  const bgColor = getColorForName(item.name)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  const handleEdit = useCallback(() => setEditMode(true), [])

  const handleCancel = useCallback(() => {
    setName(item.name)
    setUrl(item.url)
    setSubUrls(item.subUrls || [])
    setEditMode(false)
    setShowAddForm(false)
    setNewSubName('')
    setNewSubUrl('')
  }, [item])

  const handleSave = useCallback(() => {
    onSave({
      name: name.trim() || item.name,
      url: url.trim() || item.url,
      subUrls,
    })
    setEditMode(false)
    onClose()
  }, [name, url, subUrls, item, onSave, onClose])

  const handleDelete = useCallback(() => {
    if (window.confirm(`Delete "${item.name}"?`)) {
      onDelete()
      onClose()
    }
  }, [item.name, onDelete, onClose])

  const handleSetDefault = useCallback((subId) => {
    setSubUrls((prev) => prev.map((s) => ({ ...s, isDefault: subId !== null && s.id === subId })))
  }, [])

  const handleDeleteSub = useCallback((subId) => {
    setSubUrls((prev) => prev.filter((s) => s.id !== subId))
  }, [])

  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return
    setSubUrls((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id)
      const newIndex = prev.findIndex((s) => s.id === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }, [])

  const handleAddSub = useCallback(() => {
    const trimmedName = newSubName.trim()
    const trimmedUrl = newSubUrl.trim()
    if (!trimmedName || !trimmedUrl) return
    setSubUrls((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: trimmedName, url: trimmedUrl, isDefault: false },
    ])
    setNewSubName('')
    setNewSubUrl('')
    setShowAddForm(false)
  }, [newSubName, newSubUrl])

  const handleCancelAdd = useCallback(() => {
    setNewSubName('')
    setNewSubUrl('')
    setShowAddForm(false)
  }, [])

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  return (
    <div className="app-info-backdrop" onClick={handleBackdropClick}>
      <div className="app-info-modal">
        <div className="app-info-header">
          <span className="app-info-title">App Info</span>
          <div className="app-info-header-actions">
            {!editMode && (
              <button className="app-info-edit-btn" onClick={handleEdit}>Edit</button>
            )}
            <button className="app-info-close" onClick={onClose} aria-label="Close">&times;</button>
          </div>
        </div>

        <div className="app-info-identity">
          <div className="app-info-favicon-wrap">
            {!imgError && faviconUrl ? (
              <img
                src={faviconUrl}
                alt={item.name}
                onError={() => setImgError(true)}
                className="app-info-favicon"
                draggable={false}
              />
            ) : (
              <div className="app-info-favicon-letter" style={{ background: bgColor }}>{letter}</div>
            )}
          </div>
          <div className="app-info-fields">
            {editMode ? (
              <>
                <input
                  className="app-info-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="App name"
                  autoComplete="off"
                />
                <input
                  className="app-info-input app-info-input--url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  autoComplete="off"
                  spellCheck={false}
                />
              </>
            ) : (
              <>
                <span className="app-info-display-name">{name}</span>
                <a
                  className="app-info-display-url"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={url}
                >
                  {url}
                </a>
              </>
            )}
          </div>
        </div>

        <div className="app-info-suburl-section">
          <div className="app-info-suburl-header">
            <span className="app-info-suburl-title">Sub Pages</span>
            {editMode && (
              <button
                className="app-info-suburl-add-btn"
                onClick={() => setShowAddForm((v) => !v)}
                aria-label="Add sub page"
              >
                +
              </button>
            )}
          </div>

          {subUrls.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={subUrls.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="app-info-suburl-list">
                  {subUrls.map((sub) => (
                    <SortableSubUrl
                      key={sub.id}
                      sub={sub}
                      baseUrl={url}
                      editMode={editMode}
                      onSetDefault={handleSetDefault}
                      onDelete={handleDeleteSub}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            !showAddForm && (
              <p className="app-info-suburl-empty">
                {editMode ? 'No sub pages yet. Use + to add one.' : 'No sub pages.'}
              </p>
            )
          )}

          {editMode && showAddForm && (
            <div className="app-info-add-form">
              <input
                className="app-info-input"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                placeholder="Name"
                autoFocus
                autoComplete="off"
              />
              <input
                className="app-info-input"
                value={newSubUrl}
                onChange={(e) => setNewSubUrl(e.target.value)}
                placeholder="/path  or  https://..."
                autoComplete="off"
                spellCheck={false}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddSub() }}
              />
              <p className="app-info-url-hint">Use <code>/path</code> for relative or <code>https://...</code> for absolute URLs.</p>
              <div className="app-info-add-form-actions">
                <button className="app-info-add-cancel" onClick={handleCancelAdd}>Cancel</button>
                <button className="app-info-add-confirm" onClick={handleAddSub}>Add</button>
              </div>
            </div>
          )}
        </div>

        {editMode && (
          <div className="app-info-footer">
            <button className="app-info-delete-btn" onClick={handleDelete}>Delete</button>
            <div className="app-info-footer-actions">
              <button className="app-info-cancel-btn" onClick={handleCancel}>Cancel</button>
              <button className="app-info-save-btn" onClick={handleSave}>Save</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
