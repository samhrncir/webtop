import React, { useState, useMemo } from 'react'
import { useHomescreen } from '../hooks/useHomescreen.js'
import { flattenBookmarks, allTags } from '../utils/tags.js'
import { useSettings } from '../context/SettingsContext.jsx'
import { uiScaleStyle } from '../utils/uiScale.js'
import { resolveAiChat } from '../utils/aiChat.js'
import { openUrl } from '../utils/openUrl.js'
import SearchBar from '../components/SearchBar/SearchBar.jsx'
import HomeScreen from '../components/HomeScreen/HomeScreen.jsx'
import IncognitoScreen from '../components/IncognitoScreen/IncognitoScreen.jsx'
import Taskbar from '../components/Taskbar/Taskbar.jsx'
import PageIndicator from '../components/PageIndicator/PageIndicator.jsx'
import SettingsPage from '../components/SettingsPage/SettingsPage.jsx'
import StoreScreen from '../components/Store/StoreScreen.jsx'
import { useStoreCatalog } from '../hooks/useStore.js'
import { installedHosts, installPayload } from '../utils/store.js'
import { showNotice } from '../utils/notice.js'

// The screen composition both shells currently share. As src/mobile grows its
// own screens, MobileShell stops rendering this and DesktopShell keeps it.
export default function HomescreenApp() {
  // 'home', 'hidden' (the hidden bookmarks' incognito home screen, shown in
  // the home pane), or 'settings' / 'store' (the right pane slides in)
  const [view, setView] = useState('home')
  // What the right pane holds; kept while it slides back out so the page
  // doesn't swap mid-animation
  const [pane, setPane] = useState('settings')
  const openPane = (name) => { setPane(name); setView(name) }
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
    installBookmark,
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
    reorderHidden,
    addHiddenFolder,
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
  const tagNames = useMemo(() => allTags(data).map((t) => t.tag), [data])

  const store = useStoreCatalog()
  const installed = useMemo(() => installedHosts(data, hidden), [data, hidden])
  const handleInstall = (app) => {
    installBookmark(installPayload(app))
    showNotice(`Added ${app.name} to your home screen`)
  }

  return (
    <div className="app" style={uiScaleStyle(settings.uiScale)}>
      <div className={`app-view${view === pane ? ' app-view--settings' : ''}`}>

        <div className="app-home">
          {view === 'hidden' ? (
            <IncognitoScreen
              hiddenItems={hidden}
              visibleItems={flattenBookmarks(data, { includeFolders: true })}
              setHidden={setHidden}
              reorderHidden={reorderHidden}
              addHiddenFolder={addHiddenFolder}
              addToFolder={addToFolder}
              removeFromFolder={removeFromFolder}
              ejectFromFolder={ejectFromFolder}
              reorderFolderItems={reorderFolderItems}
              deleteItem={deleteItem}
              renameItem={renameItem}
              updateBookmark={updateBookmark}
              toggleFavorite={toggleFavorite}
              toggleAccount={toggleAccount}
              tagSuggestions={tagNames}
              onBack={() => setView('home')}
            />
          ) : (
            <>
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
                  onOpenSettings={() => openPane('settings')}
                  onOpenStore={() => openPane('store')}
                  onOpenHidden={() => setView('hidden')}
                  aiChat={aiChat}
                  folderToOpen={folderToOpen}
                  clearFolderToOpen={() => setFolderToOpen(null)}
                  activeTag={activeTag}
                  setActiveTag={setActiveTag}
                />
                <Taskbar
                  pinned={pinned}
                  onOpen={openUrl}
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
            </>
          )}
        </div>

        <div className="app-settings">
          {pane === 'store' ? (
            <StoreScreen
              apps={store.apps}
              status={store.status}
              installedHosts={installed}
              onInstall={handleInstall}
              onOpen={openUrl}
              onBack={() => setView('home')}
            />
          ) : (
          <SettingsPage
            onBack={() => setView('home')}
            onOpenHidden={() => setView('hidden')}
            onOpenStore={() => openPane('store')}
            importData={importData}
            exportData={exportData}
            data={data}
            hiddenItems={hidden}
            trash={trash}
            restorePage={restorePage}
            restoreFolder={restoreFolder}
          />
          )}
        </div>

      </div>
    </div>
  )
}
