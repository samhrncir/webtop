import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import AppIcon from '../AppIcon/AppIcon.jsx'
import { useDndZoom } from '../../utils/dndZoom.js'
import './FolderOverlay.css'

function SortableBookmark({ bookmark, editMode, onDelete, onOpen, onInfoOpen, frozen }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bookmark.id })

  const style = {
    transform: frozen ? undefined : CSS.Transform.toString(transform),
    transition: frozen ? undefined : transition,
    opacity: isDragging ? 0.25 : 1,
    touchAction: 'none',
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <AppIcon
        item={bookmark}
        editMode={editMode}
        onDelete={onDelete}
        onOpen={onOpen}
        onInfoOpen={onInfoOpen}
        onRename={() => {}}
        onLongPress={() => {}}
      />
    </div>
  )
}

export default function FolderOverlay({
  folder,
  editMode,
  onClose,
  onOpenBookmark,
  onOpenAppInfo,
  onDeleteFromFolder,
  onRenameFolder,
  onEjectFromFolder,
  onReorderFolderItems,
  appInfoOpen,
}) {
  const [renamingFolder, setRenamingFolder] = useState(false)
  const [folderName, setFolderName] = useState(folder.name)
  const [draggingId, setDraggingId] = useState(null)
  const [pointerOutside, setPointerOutside] = useState(false)

  const modalRef = useRef(null)
  const lastPointer = useRef({ x: 0, y: 0 })
  const dndZoom = useDndZoom()

  useEffect(() => { setFolderName(folder.name) }, [folder.name])

  const handleKeyDown = useCallback((e) => {
    // App Info stacks above the folder and handles Escape itself
    if (e.key === 'Escape' && !appInfoOpen) onClose()
  }, [onClose, appInfoOpen])
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  )

  const isOutsideModal = useCallback((x, y) => {
    if (!modalRef.current) return false
    const { left, right, top, bottom } = modalRef.current.getBoundingClientRect()
    return x < left || x > right || y < top || y > bottom
  }, [])

  const handleDragStart = useCallback(({ active, activatorEvent }) => {
    setDraggingId(active.id)
    setPointerOutside(false)
    if (activatorEvent) {
      lastPointer.current = { x: activatorEvent.clientX, y: activatorEvent.clientY }
    }
  }, [])

  const handleDragMove = useCallback(({ activatorEvent, delta }) => {
    if (!activatorEvent) return
    const x = activatorEvent.clientX + delta.x
    const y = activatorEvent.clientY + delta.y
    lastPointer.current = { x, y }
    setPointerOutside(isOutsideModal(x, y))
  }, [isOutsideModal])

  const handleDragEnd = useCallback(({ active, over }) => {
    const { x, y } = lastPointer.current
    const outside = isOutsideModal(x, y)
    setDraggingId(null)
    setPointerOutside(false)

    if (outside) {
      onEjectFromFolder?.(active.id, folder.id)
    } else if (over && active.id !== over.id) {
      const oldIndex = folder.items.findIndex((b) => b.id === active.id)
      const newIndex = folder.items.findIndex((b) => b.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorderFolderItems?.(folder.id, oldIndex, newIndex)
      }
    }
  }, [folder, isOutsideModal, onEjectFromFolder, onReorderFolderItems])

  const draggingItem = draggingId ? folder.items.find((b) => b.id === draggingId) : null

  const handleFolderNameKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      const trimmed = folderName.trim()
      if (trimmed) onRenameFolder?.(folder.id, trimmed)
      setRenamingFolder(false)
    }
  }

  const handleFolderNameBlur = () => {
    const trimmed = folderName.trim()
    if (trimmed) onRenameFolder?.(folder.id, trimmed)
    setRenamingFolder(false)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={dndZoom.collision(closestCenter)}
      modifiers={dndZoom.modifiers}
      measuring={dndZoom.measuring}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <div
        className={`folder-overlay-backdrop${draggingId && pointerOutside ? ' eject-ready' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        {draggingId && (
          <div className={`eject-hint${pointerOutside ? ' eject-hint--active' : ''}`}>
            Drop here to remove from folder
          </div>
        )}

        <div
          ref={modalRef}
          className="folder-overlay-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="folder-overlay-header">
            {editMode && renamingFolder ? (
              <input
                className="folder-overlay-title-input"
                value={folderName}
                autoFocus
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={handleFolderNameKeyDown}
                onBlur={handleFolderNameBlur}
              />
            ) : (
              <h2
                className="folder-overlay-title"
                onDoubleClick={() => editMode && setRenamingFolder(true)}
                title={editMode ? 'Double-click to rename' : folder.name}
              >
                {folder.name}
              </h2>
            )}
            <button className="folder-overlay-close" onClick={onClose} aria-label="Close folder">
              &times;
            </button>
          </div>

          {folder.items.length === 0 ? (
            <div className="folder-overlay-empty">This folder is empty</div>
          ) : (
            <SortableContext
              items={folder.items.map((b) => b.id)}
              strategy={pointerOutside ? () => [] : rectSortingStrategy}
            >
              <div className="folder-overlay-grid">
                {folder.items.map((bm) => (
                  <SortableBookmark
                    key={bm.id}
                    bookmark={bm}
                    editMode={editMode}
                    frozen={pointerOutside}
                    onOpen={(url) => onOpenBookmark?.(url)}
                    onInfoOpen={() => onOpenAppInfo?.(bm)}
                    onDelete={() => onDeleteFromFolder?.(bm.id, folder.id)}
                  />
                ))}
              </div>
            </SortableContext>
          )}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {draggingItem ? (
          <AppIcon
            item={draggingItem}
            editMode={false}
            onDelete={() => {}}
            onRename={() => {}}
            onOpen={() => {}}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
