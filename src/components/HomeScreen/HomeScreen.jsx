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
import AppInfoModal from '../AppInfoModal/AppInfoModal.jsx'
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
  updateBookmark,
  reorderItems,
  moveItem,
  addToFolder,
  removeFromFolder,
  ejectFromFolder,
  reorderFolderItems,
  addPage,
  onOpenSettings,
  folderToOpen,
  clearFolderToOpen,
}) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeFolder, setActiveFolder] = useState(null)
  const [activeDragId, setActiveDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [appInfoItem, setAppInfoItem] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)


  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const dragStartPageId = useRef(null)
  const pageNavTimerRef = useRef(null)

  const page = data.pages[currentPage]
  const items = page ? page.items : []
  const pageId = page ? page.id : null

  // Open folder triggered from search
  useEffect(() => {
    if (folderToOpen) {
      setActiveFolder(folderToOpen)
      clearFolderToOpen()
    }
  }, [folderToOpen, clearFolderToOpen])

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

  // Auto-scroll pages when dragging to the edge
  useEffect(() => {
    if (!activeDragId) return

    const handlePointerMove = (e) => {
      const vw = window.innerWidth
      const edgeZone = 64

      const inLeft = e.clientX < edgeZone && currentPage > 0
      const inRight = e.clientX > vw - edgeZone && currentPage < data.pages.length - 1

      if (inLeft || inRight) {
        if (!pageNavTimerRef.current) {
          pageNavTimerRef.current = setTimeout(() => {
            pageNavTimerRef.current = null
            if (inLeft) setCurrentPage((p) => Math.max(p - 1, 0))
            else setCurrentPage((p) => Math.min(p + 1, data.pages.length - 1))
          }, 700)
        }
      } else {
        if (pageNavTimerRef.current) {
          clearTimeout(pageNavTimerRef.current)
          pageNavTimerRef.current = null
        }
      }
    }

    document.addEventListener('pointermove', handlePointerMove)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      if (pageNavTimerRef.current) {
        clearTimeout(pageNavTimerRef.current)
        pageNavTimerRef.current = null
      }
    }
  }, [activeDragId, currentPage, data.pages.length, setCurrentPage])

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
    dragStartPageId.current = pageId
  }, [pageId])

  const handleDragOver = useCallback(({ over }) => {
    setOverId(over ? over.id : null)
  }, [])

  const handleDragEnd = useCallback(({ active, over }) => {
    if (pageNavTimerRef.current) {
      clearTimeout(pageNavTimerRef.current)
      pageNavTimerRef.current = null
    }

    const fromPageId = dragStartPageId.current
    dragStartPageId.current = null
    setActiveDragId(null)
    setOverId(null)

    // Cross-page drop: move the item to the current page
    if (fromPageId && pageId && fromPageId !== pageId) {
      const currentItems = page ? page.items : []
      const overIdx = over ? currentItems.findIndex((i) => i.id === over.id) : -1
      moveItem(active.id, fromPageId, pageId, overIdx === -1 ? currentItems.length : overIdx)
      return
    }

    if (!over || active.id === over.id) return

    const overItem = items.find((i) => i.id === over.id)
    if (overItem && overItem.type === 'folder') {
      const draggedItem = items.find((i) => i.id === active.id)
      if (draggedItem && draggedItem.type === 'bookmark') {
        addToFolder(active.id, over.id, pageId)
        return
      }
    }

    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderItems(pageId, oldIndex, newIndex)
    }
  }, [items, page, pageId, moveItem, addToFolder, reorderItems])

  const handleDeleteItem = useCallback((itemId) => {
    const item = items.find((i) => i.id === itemId)
    if (item?.subUrls?.length > 0) {
      setConfirmDelete({ itemId, name: item.name, count: item.subUrls.length })
      return
    }
    deleteItem(itemId, pageId)
  }, [deleteItem, pageId, items])

  const handleConfirmDelete = useCallback(() => {
    if (confirmDelete) deleteItem(confirmDelete.itemId, pageId)
    setConfirmDelete(null)
  }, [confirmDelete, deleteItem, pageId])

  const handleOpenAppInfo = useCallback((item) => {
    setAppInfoItem(item)
  }, [])

  const handleSaveAppInfo = useCallback((updates) => {
    if (appInfoItem) updateBookmark(appInfoItem.id, pageId, updates)
  }, [appInfoItem, updateBookmark, pageId])

  const handleDeleteAppInfo = useCallback(() => {
    if (appInfoItem) deleteItem(appInfoItem.id, pageId)
  }, [appInfoItem, deleteItem, pageId])

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


      {/* Grid */}
      <div className={`homescreen-grid-area${activeDragId ? ' is-dragging' : ''}`}>
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
                        onInfoOpen={() => handleOpenAppInfo(item)}
                      />
                    ) : (
                      <FolderIcon
                        item={item}
                        editMode={editMode}
                        onDelete={handleDeleteItem}
                        onRename={handleRenameItem}
                        onClick={handleOpenFolder}
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

      {/* App info modal */}
      {appInfoItem && (
        <AppInfoModal
          item={appInfoItem}
          onClose={() => setAppInfoItem(null)}
          onSave={handleSaveAppInfo}
          onDelete={handleDeleteAppInfo}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="confirm-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-text">
              <strong>{confirmDelete.name}</strong> has {confirmDelete.count} sub page{confirmDelete.count !== 1 ? 's' : ''} that will also be deleted.
            </p>
            <div className="confirm-actions">
              <button className="confirm-cancel" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="confirm-delete" onClick={handleConfirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
