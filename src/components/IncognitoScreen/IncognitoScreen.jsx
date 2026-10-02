import React, { useState, useCallback, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AppIcon from '../AppIcon/AppIcon.jsx'
import FolderIcon from '../FolderIcon/FolderIcon.jsx'
import FolderOverlay from '../FolderOverlay/FolderOverlay.jsx'
import AppInfoModal from '../AppInfoModal/AppInfoModal.jsx'
import { useSettings, clampGridColumns } from '../../context/SettingsContext.jsx'
import { useDndZoom } from '../../utils/dndZoom.js'
import { countBookmarks } from '../../utils/tags.js'
import './IncognitoScreen.css'

// The hidden bookmarks' own home screen: everything hidden from the main
// grid — bookmarks and folders — laid out as icons the user drags into an
// order or into folders, in the dark "incognito" dress so there is never any
// doubt which screen is showing. Both shells mount it full-screen in place
// of the home view. It owns its edit mode, the + menu (hide something, or
// make a folder), the folder overlay and the App Info panel.

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

function SortableTile({ id, touchUi, isOverFolder, onEditTap, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`incognito-tile${isDragging ? ' is-dragging' : ''}${isOverFolder ? ' folder-drop-target' : ''}`}
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

// A bookmark anywhere on the screen: top level or inside a folder
function findBookmark(items, id) {
  for (const item of items) {
    if (item.type === 'bookmark') {
      if (item.id === id) return item
    } else {
      const child = item.items.find((c) => c.id === id)
      if (child) return child
    }
  }
  return null
}

// The + menu: hide something from the main grid, or make a folder here
function AddMenu({ visibleItems, onHide, onAddFolder, onClose }) {
  const [tab, setTab] = useState('hide')
  const [pickId, setPickId] = useState('')
  const [folderName, setFolderName] = useState('')

  const submitFolder = (e) => {
    e.preventDefault()
    const name = folderName.trim()
    if (!name) return
    onAddFolder(name)
    onClose()
  }

  return (
    <div className="incognito-picker-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="incognito-picker" role="dialog" aria-label="Add to hidden bookmarks">
        <div className="incognito-picker-header">
          <span className="incognito-picker-title">{tab === 'hide' ? 'Hide a bookmark' : 'New folder'}</span>
          <button className="incognito-picker-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="incognito-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'hide'}
            className={`incognito-tab${tab === 'hide' ? ' active' : ''}`}
            onClick={() => setTab('hide')}
          >
            Hide existing
          </button>
          <button
            role="tab"
            aria-selected={tab === 'folder'}
            className={`incognito-tab${tab === 'folder' ? ' active' : ''}`}
            onClick={() => setTab('folder')}
          >
            New folder
          </button>
        </div>

        {tab === 'hide' ? (
          <>
            <select
              className="incognito-select"
              value={pickId}
              onChange={(e) => setPickId(e.target.value)}
              aria-label="Bookmark to hide"
            >
              <option value="">
                {visibleItems.length ? 'Choose a bookmark or folder…' : 'Nothing left to hide'}
              </option>
              {visibleItems.map(({ item, pageIdx, inFolder }) => (
                <option key={item.id} value={item.id}>
                  {item.type === 'folder' ? `📁 ${item.name} (${item.items.length})` : item.name}
                  {' — '}Page {pageIdx + 1}{inFolder ? ` · ${inFolder}` : ''}
                </option>
              ))}
            </select>
            <p className="incognito-picker-hint">
              Hidden bookmarks leave the home screen, folders, search and the taskbar but keep
              their settings. Hiding a folder brings its contents along. You can also hide a
              bookmark from its App Info panel.
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
          </>
        ) : (
          <form className="incognito-form" onSubmit={submitFolder}>
            <input
              className="incognito-input"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Folder name"
              aria-label="Folder name"
              autoFocus
              autoComplete="off"
            />
            <p className="incognito-picker-hint">
              Folders here only hold hidden bookmarks. Drag a bookmark onto the folder to file it.
            </p>
            <div className="incognito-picker-actions">
              <button type="button" className="incognito-btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="incognito-btn incognito-btn--primary" disabled={!folderName.trim()}>
                Create folder
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function IncognitoScreen({
  hiddenItems,
  visibleItems,
  setHidden,
  reorderHidden,
  addHiddenFolder,
  addToFolder,
  removeFromFolder,
  ejectFromFolder,
  reorderFolderItems,
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
  const [folderId, setFolderId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const [overId, setOverId] = useState(null)
  const { settings } = useSettings()
  const dndZoom = useDndZoom()

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  )

  // Read live so edits (rename, favorite, a bookmark filed into the folder)
  // show while a panel stays open; unhiding or deleting drops the item, and
  // the panel with it
  const infoItem = useMemo(
    () => (infoId ? findBookmark(hiddenItems, infoId) : null),
    [hiddenItems, infoId]
  )
  const openFolder = useMemo(
    () => (folderId ? hiddenItems.find((i) => i.id === folderId && i.type === 'folder') || null : null),
    [hiddenItems, folderId]
  )
  const draggingItem = draggingId ? hiddenItems.find((i) => i.id === draggingId) : null

  // Pointer-first collision so a drop onto a folder beats sort reordering
  const collisionDetection = useCallback((args) => {
    const hits = pointerWithin(args)
    return hits.length > 0 ? hits : closestCenter(args)
  }, [])

  // While hovering a folder, freeze the sort animation so it doesn't dodge
  const isOverFolder = Boolean(
    draggingId && overId && overId !== draggingId &&
    hiddenItems.some((i) => i.id === overId && i.type === 'folder')
  )
  const sortStrategy = isOverFolder ? () => [] : rectSortingStrategy

  const handleDragEnd = useCallback(({ active, over }) => {
    setDraggingId(null)
    setOverId(null)
    if (!over || active.id === over.id) return
    const dragged = hiddenItems.find((i) => i.id === active.id)
    const target = hiddenItems.find((i) => i.id === over.id)
    if (dragged?.type === 'bookmark' && target?.type === 'folder') {
      addToFolder(active.id, over.id, null)
      return
    }
    const oldIndex = hiddenItems.findIndex((i) => i.id === active.id)
    const newIndex = hiddenItems.findIndex((i) => i.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) reorderHidden(oldIndex, newIndex)
  }, [hiddenItems, addToFolder, reorderHidden])

  // Folders go to the Recycle Bin with their contents, like on the home
  // screen; a bookmark with sub pages asks first
  const handleDelete = useCallback((itemId) => {
    const item = hiddenItems.find((i) => i.id === itemId)
    if (!item) return
    const subs = item.subUrls?.length || 0
    if (subs > 0 && !window.confirm(`Delete "${item.name}" and its ${subs} sub page${subs === 1 ? '' : 's'}?`)) {
      return
    }
    deleteItem(itemId, null)
  }, [hiddenItems, deleteItem])

  const handleRename = useCallback((itemId, name) => renameItem(itemId, null, name), [renameItem])

  const handleHidePick = useCallback((itemId) => {
    if (itemId) setHidden(itemId, true)
    setShowAdd(false)
  }, [setHidden])

  const handleUnhide = useCallback(() => {
    if (!infoItem) return
    setHidden(infoItem.id, false)
    setInfoId(null)
  }, [infoItem, setHidden])

  const handleUnhideFolder = useCallback(() => {
    if (!openFolder) return
    setHidden(openFolder.id, false)
    setFolderId(null)
  }, [openFolder, setHidden])

  const handleEditTap = useCallback((item) => (e) => {
    if (!touchUi || !editMode) return
    // The App Info sheet is bookmark-shaped; folders keep their own controls
    // (rename via label, delete ×). The icon's own controls stop propagation
    // before this, so anything arriving here is a plain tap on the tile.
    if (item.type !== 'bookmark') return
    e.stopPropagation()
    e.preventDefault()
    setInfoId(item.id)
  }, [touchUi, editMode])

  const count = countBookmarks(hiddenItems)
  const gridStyle = { '--grid-max-cols': clampGridColumns(settings.gridMaxColumns) }
  const subheading = `${hiddenItems.length === 0 ? 'Nothing hidden' : `${count} hidden`} · off the home screen, folders, search and taskbar`

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
        {hiddenItems.length === 0 && (
          <div className="incognito-empty">
            <IncognitoIcon size={56} />
            <p>Nothing hidden yet</p>
            <p>Tap + to hide a bookmark or folder here, or use “Hide from home screen” in any bookmark’s App Info</p>
          </div>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={dndZoom.collision(collisionDetection)}
          modifiers={dndZoom.modifiers}
          measuring={dndZoom.measuring}
          onDragStart={({ active }) => setDraggingId(active.id)}
          onDragOver={({ over }) => setOverId(over ? over.id : null)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => { setDraggingId(null); setOverId(null) }}
        >
          <SortableContext items={hiddenItems.map((i) => i.id)} strategy={sortStrategy}>
            <div className="incognito-grid" style={gridStyle}>
              {hiddenItems.map((item) => (
                <SortableTile
                  key={item.id}
                  id={item.id}
                  touchUi={touchUi}
                  isOverFolder={isOverFolder && overId === item.id}
                  onEditTap={handleEditTap(item)}
                >
                  {item.type === 'folder' ? (
                    <FolderIcon
                      item={item}
                      editMode={editMode}
                      onClick={() => setFolderId(item.id)}
                      onDelete={handleDelete}
                      onRename={handleRename}
                    />
                  ) : (
                    <AppIcon
                      item={item}
                      editMode={editMode}
                      onDelete={handleDelete}
                      onRename={handleRename}
                      onOpen={openUrl}
                      onInfoOpen={() => setInfoId(item.id)}
                    />
                  )}
                </SortableTile>
              ))}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {draggingItem ? (
              <div className="incognito-drag-overlay">
                {draggingItem.type === 'folder' ? (
                  <FolderIcon item={draggingItem} editMode={false} onClick={() => {}} onDelete={() => {}} onRename={() => {}} />
                ) : (
                  <AppIcon item={draggingItem} editMode={false} onOpen={() => {}} onDelete={() => {}} onRename={() => {}} />
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <button
        className="incognito-fab"
        onClick={() => setShowAdd(true)}
        aria-label="Hide a bookmark or add a folder"
        title="Hide a bookmark or add a folder"
      >
        +
      </button>

      {showAdd && (
        <AddMenu
          visibleItems={visibleItems}
          onHide={handleHidePick}
          onAddFolder={addHiddenFolder}
          onClose={() => setShowAdd(false)}
        />
      )}

      {openFolder && (
        <FolderOverlay
          folder={openFolder}
          editMode={editMode}
          onClose={() => setFolderId(null)}
          onOpenBookmark={openUrl}
          onOpenAppInfo={(bookmark) => setInfoId(bookmark.id)}
          onDeleteFromFolder={(bookmarkId, fId) => removeFromFolder(bookmarkId, fId, null)}
          onRenameFolder={handleRename}
          onEjectFromFolder={(bookmarkId, fId) => ejectFromFolder(bookmarkId, fId, null)}
          onReorderFolderItems={(fId, oldIndex, newIndex) => reorderFolderItems(fId, null, oldIndex, newIndex)}
          onUnhide={handleUnhideFolder}
          appInfoOpen={!!infoItem}
        />
      )}

      {infoPanel && (infoHostClassName ? <div className={infoHostClassName}>{infoPanel}</div> : infoPanel)}
    </div>
  )
}
