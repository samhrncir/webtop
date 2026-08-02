import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'
import { clearLocalData, claimLocalData } from './utils/syncV2.js'
import { useHomescreen } from './hooks/useHomescreen.js'
import AuthScreen from './components/AuthScreen/AuthScreen.jsx'
import SearchBar from './components/SearchBar/SearchBar.jsx'
import HomeScreen from './components/HomeScreen/HomeScreen.jsx'
import PageIndicator from './components/PageIndicator/PageIndicator.jsx'
import SettingsPage from './components/SettingsPage/SettingsPage.jsx'
import './App.css'

function HomescreenApp() {
  const [view, setView] = useState('home')
  const [folderToOpen, setFolderToOpen] = useState(null)
  // One tag at a time, shared so the chips scope both the grid and search
  const [activeTag, setActiveTag] = useState(null)

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
    moveItem,
    addToFolder,
    removeFromFolder,
    addPage,
    deletePage,
    importData,
    exportData,
    reorderItems,
  } = useHomescreen()

  return (
    <div className="app">
      <div className={`app-view${view === 'settings' ? ' app-view--settings' : ''}`}>

        <div className="app-home">
          <SearchBar
            data={data}
            activeTag={activeTag}
            onNavigateToPage={setCurrentPage}
            onOpenFolder={(folder, pageIdx) => { setCurrentPage(pageIdx); setFolderToOpen(folder) }}
          />
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
            reorderItems={reorderItems}
            moveItem={moveItem}
            addToFolder={addToFolder}
            removeFromFolder={removeFromFolder}
            ejectFromFolder={ejectFromFolder}
            reorderFolderItems={reorderFolderItems}
            addPage={addPage}
            onOpenSettings={() => setView('settings')}
            folderToOpen={folderToOpen}
            clearFolderToOpen={() => setFolderToOpen(null)}
            activeTag={activeTag}
            setActiveTag={setActiveTag}
          />
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
          <SettingsPage onBack={() => setView('home')} importData={importData} exportData={exportData} />
        </div>

      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    // Claiming/clearing runs synchronously before setSession, so by the time
    // HomescreenApp mounts and bootstraps from localStorage, data left behind
    // by another account is already gone
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) claimLocalData(session.user.id)
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearLocalData()
      } else if (session?.user) {
        claimLocalData(session.user.id)
      }
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return <div className="app" />
  }

  if (!session) {
    return <AuthScreen />
  }

  return <HomescreenApp />
}
