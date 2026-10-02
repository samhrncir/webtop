import React, { useState, useCallback, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AppIcon from '../AppIcon/AppIcon.jsx'
import AppInfoModal from '../AppInfoModal/AppInfoModal.jsx'
import { useSettings, clampGridColumns } from '../../context/SettingsContext.jsx'
import { useDndZoom } from '../../utils/dndZoom.js'
import './IncognitoScreen.css'

// The hidden bookmarks' own home screen: everything hidden from the main
// grid, laid out as icons the user drags into an order, in the dark
// "incognito" dress so there is never any doubt which screen is showing.
// Both shells mount it full-screen in place of the home view. It owns its
// edit mode, the hide picker behind the + button, and the App Info panel.

const openUrl = (url) => window.open(url, '_blank', 'noopener,noreferrer')

// Hat and glasses, the incognito mark
export function IncognitoIcon({ size = 28 }) {
  return (
    <svg className="incognito-mark" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M7 10.5 8.4 5.6c.2-.6.7-1 1.3-1.1a16 16 0 0 1 4.6 0c.6.1 1.1.5 1.3 1.1L17 10.5Z" />
      <path d="M2.5 12c0-.7.5-1.2 1.2-1.3 5.5-.9 11.1-.9 16.6 0 .7.1 1.2.6 1.2 1.3s-.5 1.2-1.2 1.3c-5.5.9-11.1.9-16.6 0-.7-.1-1.2-.6-1.2-1.3Z" />
      <path
        d="M8 15.2a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Zm8 0a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M10.6 17.2q1.4-1 2.8 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function SortableTile({ id, touchUi, onEditTap, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`incognito-tile${isDragging ? ' is-dragging' : ''}`}
      onClick={onEditTap}
      // Long-press is the drag handle on touch; keep the context menu off it
      onContextMenu={touchUi ? (e) => e.preventDefault() : undefined}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

// The + button's picker: hide something from the main grid without leaving
function HidePicker({ visibleBookmarks, onHide, onClose }) {
  const [pickId, setPickId] = useState('')
  return (
    <div className="incognito-picker-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="incognito-picker" role="dialog" aria-label="Hide a bookmark">
        <div className="incognito-picker-header">
          <span className="incognito-picker-title">Hide a bookmark</span>
          <button className="incognito-picker-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <select
          className="incognito-select"
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
        <p className="incognito-picker-hint">
          Hidden bookmarks leave the home screen, folders, search and the taskbar but keep
          their settings. You can also hide one from its App Info panel.
        </p>
        <div className="incognito-picker-actions">
          <button className="incognito-btn" onClick={onClose}>Cancel</button>
          <button
            className="incognito-btn incognito-btn--primary"
            onClick={() => onHide(pickId)}
            disabled={!pickId}
          >
            Hide
          </button>
        </div>
      </div>
    </div>
  )
}

export default function IncognitoScreen({
  hiddenBookmarks,
  visibleBookmarks,
  setHidden,
  reorderHidden,
  deleteItem,
  renameItem,
  updateBookmark,
  toggleFavorite,
  toggleAccount,
  tagSuggestions = [],
  onBack,
  // Touch shells: a tap on a tile in edit mode opens App Info (there is no
  // double-click), and App Info renders inside this host for sheet styling
  touchUi = false,
  infoHostClassName,
}) {
  const [editMode, setEditMode] = useState(false)
  const [infoId, setInfoId] = useState(null)
  const [showPicker, setShowPicker] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const { settings } = useSettings()
  const dndZoom = useDndZoom()

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  )

  // Read live so edits (rename, favorite) show while the panel stays open;
  // unhiding or deleting drops the item, and the panel with it
  const infoItem = useMemo(
    () => (infoId ? hiddenBookmarks.find((b) => b.id === infoId) || null : null),
    [hiddenBookmarks, infoId]
  )
  const draggingItem = draggingId ? hiddenBookmarks.find((b) => b.id === draggingId) : null

  const handleDragEnd = useCallback(({ active, over }) => {
    setDraggingId(null)
    if (!over || active.id === over.id) return
    const oldIndex = hiddenBookmarks.findIndex((b) => b.id === active.id)
    const newIndex = hiddenBookmarks.findIndex((b) => b.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) reorderHidden(oldIndex, newIndex)
  }, [hiddenBookmarks, reorderHidden])

  const handleDelete = useCallback((itemId) => {
    const item = hiddenBookmarks.find((b) => b.id === itemId)
    if (!item) return
    const subs = item.subUrls?.length || 0
    if (subs > 0 && !window.confirm(`Delete "${item.name}" and its ${subs} sub page${subs === 1 ? '' : 's'}?`)) {
      return
    }
    deleteItem(itemId, null)
  }, [hiddenBookmarks, deleteItem])

  const handleRename = useCallback((itemId, name) => renameItem(itemId, null, name), [renameItem])

  const handleHidePick = useCallback((itemId) => {
    if (itemId) setHidden(itemId, true)
    setShowPicker(false)
  }, [setHidden])

  const handleUnhide = useCallback(() => {
    if (!infoItem) return
    setHidden(infoItem.id, false)
    setInfoId(null)
  }, [infoItem, setHidden])

  const handleEditTap = useCallback((item) => (e) => {
    if (!touchUi || !editMode) return
    // The icon's own controls (delete ×, rename input) stop propagation
    // before this, so anything arriving here is a plain tap on the tile
    e.stopPropagation()
    e.preventDefault()
    setInfoId(item.id)
  }, [touchUi, editMode])

  const count = hiddenBookmarks.length
  const gridStyle = { '--grid-max-cols': clampGridColumns(settings.gridMaxColumns) }
  const subheading = `${count === 0 ? 'Nothing hidden' : `${count} hidden`} · off the home screen, folders, search and taskbar`

  const infoPanel = infoItem && (
    <AppInfoModal
      item={infoItem}
      onClose={() => setInfoId(null)}
      onSave={(updates) => updateBookmark(infoItem.id, null, updates)}
      onDelete={() => deleteItem(infoItem.id, null)}
      onToggleFavorite={() => toggleFavorite(infoItem.id)}
      onToggleAccount={() => toggleAccount(infoItem.id)}
      onUnhide={handleUnhide}
      tagSuggestions={tagSuggestions}
    />
  )

  return (
    <div className="incognito-screen" data-testid="incognito-screen">
      <div className="incognito-toolbar">
        <button className="incognito-back" onClick={onBack} title="Back" aria-label="Back to home screen">
          ‹
        </button>
        <div className="incognito-title">
          <IncognitoIcon />
          <div className="incognito-title-text">
            <h1 className="incognito-heading">Hidden bookmarks</h1>
            <span className="incognito-subheading">{subheading}</span>
          </div>
        </div>
        <button
          className={`incognito-btn${editMode ? ' edit-active' : ''}`}
          onClick={() => setEditMode((v) => !v)}
          title={editMode ? 'Done editing' : 'Edit mode'}
        >
          {editMode ? '✓ Done' : '✏️ Edit'}
        </button>
      </div>

      <div className={`incognito-grid-area${draggingId ? ' is-dragging' : ''}`}>
        {count === 0 && (
          <div className="incognito-empty">
            <IncognitoIcon size={56} />
            <p>Nothing hidden yet</p>
            <p>Tap + to hide a bookmark here, or use “Hide from home screen” in any bookmark’s App Info</p>
          </div>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={dndZoom.collision(closestCenter)}
          modifiers={dndZoom.modifiers}
          measuring={dndZoom.measuring}
          onDragStart={({ active }) => setDraggingId(active.id)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDraggingId(null)}
        >
          <SortableContext items={hiddenBookmarks.map((b) => b.id)} strategy={rectSortingStrategy}>
            <div className="incognito-grid" style={gridStyle}>
              {hiddenBookmarks.map((item) => (
                <SortableTile key={item.id} id={item.id} touchUi={touchUi} onEditTap={handleEditTap(item)}>
                  <AppIcon
                    item={item}
                    editMode={editMode}
                    onDelete={handleDelete}
                    onRename={handleRename}
                    onOpen={openUrl}
                    onInfoOpen={() => setInfoId(item.id)}
                  />
                </SortableTile>
              ))}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {draggingItem ? (
              <div className="incognito-drag-overlay">
                <AppIcon item={draggingItem} editMode={false} onOpen={() => {}} onDelete={() => {}} onRename={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <button
        className="incognito-fab"
        onClick={() => setShowPicker(true)}
        aria-label="Hide a bookmark"
        title="Hide a bookmark"
      >
        +
      </button>

      {showPicker && (
        <HidePicker
          visibleBookmarks={visibleBookmarks}
          onHide={handleHidePick}
          onClose={() => setShowPicker(false)}
        />
      )}

      {infoPanel && (infoHostClassName ? <div className={infoHostClassName}>{infoPanel}</div> : infoPanel)}
    </div>
  )
}
