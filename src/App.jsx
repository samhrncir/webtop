import React, { useState, useEffect, Suspense, lazy } from 'react'
import { supabase } from './lib/supabase.js'
import { clearLocalData, claimLocalData } from './utils/syncV2.js'
import { pickShell } from './utils/shell.js'
import AuthScreen from './components/AuthScreen/AuthScreen.jsx'
import './App.css'

// Lazy per-shell chunks: the web bundle never loads mobile-only screens and
// the APK never loads desktop-only ones (they share common pieces for now).
const DesktopShell = lazy(() => import('./shells/DesktopShell.jsx'))
const MobileShell = lazy(() => import('./mobile/MobileShell.jsx'))

export default function App() {
  const [session, setSession] = useState(undefined)
  // Decided once per launch: pointer capability doesn't change mid-session,
  // and the ?shell= override should hold for the whole visit
  const [shell] = useState(pickShell)

  useEffect(() => {
    // Claiming/clearing runs synchronously before setSession, so by the time
    // the shell mounts and bootstraps from localStorage, data left behind
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

  const Shell = shell === 'mobile' ? MobileShell : DesktopShell
  return (
    <Suspense fallback={<div className="app" />}>
      <Shell />
    </Suspense>
  )
}
