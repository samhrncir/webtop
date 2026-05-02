import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'
import { useHomescreen } from './hooks/useHomescreen.js'
import AuthScreen from './components/AuthScreen/AuthScreen.jsx'
import SearchBar from './components/SearchBar/SearchBar.jsx'
import HomeScreen from './components/HomeScreen/HomeScreen.jsx'
import PageIndicator from './components/PageIndicator/PageIndicator.jsx'
import SettingsPage from './components/SettingsPage/SettingsPage.jsx'
import './App.css'

function HomescreenApp() {
  const [view, setView] = useState('home')

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
          <SearchBar data={data} onNavigateToPage={setCurrentPage} />
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
            importData={importData}
            exportData={exportData}
            onOpenSettings={() => setView('settings')}
          />
          <PageIndicator
            pages={data.pages}
            currentPage={currentPage}
            onNavigate={setCurrentPage}
            onAddPage={addPage}
            onDeletePage={deletePage}
            editMode={editMode}
          />
        </div>

        <div className="app-settings">
          <SettingsPage onBack={() => setView('home')} />
        </div>

      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
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
