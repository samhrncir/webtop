import React, { useState, useCallback, useMemo } from 'react'
import { useHomescreen } from '../hooks/useHomescreen.js'
import { useSettings } from '../context/SettingsContext.jsx'
import { uiScaleStyle } from '../utils/uiScale.js'
import { resolveAiChat } from '../utils/aiChat.js'
import { allTags, flattenBookmarks, isFavorite, FAVORITES_FILTER } from '../utils/tags.js'
import Clock from '../components/Clock/Clock.jsx'
import TagFilterBar from '../components/TagFilterBar/TagFilterBar.jsx'
import Taskbar from '../components/Taskbar/Taskbar.jsx'
import PageIndicator from '../components/PageIndicator/PageIndicator.jsx'
import FolderOverlay from '../components/FolderOverlay/FolderOverlay.jsx'
import AppInfoModal from '../components/AppInfoModal/AppInfoModal.jsx'
import AddBookmarkModal from '../components/AddBookmarkModal/AddBookmarkModal.jsx'
import SettingsPage from '../components/SettingsPage/SettingsPage.jsx'
import MobilePagedGrid from './MobilePagedGrid.jsx'
import MobileBottomBar from './MobileBottomBar.jsx'
import './mobile.css'

// Touch-first shell for the Android app and coarse-pointer browsers.
// Layout, top to bottom: status row (clock + edit toggle), tag chips, the
// paged grid with the pinned-apps tray floating over its bottom, page dots,
// and a thumb-reachable bottom bar (settings / search / AI chat). App Info
// opens as a bottom sheet, the native Android pattern.

const openUrl = (url) => window.open(url, '_blank', 'noopener,noreferrer')

