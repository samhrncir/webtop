import React, { useState, useRef, useCallback, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import Clock from '../Clock/Clock.jsx'
import AppIcon from '../AppIcon/AppIcon.jsx'
import FolderIcon from '../FolderIcon/FolderIcon.jsx'
import FolderOverlay from '../FolderOverlay/FolderOverlay.jsx'
import AddBookmarkModal from '../AddBookmarkModal/AddBookmarkModal.jsx'
import './HomeScreen.css'

// Sortable wrapper for each grid item
function SortableItem({ id, children, isOverFolder }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sortable-item${isDragging ? ' is-dragging' : ''}${isOverFolder ? ' folder-drop-target' : ''}`}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

export default function HomeScreen({
  data,
  currentPage,
  setCurrentPage,
  editMode,
  toggleEditMode,
  addBookmark,
  addFolder,
  deleteItem,
  renameItem,
  reorderItems,
  addToFolder,
  removeFromFolder,
  ejectFromFolder,
  reorderFolderItems,
  addPage,
  importData,
  exportData,
  onOpenSettings,
}) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeFolder, setActiveFolder] = useState(null)
  const [activeDragId, setActiveDragId] = useState(null)
  const [overId, setOverId] = useState(null)

  const fileInputRef = useRef(null)
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)

  const page = data.pages[currentPage]
  const items = page ? page.items : []
  const pageId = page ? page.id : null

  // Keep activeFolder in sync if folder data changes
  useEffect(() => {
    if (activeFolder) {
      const currentPageData = data.pages[currentPage]
      if (currentPageData) {
        const updatedFolder = currentPageData.items.find(
          (i) => i.id === activeFolder.id && i.type === 'folder'
        )
        if (updatedFolder) setActiveFolder(updatedFolder)
        else setActiveFolder(null)
      }
    }
  }, [data, currentPage, activeFolder])

  // Keyboard navigation for pages
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setCurrentPage((p) => Math.min(p + 1, data.pages.length - 1))
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setCurrentPage((p) => Math.max(p - 1, 0))
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [data.pages.length, setCurrentPage])

  // Touch swipe for page navigation
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchEnd = useCallback((e) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) setCurrentPage((p) => Math.min(p + 1, data.pages.length - 1))
      else setCurrentPage((p) => Math.max(p - 1, 0))
    }
    touchStartX.current = null
    touchStartY.current = null
  }, [data.pages.length, setCurrentPage])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  // Pointer-first collision: folder drops take priority over sort reordering
  const collisionDetection = useCallback((args) => {
    const pointerHits = pointerWithin(args)
    if (pointerHits.length > 0) return pointerHits
    return closestCenter(args)
  }, [])

  // When dragging over a folder, freeze the sort animation so the folder doesn't dodge
  const isOverFolder = Boolean(
    activeDragId && overId && overId !== activeDragId &&
    items.some((i) => i.id === overId && i.type === 'folder')
  )
  const sortStrategy = isOverFolder ? () => [] : rectSortingStrategy

  const handleDragStart = useCallback(({ active }) => {
    setActiveDragId(active.id)
  }, [])

  const handleDragOver = useCallback(({ over }) => {
    setOverId(over ? over.id : null)
  }, [])

  const handleDragEnd = useCallback(({ active, over }) => {
    setActiveDragId(null)
    setOverId(null)
    if (!over || active.id === over.id) return

    const overItem = items.find((i) => i.id === over.id)
    // If dropped onto a folder, add to folder
    if (overItem && overItem.type === 'folder') {
      const draggedItem = items.find((i) => i.id === active.id)
      if (draggedItem && draggedItem.type === 'bookmark') {
        addToFolder(active.id, over.id, pageId)
        return
      }
    }

    // Otherwise reorder
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderItems(pageId, oldIndex, newIndex)
    }
  }, [items, pageId, addToFolder, reorderItems])

  const handleDeleteItem = useCallback((itemId) => {
    deleteItem(itemId, pageId)
  }, [deleteItem, pageId])

  const handleRenameItem = useCallback((itemId, newName) => {
    renameItem(itemId, pageId, newName)
  }, [renameItem, pageId])

  const handleOpenFolder = useCallback((folder) => {
    setActiveFolder(folder)
  }, [])

  const handleDeleteFromFolder = useCallback((bookmarkId, folderId) => {
    removeFromFolder(bookmarkId, folderId, pageId)
  }, [removeFromFolder, pageId])

  const handleEjectFromFolder = useCallback((bookmarkId, folderId) => {
    ejectFromFolder(bookmarkId, folderId, pageId)
  }, [ejectFromFolder, pageId])

  const handleReorderFolderItems = useCallback((folderId, oldIndex, newIndex) => {
    reorderFolderItems(folderId, pageId, oldIndex, newIndex)
  }, [reorderFolderItems, pageId])

  const handleRenameFolder = useCallback((folderId, newName) => {
    renameItem(folderId, pageId, newName)
  }, [renameItem, pageId])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      await importData(file)
    } catch (err) {
      alert('Import failed: ' + err.message)
    }
    e.target.value = ''
  }, [importData])

  const activeDragItem = activeDragId ? items.find((i) => i.id === activeDragId) : null

  return (
    <div
      className="homescreen"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Toolbar */}
      <div className="homescreen-toolbar">
        <Clock />
        <div className="homescreen-toolbar-actions">
        <button
          className="homescreen-toolbar-btn"
          onClick={onOpenSettings}
          title="Settings"
        >
          ⚙️
        </button>
        <button
          className={`homescreen-toolbar-btn${editMode ? ' edit-active' : ''}`}
          onClick={toggleEditMode}
          title={editMode ? 'Done editing' : 'Edit mode'}
        >
          {editMode ? '✓ Done' : '✏️ Edit'}
        </button>
        </div>
      </div>

      {/* Edit mode bar (import/export) */}
      {editMode && (
        <div className="edit-mode-bar">
          <button className="edit-mode-bar-btn" onClick={handleImportClick} title="Import bookmarks">
            ⬆ Import
          </button>
          <button className="edit-mode-bar-btn" onClick={exportData} title="Export bookmarks">
            ⬇ Export
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden-file-input"
        onChange={handleFileChange}
      />

      {/* Grid */}
      <div className="homescreen-grid-area">
        {currentPage > 0 && (
          <div className="page-nav-zone page-nav-zone--left">
            <button
              className="page-nav-btn"
              onClick={() => setCurrentPage((p) => p - 1)}
              aria-label="Previous page"
            >
              ‹
            </button>
          </div>
        )}
        {currentPage < data.pages.length - 1 && (
          <div className="page-nav-zone page-nav-zone--right">
            <button
              className="page-nav-btn"
              onClick={() => setCurrentPage((p) => p + 1)}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        )}
        {items.length === 0 && (
          <div className="homescreen-empty-hint">
            <div style={{ fontSize: 48 }}>🔖</div>
            <p>No bookmarks yet</p>
            <p>Tap + to add your first bookmark</p>
          </div>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items.map((i) => i.id)} strategy={sortStrategy}>
            <div className="homescreen-grid">
              {items.map((item) => {
                const isOverFolder = overId === item.id && item.type === 'folder' && activeDragId !== item.id
                return (
                  <SortableItem key={item.id} id={item.id} isOverFolder={isOverFolder}>
                    {item.type === 'bookmark' ? (
                      <AppIcon
                        item={item}
                        editMode={editMode}
                        onDelete={handleDeleteItem}
                        onRename={handleRenameItem}
                        onOpen={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
                        onLongPress={toggleEditMode}
                      />
                    ) : (
                      <FolderIcon
                        item={item}
                        editMode={editMode}
                        onDelete={handleDeleteItem}
                        onRename={handleRenameItem}
                        onClick={handleOpenFolder}
                        onLongPress={toggleEditMode}
                      />
                    )}
                  </SortableItem>
                )
              })}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeDragItem ? (
              <div className="dnd-drag-overlay">
                {activeDragItem.type === 'bookmark' ? (
                  <AppIcon
                    item={activeDragItem}
                    editMode={false}
                    onDelete={() => {}}
                    onRename={() => {}}
                    onOpen={() => {}}
                  />
                ) : (
                  <FolderIcon
                    item={activeDragItem}
                    editMode={false}
                    onDelete={() => {}}
                    onRename={() => {}}
                    onClick={() => {}}
                  />
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* FAB */}
      <button
        className="homescreen-fab"
        onClick={() => setShowAddModal(true)}
        aria-label="Add bookmark or folder"
        title="Add bookmark or folder"
      >
        +
      </button>

      {/* Add bookmark modal */}
      {showAddModal && (
        <AddBookmarkModal
          onClose={() => setShowAddModal(false)}
          onAddBookmark={addBookmark}
          onAddFolder={addFolder}
        />
      )}

      {/* Folder overlay */}
      {activeFolder && (
        <FolderOverlay
          folder={activeFolder}
          editMode={editMode}
          onClose={() => setActiveFolder(null)}
          onOpenBookmark={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
          onDeleteFromFolder={handleDeleteFromFolder}
          onRenameFolder={handleRenameFolder}
          onEjectFromFolder={handleEjectFromFolder}
          onReorderFolderItems={handleReorderFolderItems}
        />
      )}
    </div>
  )
}
