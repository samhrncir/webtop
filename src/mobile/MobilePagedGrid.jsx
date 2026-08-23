import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AppIcon from '../components/AppIcon/AppIcon.jsx'
import FolderIcon from '../components/FolderIcon/FolderIcon.jsx'
import { flattenBookmarks, itemMatchesFilter, compareByName } from '../utils/tags.js'
import { useDndZoom } from '../utils/dndZoom.js'
import { pageFromScroll, scrollLeftForPage } from './pageScroll.js'

// iOS-style paged home grid: one full-width page per data page inside a
// horizontal scroll-snap container. Long-press (250ms) picks an icon up to
// reorder it within its page; plain swipes turn pages with native momentum.
// While a tag or favorites filter is active the view flattens to a single
// vertically scrolling page, like the desktop grid does.

function SortableTile({ id, disabled, children, onEditTap }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.25 : 1 }}
      className="mobile-tile"
      onClick={onEditTap}
      onContextMenu={(e) => e.preventDefault()}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

export default function MobilePagedGrid({
  data,
  currentPage,
  setCurrentPage,
  editMode,
  activeTag,
  reorderItems,
  onOpenBookmark,
  onOpenFolder,
  onOpenInfo,
  onDeleteItem,
  onRenameItem,
}) {
  const scrollerRef = useRef(null)
  const programmaticScroll = useRef(false)
  const [draggingId, setDraggingId] = useState(null)
  const dndZoom = useDndZoom()

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    // Mouse support keeps the mobile shell fully drivable in desktop dev mode
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } })
  )

  const filtering = Boolean(activeTag)
  const filteredItems = useMemo(() => {
    if (!filtering) return []
    return flattenBookmarks(data)
      .filter(({ item }) => itemMatchesFilter(item, activeTag))
      .map(({ item }) => item)
      .sort(compareByName)
  }, [filtering, data, activeTag])

  // Keep currentPage in sync while the user swipes
  const handleScroll = useCallback(() => {
    if (programmaticScroll.current) return
    const el = scrollerRef.current
    if (!el) return
    const page = pageFromScroll(el.scrollLeft, el.clientWidth, data.pages.length)
    if (page !== currentPage) setCurrentPage(page)
  }, [currentPage, setCurrentPage, data.pages.length])

  // ...and scroll when something else changes the page (dots, search).
  // Compared by page identity, not pixel distance: mid-swipe positions
  // already past the halfway point must not be yanked back.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || filtering) return
    if (pageFromScroll(el.scrollLeft, el.clientWidth, data.pages.length) === currentPage) return
    programmaticScroll.current = true
    el.scrollTo({ left: scrollLeftForPage(currentPage, el.clientWidth), behavior: 'smooth' })
    const done = setTimeout(() => { programmaticScroll.current = false }, 400)
    return () => {
      clearTimeout(done)
      programmaticScroll.current = false // never strand the suppression flag
    }
  }, [currentPage, filtering, data.pages.length])

  // Entering the filtered view unmounts the DndContext without a dragEnd;
  // clear the drag state so the pager isn't left scroll-locked
  useEffect(() => {
    if (filtering) setDraggingId(null)
  }, [filtering])

  const handleDragStart = useCallback(({ active }) => setDraggingId(active.id), [])

  const handleDragEnd = useCallback(({ active, over }) => {
    setDraggingId(null)
    if (!over || active.id === over.id) return
    const page = data.pages.find((p) => p.items.some((i) => i.id === active.id))
    if (!page) return
    const oldIndex = page.items.findIndex((i) => i.id === active.id)
    const newIndex = page.items.findIndex((i) => i.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) reorderItems(page.id, oldIndex, newIndex)
  }, [data, reorderItems])

  const handleEditTap = useCallback((item) => (e) => {
    if (!editMode) return
    // Bubble phase: the tiles' own controls (delete ×, rename input) stop
    // propagation first, and the icons no-op their open-click in edit mode,
    // so anything that reaches this wrapper is a plain tap on the tile.
    // The App Info sheet is bookmark-shaped — folders keep their own
    // controls (rename via label, delete ×) instead.
    if (item.type !== 'bookmark') return
    e.stopPropagation()
    e.preventDefault()
    onOpenInfo(item)
  }, [editMode, onOpenInfo])

  const renderTile = (item, disabled) => (
    <SortableTile key={item.id} id={item.id} disabled={disabled} onEditTap={handleEditTap(item)}>
      {item.type === 'folder' ? (
        <FolderIcon
          item={item}
          editMode={editMode}
          onClick={() => onOpenFolder(item)}
          onDelete={() => onDeleteItem(item.id)}
          onRename={(id, name) => onRenameItem(id, name)}
        />
      ) : (
        <AppIcon
          item={item}
          editMode={editMode}
          onOpen={(url) => onOpenBookmark(url)}
          onInfoOpen={() => onOpenInfo(item)}
          onDelete={() => onDeleteItem(item.id)}
          onRename={(id, name) => onRenameItem(id, name)}
        />
      )}
    </SortableTile>
  )

  if (filtering) {
    return (
      <div className="mobile-grid-filtered" data-testid="mobile-filtered-grid">
        {filteredItems.map((item) => renderTile(item, true))}
      </div>
    )
  }

  const draggingItem = draggingId
    ? data.pages.flatMap((p) => p.items).find((i) => i.id === draggingId)
    : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={dndZoom.collision(closestCenter)}
      modifiers={dndZoom.modifiers}
      measuring={dndZoom.measuring}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <div
        ref={scrollerRef}
        className={`mobile-pages${draggingId ? ' is-dragging' : ''}`}
        onScroll={handleScroll}
        data-testid="mobile-pages"
      >
        {data.pages.map((page) => (
          <div key={page.id} className="mobile-page">
            <SortableContext items={page.items.map((i) => i.id)} strategy={rectSortingStrategy}>
              <div className="mobile-page-grid">
                {page.items.map((item) => renderTile(item, false))}
              </div>
            </SortableContext>
          </div>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {draggingItem ? (
          <div className="dnd-drag-overlay">
            {draggingItem.type === 'folder' ? (
              <FolderIcon item={draggingItem} editMode={false} onClick={() => {}} onDelete={() => {}} onRename={() => {}} />
            ) : (
              <AppIcon item={draggingItem} editMode={false} onOpen={() => {}} onDelete={() => {}} onRename={() => {}} />
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
