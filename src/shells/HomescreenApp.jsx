import React, { useState } from 'react'
import { useHomescreen } from '../hooks/useHomescreen.js'
import { flattenBookmarks } from '../utils/tags.js'
import { useSettings } from '../context/SettingsContext.jsx'
import { uiScaleStyle } from '../utils/uiScale.js'
import { resolveAiChat } from '../utils/aiChat.js'
import SearchBar from '../components/SearchBar/SearchBar.jsx'
import HomeScreen from '../components/HomeScreen/HomeScreen.jsx'
import Taskbar from '../components/Taskbar/Taskbar.jsx'
import PageIndicator from '../components/PageIndicator/PageIndicator.jsx'
import SettingsPage from '../components/SettingsPage/SettingsPage.jsx'

// The screen composition both shells currently share. As src/mobile grows its
// own screens, MobileShell stops rendering this and DesktopShell keeps it.
export default function HomescreenApp() {
  const [view, setView] = useState('home')
  const [folderToOpen, setFolderToOpen] = useState(null)
  // One tag at a time, shared so the chips scope both the grid and search
  const [activeTag, setActiveTag] = useState(null)
  const { settings } = useSettings()

  const {
    ejectFromFolder,
    reorderFolderItems,
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
    pinned,
    togglePin,
    reorderPinned,
    toggleFavorite,
    toggleAccount,
    hidden,
    setHidden,
    trash,
    restorePage,
    restoreFolder,
    moveItem,
    addToFolder,
    removeFromFolder,
    addPage,
    deletePage,
    importData,
    exportData,
    reorderItems,
  } = useHomescreen()

  const aiChat = resolveAiChat(settings, data)

  return (
    <div className="app" style={uiScaleStyle(settings.uiScale)}>
      <div className={`app-view${view === 'settings' ? ' app-view--settings' : ''}`}>

        <div className="app-home">
          <SearchBar
            data={data}
            typeToFocus={view === 'home'}
            activeTag={activeTag}
            onSelectTag={setActiveTag}
            onNavigateToPage={setCurrentPage}
            onOpenFolder={(folder, pageIdx) => { setCurrentPage(pageIdx); setFolderToOpen(folder) }}
          />
          {/* The tray floats over the bottom of the grid; the stage is its anchor */}
          <div className={`app-home-stage${pinned.length > 0 ? ' has-tray' : ''}`}>
            <HomeScreen
              data={data}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              editMode={editMode}
              toggleEditMode={toggleEditMode}
              addBookmark={addBookmark}
              addFolder={addFolder}
              deleteItem={deleteItem}
              renameItem={renameItem}
              updateBookmark={updateBookmark}
              togglePin={togglePin}
              toggleFavorite={toggleFavorite}
              toggleAccount={toggleAccount}
              setHidden={setHidden}
              reorderItems={reorderItems}
              moveItem={moveItem}
              addToFolder={addToFolder}
              removeFromFolder={removeFromFolder}
              ejectFromFolder={ejectFromFolder}
              reorderFolderItems={reorderFolderItems}
              addPage={addPage}
              onOpenSettings={() => setView('settings')}
              aiChat={aiChat}
              folderToOpen={folderToOpen}
              clearFolderToOpen={() => setFolderToOpen(null)}
              activeTag={activeTag}
              setActiveTag={setActiveTag}
            />
            <Taskbar
              pinned={pinned}
              onOpen={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
              onUnpin={togglePin}
              onReorder={reorderPinned}
            />
          </div>
          {/* A filtered view spans every page, so page dots mean nothing */}
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
        </div>

        <div className="app-settings">
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

      </div>
    </div>
  )
}
