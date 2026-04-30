import React, { useState, useCallback, useEffect, useRef } from 'react'
import './AddBookmarkModal.css'

function isValidUrl(str) {
  try {
    const url = new URL(str)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function guessNameFromUrl(url) {
  try {
    const parsed = new URL(url)
    let hostname = parsed.hostname.replace(/^www\./, '')
    const parts = hostname.split('.')
    const domain = parts[0]
    return domain.charAt(0).toUpperCase() + domain.slice(1)
  } catch {
    return ''
  }
}

export default function AddBookmarkModal({ onClose, onAddBookmark, onAddFolder }) {
  const [tab, setTab] = useState('bookmark') // 'bookmark' | 'folder'
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [folderName, setFolderName] = useState('')
  const [urlError, setUrlError] = useState('')
  const [nameError, setNameError] = useState('')
  const [folderNameError, setFolderNameError] = useState('')
  const urlInputRef = useRef(null)

  useEffect(() => {
    if (tab === 'bookmark') urlInputRef.current?.focus()
  }, [tab])

  const handleUrlChange = useCallback((e) => {
    const val = e.target.value
    setUrl(val)
    setUrlError('')
    // Try to auto-populate name
    if (!name || name === guessNameFromUrl(url)) {
      const guessed = guessNameFromUrl(val)
      if (guessed) setName(guessed)
    }
  }, [name, url])

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSubmitBookmark = useCallback((e) => {
    e.preventDefault()
    let valid = true

    // Try prefixing https:// if missing
    let finalUrl = url.trim()
    if (finalUrl && !finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl
    }

    if (!isValidUrl(finalUrl)) {
      setUrlError('Please enter a valid URL (e.g. https://example.com)')
      valid = false
    }
    const finalName = name.trim() || guessNameFromUrl(finalUrl) || finalUrl
    if (!finalName) {
      setNameError('Please enter a name')
      valid = false
    }

    if (!valid) return
    onAddBookmark(finalUrl, finalName)
    onClose()
  }, [url, name, onAddBookmark, onClose])

  const handleSubmitFolder = useCallback((e) => {
    e.preventDefault()
    const trimmed = folderName.trim()
    if (!trimmed) {
      setFolderNameError('Please enter a folder name')
      return
    }
    onAddFolder(trimmed)
    onClose()
  }, [folderName, onAddFolder, onClose])

  return (
    <div className="add-modal-backdrop" onClick={handleBackdropClick}>
      <div className="add-modal">
        <div className="add-modal-header">
          <span className="add-modal-title">Add New</span>
          <button className="add-modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="add-modal-tabs">
          <button
            className={`add-modal-tab${tab === 'bookmark' ? ' active' : ''}`}
            onClick={() => { setTab('bookmark'); setUrlError(''); setNameError('') }}
          >
            Bookmark
          </button>
          <button
            className={`add-modal-tab${tab === 'folder' ? ' active' : ''}`}
            onClick={() => { setTab('folder'); setFolderNameError('') }}
          >
            Folder
          </button>
        </div>

        {tab === 'bookmark' ? (
          <form onSubmit={handleSubmitBookmark} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="add-modal-field">
              <label className="add-modal-label">URL</label>
              <input
                ref={urlInputRef}
                className={`add-modal-input${urlError ? ' error' : ''}`}
                type="text"
                placeholder="https://example.com"
                value={url}
                onChange={handleUrlChange}
                autoComplete="off"
                spellCheck={false}
              />
              {urlError && <span className="add-modal-error">{urlError}</span>}
            </div>
            <div className="add-modal-field">
              <label className="add-modal-label">Name</label>
              <input
                className={`add-modal-input${nameError ? ' error' : ''}`}
                type="text"
                placeholder="My Site"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError('') }}
                autoComplete="off"
              />
              {nameError && <span className="add-modal-error">{nameError}</span>}
            </div>
            <button className="add-modal-submit" type="submit">
              Add Bookmark
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmitFolder} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="add-modal-field">
              <label className="add-modal-label">Folder Name</label>
              <input
                className={`add-modal-input${folderNameError ? ' error' : ''}`}
                type="text"
                placeholder="My Folder"
                value={folderName}
                autoFocus
                onChange={(e) => { setFolderName(e.target.value); setFolderNameError('') }}
                autoComplete="off"
              />
              {folderNameError && <span className="add-modal-error">{folderNameError}</span>}
            </div>
            <button className="add-modal-submit" type="submit">
              Create Folder
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
