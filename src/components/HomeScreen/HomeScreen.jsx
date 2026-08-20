import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
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
import TagFilterBar from '../TagFilterBar/TagFilterBar.jsx'
import { allTags, flattenBookmarks, compareByName, itemMatchesFilter, isFavorite, FAVORITES_FILTER } from '../../utils/tags.js'
import { useSettings, clampGridColumns } from '../../context/SettingsContext.jsx'
import { useDndZoom } from '../../utils/dndZoom.js'
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
  togglePin,
  toggleFavorite,
  setHidden,
  reorderItems,
  moveItem,
  addToFolder,
  removeFromFolder,
  ejectFromFolder,
  reorderFolderItems,
  addPage,
  onOpenSettings,
  aiChat,
  folderToOpen,
  clearFolderToOpen,
  activeTag,
  setActiveTag,
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

  // Tag filtering. While a tag is active the view flattens: every matching
  // app across all pages and out of its folder, alphabetical. Ordering is
  // derived, so drag-to-reorder and paging are switched off below.
  const tagList = useMemo(() => allTags(data), [data])
  const favoritesCount = useMemo(
    () => flattenBookmarks(data).filter(({ item }) => isFavorite(item)).length,
    [data]
  )
  const filtering = Boolean(activeTag)

  const filteredItems = useMemo(() => {
    if (!filtering) return []
    return flattenBookmarks(data)
      .filter(({ item }) => itemMatchesFilter(item, activeTag))
      .map(({ item }) => item)
      .sort(compareByName)
  }, [filtering, data, activeTag])

  const displayItems = filtering ? filteredItems : items

  // A tag can disappear (last app untagged or deleted) while it's selected
  useEffect(() => {
    if (!activeTag) return
    if (activeTag === FAVORITES_FILTER) {
      if (favoritesCount === 0) setActiveTag(null)
    } else if (!tagList.some((t) => t.tag === activeTag)) {
      setActiveTag(null)
    }
  }, [activeTag, tagList, favoritesCount, setActiveTag])

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

  // Keyboard navigation for pages (pages aren't an axis while filtering)
  useEffect(() => {
    if (filtering) return
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
  }, [filtering, data.pages.length, setCurrentPage])

  // Touch swipe for page navigation
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchEnd = useCallback((e) => {
    if (filtering) return
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) setCurrentPage((p) => Math.min(p + 1, data.pages.length - 1))
      else setCurrentPage((p) => Math.max(p - 1, 0))
    }
    touchStartX.current = null
    touchStartY.current = null
  }, [filtering, data.pages.length, setCurrentPage])

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
    const item = displayItems.find((i) => i.id === itemId)
    if (item?.subUrls?.length > 0) {
      setConfirmDelete({ itemId, name: item.name, count: item.subUrls.length })
      return
    }
    deleteItem(itemId, pageId)
  }, [deleteItem, pageId, displayItems])

  // Adding while filtered would otherwise drop the new app straight out of
  // the visible list, so it inherits the active tag
  const handleAddBookmark = useCallback((url, name) => {
    addBookmark(url, name, activeTag ? [activeTag] : [])
  }, [addBookmark, activeTag])

  const handleConfirmDelete = useCallback(() => {
    if (confirmDelete) deleteItem(confirmDelete.itemId, pageId)
    setConfirmDelete(null)
  }, [confirmDelete, deleteItem, pageId])

  const handleOpenAppInfo = useCallback((item) => {
    setAppInfoItem(item)
  }, [])

  // Pinning acts immediately while the modal stays open, so the modal has to
  // read the live item rather than the snapshot taken when it was opened
  const liveAppInfoItem = useMemo(() => {
    if (!appInfoItem) return null
    for (const p of data.pages) {
      for (const it of p.items) {
        if (it.id === appInfoItem.id) return it
        if (it.type === 'folder') {
          const child = it.items?.find((c) => c.id === appInfoItem.id)
          if (child) return child
        }
      }
    }
    return null
  }, [appInfoItem, data])

  const handleTogglePin = useCallback(() => {
    if (appInfoItem) togglePin(appInfoItem.id)
  }, [appInfoItem, togglePin])

  const handleToggleFavorite = useCallback(() => {
    if (appInfoItem) toggleFavorite(appInfoItem.id)
  }, [appInfoItem, toggleFavorite])

  // Hiding removes the item from the homescreen data, so close the modal
  // explicitly rather than leaving a stale appInfoItem behind
  const handleHide = useCallback(() => {
    if (!appInfoItem) return
    setHidden(appInfoItem.id, true)
    setAppInfoItem(null)
  }, [appInfoItem, setHidden])

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

  // The chip row is absolutely positioned, so the grid pads down to clear it
  // The grid's scrollbar only shows while scrolling; the class drives a
  // CSS fade and is dropped a moment after the last scroll event
  const [gridScrolling, setGridScrolling] = useState(false)
  const scrollIdleTimer = useRef(null)
  const handleGridScroll = useCallback(() => {
    setGridScrolling((s) => s || true)
    if (scrollIdleTimer.current) clearTimeout(scrollIdleTimer.current)
    scrollIdleTimer.current = setTimeout(() => setGridScrolling(false), 1000)
  }, [])
  useEffect(() => () => { if (scrollIdleTimer.current) clearTimeout(scrollIdleTimer.current) }, [])

  const gridClassName = `homescreen-grid${tagList.length > 0 || favoritesCount > 0 ? ' homescreen-grid--with-tags' : ''}${gridScrolling ? ' is-scrolling' : ''}`
  const { settings } = useSettings()
  const dndZoom = useDndZoom()
  const gridStyle = { '--grid-max-cols': clampGridColumns(settings.gridMaxColumns) }

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
            className={`homescreen-toolbar-btn homescreen-toolbar-btn--chat${aiChat ? '' : ' unset'}`}
            onClick={() => {
              if (aiChat) window.open(aiChat.url, '_blank', 'noopener,noreferrer')
              else onOpenSettings()
            }}
            title={aiChat ? `Open ${aiChat.name}` : 'Choose your AI chat in Settings'}
          >
            💬 AI Chat
          </button>
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

      {/* Tag filter chips */}
      <TagFilterBar tags={tagList} favoritesCount={favoritesCount} activeTag={activeTag} onSelect={setActiveTag} />

      {/* Grid */}
      <div className={`homescreen-grid-area${activeDragId ? ' is-dragging' : ''}`}>
        {!filtering && currentPage > 0 && (
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
        {!filtering && currentPage < data.pages.length - 1 && (
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
        {displayItems.length === 0 && (
          <div className="homescreen-empty-hint">
            {filtering ? (
              <>
                <div style={{ fontSize: 48 }}>🏷️</div>
                <p>No apps tagged “{activeTag}”</p>
                <p>Tap + to add one, or pick another tag</p>
              </>
            ) : (
              <>
                <div style={{ fontSize: 48 }}>🔖</div>
                <p>No bookmarks yet</p>
                <p>Tap + to add your first bookmark</p>
              </>
            )}
          </div>
        )}

        {filtering ? (
          // Alphabetical, folder-flattened: order is derived, so there is
          // nothing meaningful to drag against — no DnD here
          <div className={gridClassName} style={gridStyle} onScroll={handleGridScroll}>
            {displayItems.map((item) => (
              <div key={item.id} className="sortable-item">
                <AppIcon
                  item={item}
                  editMode={editMode}
                  onDelete={handleDeleteItem}
                  onRename={handleRenameItem}
                  onOpen={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
                  onInfoOpen={() => handleOpenAppInfo(item)}
                />
              </div>
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={dndZoom.collision(collisionDetection)}
            modifiers={dndZoom.modifiers}
            measuring={dndZoom.measuring}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={items.map((i) => i.id)} strategy={sortStrategy}>
              <div className={gridClassName} style={gridStyle} onScroll={handleGridScroll}>
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
        )}
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
          onAddBookmark={handleAddBookmark}
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
          onOpenAppInfo={handleOpenAppInfo}
          onDeleteFromFolder={handleDeleteFromFolder}
          onRenameFolder={handleRenameFolder}
          onEjectFromFolder={handleEjectFromFolder}
          onReorderFolderItems={handleReorderFolderItems}
          appInfoOpen={!!appInfoItem}
        />
      )}

      {/* App info modal */}
      {liveAppInfoItem && (
        <AppInfoModal
          item={liveAppInfoItem}
          onClose={() => setAppInfoItem(null)}
          onSave={handleSaveAppInfo}
          onDelete={handleDeleteAppInfo}
          onTogglePin={handleTogglePin}
          onToggleFavorite={handleToggleFavorite}
          onHide={handleHide}
          tagSuggestions={tagList}
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
