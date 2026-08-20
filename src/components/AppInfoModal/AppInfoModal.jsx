import React, { useState, useCallback, useEffect, Suspense, lazy } from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getInitialLetter, getColorForName, isSafeIconUrl, normalizeEmoji, normalizeIconBg, iconBgStyle } from '../../utils/favicon.js'
import { useIconSource } from '../../hooks/useIconSource.js'
import { resolveSubUrl } from '../../utils/url.js'
import { normalizeAliases } from '../../utils/aliases.js'
import { getTags, normalizeTagList } from '../../utils/tags.js'
import TagInput from '../TagInput/TagInput.jsx'
import { useTheme } from '../../context/ThemeContext.jsx'
import { refreshBrandIcons } from '../../utils/brandIcons.js'
import { useDndZoom } from '../../utils/dndZoom.js'
import './AppInfoModal.css'

// The full emoji picker (every emoji, search, categories, skin tones) is
// only needed while editing, so it's split out of the main bundle
const EmojiPicker = lazy(() => import('emoji-picker-react'))

function SortableSubUrl({ sub, baseUrl, editMode, onSetDefault, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sub.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const resolvedUrl = resolveSubUrl(sub.url, baseUrl)

  return (
    <div ref={setNodeRef} style={style} className={`app-info-suburl-row${isDragging ? ' is-dragging' : ''}`}>
      {editMode && (
        <span className="app-info-suburl-drag" {...attributes} {...listeners}>⠿</span>
      )}
      <input
        type="radio"
        name="defaultSubUrl"
        checked={sub.isDefault}
        onChange={() => onSetDefault(sub.id)}
        onClick={() => { if (sub.isDefault) onSetDefault(null) }}
        className="app-info-suburl-radio"
        title="Set as default"
      />
      <a
        className="app-info-suburl-info"
        href={resolvedUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={resolvedUrl}
      >
        <span className="app-info-suburl-name">{sub.name}</span>
        <span className="app-info-suburl-url">{sub.url}</span>
      </a>
      {editMode && (
        <button
          className="app-info-suburl-delete"
          onClick={() => { if (window.confirm(`Delete "${sub.name}"?`)) onDelete(sub.id) }}
          aria-label="Delete sub page"
        >
          &times;
        </button>
      )}
    </div>
  )
}

export default function AppInfoModal({ item, onClose, onSave, onDelete, onTogglePin, onHide, tagSuggestions = [] }) {
  const [name, setName] = useState(item.name)
  const [url, setUrl] = useState(item.url)
  const [icon, setIcon] = useState(item.icon || '')
  const [emoji, setEmoji] = useState(item.emoji || '')
  const [iconBg, setIconBg] = useState(() => normalizeIconBg(item.iconBg))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [refreshingIcon, setRefreshingIcon] = useState(false)
  const handleRefreshIcon = useCallback(async () => {
    setRefreshingIcon(true)
    try { await refreshBrandIcons() } finally { setRefreshingIcon(false) }
  }, [])
  const { theme } = useTheme()
  const dndZoom = useDndZoom()
  const [subUrls, setSubUrls] = useState(item.subUrls || [])
  const [aliases, setAliases] = useState(() => normalizeAliases(item.aliases))
  const [newAlias, setNewAlias] = useState('')
  const [tags, setTags] = useState(() => getTags(item))
  const [editMode, setEditMode] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newSubName, setNewSubName] = useState('')
  const [newSubUrl, setNewSubUrl] = useState('')

  // Preview the draft values so a typed icon URL or emoji updates live while editing
  const { src: iconSrc, onError: onIconError, emoji: previewEmoji } = useIconSource({ icon, url, emoji })
  const letter = getInitialLetter(item.name)
  const bgColor = getColorForName(item.name)
  const iconInvalid = icon.trim().length > 0 && !isSafeIconUrl(icon.trim())
  const emojiInvalid = emoji.trim().length > 0 && !normalizeEmoji(emoji)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  const handleEdit = useCallback(() => setEditMode(true), [])

  const handleCancel = useCallback(() => {
    setName(item.name)
    setUrl(item.url)
    setIcon(item.icon || '')
    setEmoji(item.emoji || '')
    setIconBg(normalizeIconBg(item.iconBg))
    setPickerOpen(false)
    setSubUrls(item.subUrls || [])
    setAliases(normalizeAliases(item.aliases))
    setNewAlias('')
    setTags(getTags(item))
    setEditMode(false)
    setShowAddForm(false)
    setNewSubName('')
    setNewSubUrl('')
  }, [item])

  const handleSave = useCallback(() => {
    onSave({
      name: name.trim() || item.name,
      url: url.trim() || item.url,
      icon: icon.trim() || null,
      // Emoji is stored beside the icon URL, not instead of it, so clearing
      // it falls back to whatever image icon the bookmark already had
      emoji: normalizeEmoji(emoji) || null,
      iconBg,
      subUrls,
      // Both always sent, even when empty — updateBookmark merges into
      // content, so clearing every entry has to write [] rather than drop
      // the key
      aliases: normalizeAliases(aliases),
      tags: normalizeTagList(tags),
    })
    setEditMode(false)
    onClose()
  }, [name, url, icon, emoji, iconBg, subUrls, aliases, tags, item, onSave, onClose])

  const handleDelete = useCallback(() => {
    if (window.confirm(`Delete "${item.name}"?`)) {
      onDelete()
      onClose()
    }
  }, [item.name, onDelete, onClose])

  const handleAddAlias = useCallback(() => {
    const trimmed = newAlias.trim()
    if (!trimmed) return
    setAliases((prev) => normalizeAliases([...prev, trimmed]))
    setNewAlias('')
  }, [newAlias])

  const handleRemoveAlias = useCallback((alias) => {
    setAliases((prev) => prev.filter((a) => a !== alias))
  }, [])

  const handleSetDefault = useCallback((subId) => {
    setSubUrls((prev) => prev.map((s) => ({ ...s, isDefault: subId !== null && s.id === subId })))
  }, [])

  const handleDeleteSub = useCallback((subId) => {
    setSubUrls((prev) => prev.filter((s) => s.id !== subId))
  }, [])

  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return
    setSubUrls((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id)
      const newIndex = prev.findIndex((s) => s.id === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }, [])

  const handleAddSub = useCallback(() => {
    const trimmedName = newSubName.trim()
    const trimmedUrl = newSubUrl.trim()
    if (!trimmedName || !trimmedUrl) return
    setSubUrls((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: trimmedName, url: trimmedUrl, isDefault: false },
    ])
    setNewSubName('')
    setNewSubUrl('')
    setShowAddForm(false)
  }, [newSubName, newSubUrl])

  const handleCancelAdd = useCallback(() => {
    setNewSubName('')
    setNewSubUrl('')
    setShowAddForm(false)
  }, [])

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  return (
    <div className="app-info-backdrop" onClick={handleBackdropClick}>
      <div className="app-info-modal">
        <div className="app-info-header">
          <span className="app-info-title">App Info</span>
          <div className="app-info-header-actions">
            {!editMode && (
              <button className="app-info-edit-btn" onClick={handleEdit}>Edit</button>
            )}
            <button className="app-info-close" onClick={onClose} aria-label="Close">&times;</button>
          </div>
        </div>

        <div className="app-info-body">
          <div className="app-info-identity">
            <div className="app-info-favicon-wrap">
              {previewEmoji ? (
                <div className="app-info-favicon-emoji" role="img" aria-label={item.name}>
                  {previewEmoji}
                </div>
              ) : iconSrc ? (
                <img
                  src={iconSrc}
                  alt={item.name}
                  onError={onIconError}
                  className="app-info-favicon"
                  style={iconBgStyle({ iconBg })}
                  draggable={false}
                />
              ) : (
                <div className="app-info-favicon-letter" style={{ background: bgColor }}>{letter}</div>
              )}
            </div>
            <div className="app-info-fields">
              {editMode ? (
                <>
                  <input
                    className="app-info-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="App name"
                    autoComplete="off"
                  />
                  <input
                    className="app-info-input app-info-input--url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <input
                    className="app-info-input app-info-input--url"
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    placeholder="Custom icon URL (optional)"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <div className="app-info-icon-hint-row">
                    <p className={`app-info-url-hint${iconInvalid ? ' app-info-url-hint--error' : ''}`}>
                      {iconInvalid
                        ? 'Icon URL must start with http:// or https://'
                        : "Leave blank to use the site's brand mark (theSVG) or favicon."}
                    </p>
                    <button
                      type="button"
                      className="app-info-emoji-clear app-info-icon-refresh"
                      onClick={handleRefreshIcon}
                      disabled={refreshingIcon}
                      title="Re-run icon lookup: refetch the brand icon library and reload this site's icon"
                    >
                      {refreshingIcon ? 'Refreshing…' : '↻ Refresh icon'}
                    </button>
                  </div>
                  <div className="app-info-emoji-row">
                    <input
                      className="app-info-input app-info-emoji-input"
                      value={emoji}
                      onChange={(e) => setEmoji(e.target.value)}
                      placeholder="🙂"
                      aria-label="Emoji icon"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <span className="app-info-emoji-label">Emoji icon</span>
                    <button
                      type="button"
                      className={`app-info-emoji-clear${pickerOpen ? ' active' : ''}`}
                      onClick={() => setPickerOpen((v) => !v)}
                      aria-expanded={pickerOpen}
                    >
                      {pickerOpen ? 'Close picker' : 'Choose emoji…'}
                    </button>
                    {emoji && (
                      <button
                        type="button"
                        className="app-info-emoji-clear"
                        onClick={() => { setEmoji(''); setPickerOpen(false) }}
                      >
                        Use image icon
                      </button>
                    )}
                  </div>
                  <p className={`app-info-url-hint${emojiInvalid ? ' app-info-url-hint--error' : ''}`}>
                    {emojiInvalid
                      ? 'Enter a single emoji.'
                      : 'An emoji replaces the image icon. Clear it to go back to the icon URL or favicon.'}
                  </p>
                  <div className="app-info-iconbg-row">
                    <span className="app-info-emoji-label">Icon background</span>
                    <span className="app-info-iconbg-end" aria-hidden="true">Light</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={iconBg ?? 50}
                      onChange={(e) => setIconBg(normalizeIconBg(e.target.value))}
                      aria-label="Icon background darkness"
                    />
                    <span className="app-info-iconbg-end" aria-hidden="true">Dark</span>
                    {iconBg !== null && (
                      <button
                        type="button"
                        className="app-info-emoji-clear"
                        onClick={() => setIconBg(null)}
                      >
                        Theme default
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <span className="app-info-display-name">{name}</span>
                  <a
                    className="app-info-display-url"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={url}
                  >
                    {url}
                  </a>
                </>
              )}
            </div>
          </div>

          {editMode && pickerOpen && (
            <div className="app-info-emoji-picker">
              <Suspense fallback={<div className="app-info-emoji-picker-loading">Loading emoji…</div>}>
                <EmojiPicker
                  onEmojiClick={(d) => { setEmoji(d.emoji); setPickerOpen(false) }}
                  emojiStyle="native"
                  theme={theme === 'dark' ? 'dark' : 'light'}
                  width="100%"
                  height={340}
                  lazyLoadEmojis
                  autoFocusSearch
                  searchPlaceHolder="Search emoji"
                  previewConfig={{ showPreview: false }}
                />
              </Suspense>
            </div>
          )}

          <div className="app-info-quick-actions">
            <button
              className={`app-info-pin-btn${item.pinned ? ' pinned' : ''}`}
              onClick={onTogglePin}
            >
              <span className="app-info-pin-icon">📌</span>
              {item.pinned ? 'Unpin from taskbar' : 'Pin to taskbar'}
            </button>
            {onHide && (
              <button
                className="app-info-pin-btn"
                onClick={onHide}
                title="Hidden bookmarks are listed under Settings"
              >
                <span className="app-info-pin-icon">🙈</span>
                Hide from home screen
              </button>
            )}
          </div>

          <div className="app-info-tag-section">
            <span className="app-info-suburl-title">Tags</span>
            {editMode ? (
              <TagInput tags={tags} onChange={setTags} suggestions={tagSuggestions} />
            ) : tags.length > 0 ? (
              <div className="tag-pill-row">
                {tags.map((tag) => (
                  <span key={tag} className="tag-pill">{tag}</span>
                ))}
              </div>
            ) : (
              <p className="app-info-suburl-empty">No tags.</p>
            )}
          </div>

          <div className="app-info-alias-section">
            <div className="app-info-suburl-header">
              <span className="app-info-suburl-title">Aliases</span>
            </div>

            {aliases.length > 0 ? (
              <div className="app-info-alias-chips">
                {aliases.map((alias) => (
                  <span key={alias} className="app-info-alias-chip">
                    {alias}
                    {editMode && (
                      <button
                        className="app-info-alias-chip-remove"
                        onClick={() => handleRemoveAlias(alias)}
                        aria-label={`Remove alias ${alias}`}
                      >
                        &times;
                      </button>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <p className="app-info-suburl-empty">
                {editMode ? 'No aliases yet. Add alternate names to find this app in search.' : 'No aliases.'}
              </p>
            )}

            {editMode && (
              <div className="app-info-alias-add-row">
                <input
                  className="app-info-input"
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  placeholder="Add an alias"
                  autoComplete="off"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddAlias() }}
                />
                <button
                  className="app-info-suburl-add-btn"
                  onClick={handleAddAlias}
                  aria-label="Add alias"
                >
                  +
                </button>
              </div>
            )}
          </div>

          <div className="app-info-suburl-section">
            <div className="app-info-suburl-header">
              <span className="app-info-suburl-title">Sub Pages</span>
              {editMode && (
                <button
                  className="app-info-suburl-add-btn"
                  onClick={() => setShowAddForm((v) => !v)}
                  aria-label="Add sub page"
                >
                  +
                </button>
              )}
            </div>

            {subUrls.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={dndZoom.collision(closestCenter)}
                modifiers={dndZoom.modifiers}
                measuring={dndZoom.measuring}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={subUrls.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="app-info-suburl-list">
                    {subUrls.map((sub) => (
                      <SortableSubUrl
                        key={sub.id}
                        sub={sub}
                        baseUrl={url}
                        editMode={editMode}
                        onSetDefault={handleSetDefault}
                        onDelete={handleDeleteSub}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              !showAddForm && (
                <p className="app-info-suburl-empty">
                  {editMode ? 'No sub pages yet. Use + to add one.' : 'No sub pages.'}
                </p>
              )
            )}

            {editMode && showAddForm && (
              <div className="app-info-add-form">
                <input
                  className="app-info-input"
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  placeholder="Name"
                  autoFocus
                  autoComplete="off"
                />
                <input
                  className="app-info-input"
                  value={newSubUrl}
                  onChange={(e) => setNewSubUrl(e.target.value)}
                  placeholder="/path  or  https://..."
                  autoComplete="off"
                  spellCheck={false}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddSub() }}
                />
                <p className="app-info-url-hint">Use <code>/path</code> for relative or <code>https://...</code> for absolute URLs.</p>
                <div className="app-info-add-form-actions">
                  <button className="app-info-add-cancel" onClick={handleCancelAdd}>Cancel</button>
                  <button className="app-info-add-confirm" onClick={handleAddSub}>Add</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {editMode && (
          <div className="app-info-footer">
            <button className="app-info-delete-btn" onClick={handleDelete}>Delete</button>
            <div className="app-info-footer-actions">
              <button className="app-info-cancel-btn" onClick={handleCancel}>Cancel</button>
              <button className="app-info-save-btn" onClick={handleSave}>Save</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