export default function MobileShell() {
  const [view, setView] = useState('home')
  const [activeTag, setActiveTag] = useState(null)
  const [activeFolder, setActiveFolder] = useState(null)
  const [appInfoItem, setAppInfoItem] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const { settings } = useSettings()

  const {
    data, currentPage, setCurrentPage,
    editMode, toggleEditMode,
    addBookmark, addFolder, deleteItem, renameItem, updateBookmark,
    pinned, togglePin, reorderPinned, toggleFavorite, toggleAccount,
    hidden, setHidden, trash, restorePage, restoreFolder,
    removeFromFolder, ejectFromFolder, reorderFolderItems,
    addPage, deletePage, importData, exportData, reorderItems,
  } = useHomescreen()

  const aiChat = resolveAiChat(settings, data)
  const tagList = useMemo(() => allTags(data), [data])
  const favoritesCount = useMemo(
    () => flattenBookmarks(data).filter(({ item }) => isFavorite(item)).length,
    [data]
  )

  // The folder overlay and sheet read live items so edits show immediately
  const liveFolder = useMemo(() => {
    if (!activeFolder) return null
    for (const p of data.pages) {
      const f = p.items.find((i) => i.id === activeFolder.id && i.type === 'folder')
      if (f) return f
    }
    return null
  }, [activeFolder, data])

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

  const pageId = data.pages[currentPage]?.id ?? null

  const handleDeleteItem = useCallback((itemId) => {
    const item = data.pages.flatMap((p) => p.items).find((i) => i.id === itemId)
    if (
      item?.subUrls?.length > 0 &&
      !window.confirm(`Delete "${item.name}" and its ${item.subUrls.length} sub page${item.subUrls.length === 1 ? '' : 's'}?`)
    ) {
      return
    }
    deleteItem(itemId, pageId)
  }, [data, deleteItem, pageId])

  const handleRenameItem = useCallback((itemId, name) => renameItem(itemId, pageId, name), [renameItem, pageId])
  const handleSaveAppInfo = useCallback((updates) => {
    if (appInfoItem) updateBookmark(appInfoItem.id, pageId, updates)
  }, [appInfoItem, updateBookmark, pageId])
  const handleDeleteAppInfo = useCallback(() => {
    if (appInfoItem) deleteItem(appInfoItem.id, pageId)
  }, [appInfoItem, deleteItem, pageId])
  const handleHide = useCallback(() => {
    if (!appInfoItem) return
    setHidden(appInfoItem.id, true)
    setAppInfoItem(null)
  }, [appInfoItem, setHidden])

  return (
    <div className="app mobile-shell" style={uiScaleStyle(settings.uiScale)}>
      {view === 'home' ? (
        <>
          <div className="mobile-topbar">
            <Clock />
            <button
              className={`mobile-topbar-btn${editMode ? ' active' : ''}`}
              onClick={toggleEditMode}
            >
              {editMode ? '✓ Done' : '✏️ Edit'}
            </button>
          </div>

          <TagFilterBar
            tags={tagList}
            favoritesCount={favoritesCount}
            activeTag={activeTag}
            onSelect={setActiveTag}
          />

          <div className={`mobile-stage${pinned.length > 0 ? ' has-tray' : ''}`}>
            <MobilePagedGrid
              data={data}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              editMode={editMode}
              activeTag={activeTag}
              reorderItems={reorderItems}
              onOpenBookmark={openUrl}
              onOpenFolder={setActiveFolder}
              onOpenInfo={setAppInfoItem}
              onDeleteItem={handleDeleteItem}
              onRenameItem={handleRenameItem}
            />
            <Taskbar
              pinned={pinned}
              onOpen={openUrl}
              onUnpin={togglePin}
              onReorder={reorderPinned}
            />
          </div>

          {!activeTag && (
            <PageIndicator
              pages={data.pages}
              currentPage={currentPage}
              onNavigate={setCurrentPage}
              onAddPage={addPage}
              onDeletePage={deletePage}
              editMode={editMode}
            />
          )}

          <MobileBottomBar
            data={data}
            activeTag={activeTag}
            onSelectTag={setActiveTag}
            onNavigateToPage={setCurrentPage}
            onOpenFolder={(folder, pageIdx) => { setCurrentPage(pageIdx); setActiveFolder(folder) }}
            onOpenSettings={() => setView('settings')}
            aiChat={aiChat}
          />

          {editMode && (
            <button className="mobile-fab" onClick={() => setShowAdd(true)} aria-label="Add bookmark or folder">
              +
            </button>
          )}

          {liveFolder && (
            <FolderOverlay
              folder={liveFolder}
              editMode={editMode}
              onClose={() => setActiveFolder(null)}
              onOpenBookmark={openUrl}
              onOpenAppInfo={setAppInfoItem}
              onDeleteFromFolder={removeFromFolder}
              onRenameFolder={(id, name) => renameItem(id, pageId, name)}
              onEjectFromFolder={(bookmarkId, folderId) => ejectFromFolder(bookmarkId, folderId, pageId)}
              onReorderFolderItems={(folderId, oldIndex, newIndex) => reorderFolderItems(folderId, pageId, oldIndex, newIndex)}
              appInfoOpen={!!appInfoItem}
            />
          )}

          {liveAppInfoItem && (
            <div className="mobile-sheet-host">
              <AppInfoModal
                item={liveAppInfoItem}
                onClose={() => setAppInfoItem(null)}
                onSave={handleSaveAppInfo}
                onDelete={handleDeleteAppInfo}
                onTogglePin={() => togglePin(liveAppInfoItem.id)}
                onToggleFavorite={() => toggleFavorite(liveAppInfoItem.id)}
                onToggleAccount={() => toggleAccount(liveAppInfoItem.id)}
                onHide={handleHide}
                tagSuggestions={tagList.map((t) => t.tag)}
              />
            </div>
          )}

          {showAdd && (
            <AddBookmarkModal
              onClose={() => setShowAdd(false)}
              onAddBookmark={(url, name) =>
                addBookmark(url, name, activeTag && activeTag !== FAVORITES_FILTER ? [activeTag] : [])}
              onAddFolder={addFolder}
            />
          )}
        </>
      ) : (
        <div className="mobile-settings">
          <SettingsPage
            onBack={() => setView('home')}
            importData={importData}
            exportData={exportData}
            data={data}
            hiddenBookmarks={hidden}
            visibleBookmarks={flattenBookmarks(data)}
            setHidden={setHidden}
            trash={trash}
            restorePage={restorePage}
            restoreFolder={restoreFolder}
          />
        </div>
      )}
    </div>
  )
}
