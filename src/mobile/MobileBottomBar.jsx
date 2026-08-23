import React from 'react'
import SearchBar from '../components/SearchBar/SearchBar.jsx'

// Thumb-reachable bottom bar: settings on the left, search in the middle
// (its results overlay opens upward, styled in mobile.css), AI chat on the
// right when one is configured.
export default function MobileBottomBar({
  data,
  activeTag,
  onSelectTag,
  onNavigateToPage,
  onOpenFolder,
  onOpenSettings,
  aiChat,
}) {
  return (
    <div className="mobile-bottombar">
      <button
        className="mobile-bottombar-btn"
        onClick={onOpenSettings}
        aria-label="Settings"
      >
        ⚙️
      </button>
      <div className="mobile-bottombar-search">
        <SearchBar
          data={data}
          activeTag={activeTag}
          onSelectTag={onSelectTag}
          onNavigateToPage={onNavigateToPage}
          onOpenFolder={onOpenFolder}
        />
      </div>
      {aiChat && (
        <button
          className="mobile-bottombar-btn"
          onClick={() => window.open(aiChat.url, '_blank', 'noopener,noreferrer')}
          aria-label={`Open ${aiChat.name}`}
          title={`Open ${aiChat.name}`}
        >
          💬
        </button>
      )}
    </div>
  )
}
