import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getInitialLetter, getColorForName } from '../../utils/favicon.js'
import { useIconSource } from '../../hooks/useIconSource.js'
import { resolveSubUrl } from '../../utils/url.js'
import { useDndZoom } from '../../utils/dndZoom.js'
import { useSettings } from '../../context/SettingsContext.jsx'
import { uiZoomFactor } from '../../utils/uiScale.js'
import './Taskbar.css'

// Slot widths must match Taskbar.css — they drive the overflow split
const ICON_SLOT = 48      // 40px icon + 8px gap
const CHEVRON_SLOT = 44
const PILL_PADDING = 12
const MAX_PILL_WIDTH = 720
const MENU_WIDTH = 200
const OVERFLOW_ID = 'taskbar-overflow'

function targetUrl(item) {
  const defaultSub = item.subUrls?.find((s) => s.isDefault)
  return defaultSub ? resolveSubUrl(defaultSub.url, item.url) : item.url
}

function Favicon({ item, className }) {
  const { src: iconSrc, onError: onIconError, emoji } = useIconSource(item)

  if (emoji) {
    return (
      <div className={`${className} taskbar-icon-emoji`} role="img" aria-label={item.name}>
        {emoji}
      </div>
    )
  }
  if (!iconSrc) {
    return (
      <div
        className={`${className} taskbar-icon-letter`}
        style={{ background: getColorForName(item.name) }}
      >
        {getInitialLetter(item.name)}
      </div>
    )
  }
  return (
    <img
      className={className}
      src={iconSrc}
      alt={item.name}
      onError={onIconError}
      draggable={false}
    />
  )
}

