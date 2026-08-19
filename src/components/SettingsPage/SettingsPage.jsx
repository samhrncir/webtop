import { useRef, useState, useCallback, useMemo } from 'react'
import { useTheme } from '../../context/ThemeContext.jsx'
import {
  useSettings,
  GRID_MIN_COLUMNS, GRID_MAX_COLUMNS, clampGridColumns,
  UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_STEP, clampUiScale,
} from '../../context/SettingsContext.jsx'
import { supabase } from '../../lib/supabase.js'
import { flattenBookmarks } from '../../utils/tags.js'
import { normalizeChatUrl, resolveAiChat } from '../../utils/aiChat.js'
import HiddenBookmarks from '../HiddenBookmarks/HiddenBookmarks.jsx'
import RecycleBin from '../RecycleBin/RecycleBin.jsx'
import './SettingsPage.css'

function SettingsRow({ label, description, children }) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <span className="settings-row-label">{label}</span>
        {description && (
          <span className="settings-row-description">{description}</span>
        )}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="segmented-control">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`segmented-option${value === opt.value ? ' active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      className={`toggle${value ? ' on' : ''}`}
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
    >
      <span className="toggle-thumb" />
    </button>
  )
}

const CUSTOM_URL = '__custom__'

export default function SettingsPage({
  onBack,
  importData,
  exportData,
  data,
  hiddenBookmarks = [],
  visibleBookmarks = [],
  setHidden,
  trash = { pages: [], folders: [] },
  restorePage,
  restoreFolder,
}) {
  const { theme, preference, setPreference } = useTheme()
  const { settings, setSetting } = useSettings()
  const fileInputRef = useRef(null)
  // null = settings root; 'hidden' = Hidden Bookmarks; 'trash' = Recycle Bin
  const [subview, setSubview] = useState(null)

  const handleBack = useCallback(() => {
    if (subview) setSubview(null)
    else onBack()
  }, [subview, onBack])

  // ---- AI Chat target ----
  const bookmarks = useMemo(() => (data ? flattenBookmarks(data) : []), [data])
  const aiChat = resolveAiChat(settings, data)
  // What the dropdown shows: a bookmark id, CUSTOM_URL, or '' for not set.
  // Kept locally so picking "Custom URL…" holds while the URL is still empty.
  const [chatMode, setChatMode] = useState(() =>
    settings.aiChatBookmarkId ? settings.aiChatBookmarkId : settings.aiChatUrl ? CUSTOM_URL : ''
  )
  // A picked bookmark that has since been deleted shows as "Not set"
  const selectValue =
    chatMode === CUSTOM_URL || chatMode === '' || bookmarks.some(({ item }) => item.id === chatMode)
      ? chatMode
      : ''
  const [urlDraft, setUrlDraft] = useState(settings.aiChatUrl || '')
  const urlDraftInvalid = urlDraft.trim().length > 0 && !normalizeChatUrl(urlDraft)

  const handleChatPick = useCallback((value) => {
    setChatMode(value)
    if (value === CUSTOM_URL) {
      setSetting('aiChatBookmarkId', null)
    } else if (value) {
      setSetting('aiChatBookmarkId', value)
    } else {
      setSetting('aiChatBookmarkId', null)
      setSetting('aiChatUrl', '')
      setUrlDraft('')
    }
  }, [setSetting])

  const commitUrl = useCallback(() => {
    const normalized = normalizeChatUrl(urlDraft)
    setSetting('aiChatUrl', normalized)
    if (normalized) setUrlDraft(normalized)
  }, [urlDraft, setSetting])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      await importData(file)
    } catch (err) {
      alert('Import failed: ' + err.message)
    }
    e.target.value = ''
  }, [importData])

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button className="settings-back" onClick={handleBack} title="Back">
          ‹
        </button>
        <h1 className="settings-title">
          {subview === 'hidden' ? 'Hidden Bookmarks' : subview === 'trash' ? 'Recycle Bin' : 'Settings'}
        </h1>
      </div>

      {subview === 'hidden' ? (
        <div className="settings-body">
          <HiddenBookmarks
            hiddenBookmarks={hiddenBookmarks}
            visibleBookmarks={visibleBookmarks}
            setHidden={setHidden}
          />
        </div>
      ) : subview === 'trash' ? (
        <div className="settings-body">
          <RecycleBin trash={trash} restorePage={restorePage} restoreFolder={restoreFolder} />
        </div>
      ) : (
        <div className="settings-body">

          <section className="settings-section">
            <h2 className="settings-section-title">Appearance</h2>

            <div className="settings-card">
              <SettingsRow
                label="Color Mode"
                description={
                  preference === 'system'
                    ? `Following your device setting (currently ${theme})`
                    : 'Choose your preferred theme'
                }
              >
                <SegmentedControl
                  options={[
                    { label: '🖥️ System', value: 'system' },
                    { label: '☀️ Light', value: 'light' },
                    { label: '🌙 Dark', value: 'dark' },
                  ]}
                  value={preference}
                  onChange={setPreference}
                />
              </SettingsRow>

              <div className="settings-divider" />

              <SettingsRow
                label="Display Scale"
                description={
                  clampUiScale(settings.uiScale) === 100
                    ? 'Size of text and controls across BrowserHome, independent of browser zoom'
                    : `${clampUiScale(settings.uiScale)}% — BrowserHome only; pages you open are unaffected`
                }
              >
                <div className="settings-slider">
                  <input
                    type="range"
                    min={UI_SCALE_MIN}
                    max={UI_SCALE_MAX}
                    step={UI_SCALE_STEP}
                    value={clampUiScale(settings.uiScale)}
                    onChange={(e) => setSetting('uiScale', clampUiScale(e.target.value))}
                    aria-label="Display scale"
                  />
                  <span className="settings-slider-value">{clampUiScale(settings.uiScale)}%</span>
                  {clampUiScale(settings.uiScale) !== 100 && (
                    <button
                      className="settings-action-btn settings-slider-reset"
                      onClick={() => setSetting('uiScale', 100)}
                      title="Back to 100%"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </SettingsRow>

              <div className="settings-divider" />

              <SettingsRow
                label="Grid Columns"
                description={`Up to ${clampGridColumns(settings.gridMaxColumns)} columns of apps — fewer if the window is narrow, never fewer than ${GRID_MIN_COLUMNS}`}
              >
                <div className="settings-slider">
                  <input
                    type="range"
                    min={GRID_MIN_COLUMNS}
                    max={GRID_MAX_COLUMNS}
                    step={1}
                    value={clampGridColumns(settings.gridMaxColumns)}
                    onChange={(e) => setSetting('gridMaxColumns', clampGridColumns(e.target.value))}
                    aria-label="Maximum grid columns"
                  />
                  <span className="settings-slider-value">{clampGridColumns(settings.gridMaxColumns)}</span>
                </div>
              </SettingsRow>

              <div className="settings-divider" />

              <SettingsRow
                label="Time Format"
                description="Clock display in the toolbar"
              >
                <SegmentedControl
                  options={[
                    { label: '12h', value: '12' },
                    { label: '24h', value: '24' },
                  ]}
                  value={settings.timeFormat}
                  onChange={(val) => setSetting('timeFormat', val)}
                />
              </SettingsRow>
            </div>
          </section>

          <section className="settings-section">
            <h2 className="settings-section-title">AI Chat</h2>
            <div className="settings-card">
              <SettingsRow
                label="Default AI chat"
                description={
                  aiChat
                    ? `The 💬 AI Chat button opens ${aiChat.name}`
                    : 'Pick a bookmark or enter a URL for the 💬 AI Chat button'
                }
              >
                <select
                  className="settings-select"
                  value={selectValue}
                  onChange={(e) => handleChatPick(e.target.value)}
                  aria-label="Default AI chat"
                >
                  <option value="">Not set</option>
                  {bookmarks.length > 0 && (
                    <optgroup label="Bookmarks">
                      {bookmarks.map(({ item, pageIdx, inFolder }) => (
                        <option key={item.id} value={item.id}>
                          {item.name} — Page {pageIdx + 1}{inFolder ? ` · ${inFolder}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value={CUSTOM_URL}>Custom URL…</option>
                </select>
              </SettingsRow>
              {chatMode === CUSTOM_URL && (
                <>
                  <div className="settings-divider" />
                  <SettingsRow
                    label="Chat URL"
                    description={
                      urlDraftInvalid
                        ? 'Enter a valid http(s) URL'
                        : 'e.g. https://claude.ai/new or https://chatgpt.com'
                    }
                  >
                    <input
                      className={`settings-text-input${urlDraftInvalid ? ' invalid' : ''}`}
                      type="url"
                      value={urlDraft}
                      placeholder="https://claude.ai/new"
                      onChange={(e) => setUrlDraft(e.target.value)}
                      onBlur={commitUrl}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitUrl() }}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </SettingsRow>
                </>
              )}
            </div>
          </section>

          <section className="settings-section">
            <h2 className="settings-section-title">Bookmarks</h2>
            <div className="settings-card">
              <SettingsRow
                label="Hidden Bookmarks"
                description={
                  hiddenBookmarks.length === 0
                    ? 'Hide bookmarks from the home screen without deleting them'
                    : `${hiddenBookmarks.length} hidden`
                }
              >
                <button className="settings-action-btn" onClick={() => setSubview('hidden')}>
                  Manage ›
                </button>
              </SettingsRow>
              <div className="settings-divider" />
              <SettingsRow
                label="Recycle Bin"
                description={
                  trash.pages.length + trash.folders.length === 0
                    ? 'Restore deleted pages and folders'
                    : `${trash.pages.length} page${trash.pages.length === 1 ? '' : 's'}, ${trash.folders.length} folder${trash.folders.length === 1 ? '' : 's'}`
                }
              >
                <button className="settings-action-btn" onClick={() => setSubview('trash')}>
                  Open ›
                </button>
              </SettingsRow>
            </div>
          </section>

          <section className="settings-section">
            <h2 className="settings-section-title">Data</h2>
            <div className="settings-card">
              <SettingsRow label="Import" description="Restore bookmarks from a JSON backup">
                <button className="settings-action-btn" onClick={handleImportClick}>
                  ⬆ Import
                </button>
              </SettingsRow>
              <div className="settings-divider" />
              <SettingsRow label="Export" description="Download a backup of all your bookmarks">
                <button className="settings-action-btn" onClick={exportData}>
                  ⬇ Export
                </button>
              </SettingsRow>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden-file-input"
              onChange={handleFileChange}
            />
          </section>

          <section className="settings-section">
            <h2 className="settings-section-title">Account</h2>
            <div className="settings-card">
              <SettingsRow label="Sign Out" description="Sign out on this device">
                <button
                  className="settings-signout"
                  onClick={() => supabase.auth.signOut()}
                >
                  Sign Out
                </button>
              </SettingsRow>
            </div>
          </section>

        </div>
      )}
    </div>
  )
}