function TaskbarIcon({ item, onOpen, onContextMenu }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  return (
    <button
      ref={setNodeRef}
      className={`taskbar-icon${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      title={item.name}
      aria-label={item.name}
      onClick={() => onOpen(item)}
      onContextMenu={(e) => onContextMenu(e, item)}
      {...attributes}
      {...listeners}
    >
      <Favicon item={item} className="taskbar-icon-img" />
    </button>
  )
}

export default function Taskbar({ pinned, onOpen, onUnpin, onReorder }) {
  const observerRef = useRef(null)
  const suppressClickRef = useRef(false)
  const [available, setAvailable] = useState(MAX_PILL_WIDTH)
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const [menu, setMenu] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const dndZoom = useDndZoom()
  const { settings } = useSettings()
  const uiZoom = uiZoomFactor(settings.uiScale)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  // Callback ref, not an effect: the bar unmounts whenever the last pin is
  // removed, so the observer has to re-attach when it comes back
  const setWrapperRef = useCallback((node) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width))
    observer.observe(node)
    observerRef.current = observer
    setAvailable(node.clientWidth)
  }, [])

  // Visibility is purely a function of index and width, so the strip/flyout
  // split recomputes itself after a reorder with no extra state
  const { visible, overflow } = useMemo(() => {
    const usable = Math.min(available, MAX_PILL_WIDTH) - PILL_PADDING
    const fits = Math.floor(usable / ICON_SLOT)
    if (pinned.length <= fits) return { visible: pinned, overflow: [] }
    const count = Math.max(1, Math.floor((usable - CHEVRON_SLOT) / ICON_SLOT))
    return { visible: pinned.slice(0, count), overflow: pinned.slice(count) }
  }, [pinned, available])

  // A pin can be unpinned from anywhere, so the flyout must not outlive its
  // contents
  useEffect(() => {
    if (overflow.length === 0) setFlyoutOpen(false)
  }, [overflow.length])

  const closeMenu = useCallback(() => setMenu(null), [])

  useEffect(() => {
    if (!menu && !flyoutOpen) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (menu) closeMenu()
      // A drag started inside the flyout would lose its drop target if the
      // flyout closed underneath it
      else if (!activeId) setFlyoutOpen(false)
    }
    const onPointerDown = (e) => {
      const inside = (sel) => e.target instanceof Element && e.target.closest(sel)
      // Closing on pointerdown would unmount the menu before its own click
      // landed, so a click inside it has to be left alone
      if (menu && !inside('.taskbar-menu')) closeMenu()
      if (flyoutOpen && !activeId && !inside('.taskbar-flyout, .taskbar-chevron')) {
        setFlyoutOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [menu, flyoutOpen, activeId, closeMenu])

  const handleOpen = useCallback((item) => {
    if (suppressClickRef.current) return
    onOpen(targetUrl(item))
    setFlyoutOpen(false)
  }, [onOpen])

  const handleContextMenu = useCallback((e, item) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({
      id: item.id,
      name: item.name,
      url: targetUrl(item),
      // The bar sits at the bottom of the viewport, so the menu always opens
      // upward; clamp x so it can't run off the right edge either
      x: Math.min(e.clientX / uiZoom, window.innerWidth / uiZoom - MENU_WIDTH - 8),
      y: e.clientY / uiZoom,
    })
  }, [uiZoom])

  const handleDragStart = useCallback(({ active }) => {
    suppressClickRef.current = true
    setActiveId(active.id)
    setMenu(null)
  }, [])

  // Windows 11 spring-loading: hovering the chevron mid-drag reveals overflow
  const handleDragOver = useCallback(({ over }) => {
    if (over?.id === OVERFLOW_ID) setFlyoutOpen(true)
  }, [])

  const endDrag = useCallback(() => {
    setActiveId(null)
    // Clear after the browser's post-drag click has already fired
    setTimeout(() => { suppressClickRef.current = false }, 0)
  }, [])

  const handleDragEnd = useCallback(({ active, over }) => {
    endDrag()
    if (!over) return
    const oldIndex = pinned.findIndex((p) => p.id === active.id)
    if (oldIndex === -1) return
    const newIndex = over.id === OVERFLOW_ID
      ? pinned.length - 1
      : pinned.findIndex((p) => p.id === over.id)
    if (newIndex === -1 || newIndex === oldIndex) return
    onReorder(oldIndex, newIndex)
  }, [pinned, onReorder, endDrag])

  const activeItem = activeId ? pinned.find((p) => p.id === activeId) : null

  if (pinned.length === 0) return null

  return (
    <div className="taskbar-wrapper" ref={setWrapperRef}>
      <DndContext
        sensors={sensors}
        collisionDetection={dndZoom.collision(closestCenter)}
        modifiers={dndZoom.modifiers}
        measuring={dndZoom.measuring}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={endDrag}
      >
        <div className="taskbar-pill">
          <SortableContext
            items={visible.map((p) => p.id)}
            strategy={horizontalListSortingStrategy}
          >
            {visible.map((item) => (
              <TaskbarIcon
                key={item.id}
                item={item}
                onOpen={handleOpen}
                onContextMenu={handleContextMenu}
              />
            ))}
          </SortableContext>

          {overflow.length > 0 && (
            <OverflowButton
              count={overflow.length}
              open={flyoutOpen}
              onToggle={() => setFlyoutOpen((v) => !v)}
            >
              {flyoutOpen && (
                <div className="taskbar-flyout">
                  <SortableContext
                    items={overflow.map((p) => p.id)}
                    strategy={rectSortingStrategy}
                  >
                    {overflow.map((item) => (
                      <TaskbarIcon
                        key={item.id}
                        item={item}
                        onOpen={handleOpen}
                        onContextMenu={handleContextMenu}
                      />
                    ))}
                  </SortableContext>
                </div>
              )}
            </OverflowButton>
          )}
        </div>

        <DragOverlay>
          {activeItem ? (
            <div className="taskbar-icon taskbar-drag-overlay">
              <Favicon item={activeItem} className="taskbar-icon-img" />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {menu && (
        <div
          className="taskbar-menu"
          style={{ left: menu.x, top: menu.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="taskbar-menu-title">{menu.name}</div>
          <button
            className="taskbar-menu-item"
            onClick={() => { onOpen(menu.url); closeMenu() }}
          >
            Open
          </button>
          <button
            className="taskbar-menu-item danger"
            onClick={() => { onUnpin(menu.id); closeMenu() }}
          >
            Unpin from taskbar
          </button>
        </div>
      )}
    </div>
  )
}

function OverflowButton({ count, open, onToggle, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: OVERFLOW_ID })

  return (
    <div className="taskbar-chevron-wrap">
      <button
        ref={setNodeRef}
        className={`taskbar-chevron${open ? ' open' : ''}${isOver ? ' drop-target' : ''}`}
        onClick={onToggle}
        title={`${count} more pinned app${count === 1 ? '' : 's'}`}
        aria-label={`Show ${count} more pinned apps`}
        aria-expanded={open}
      >
        &raquo;
      </button>
      {children}
    </div>
  )
}
