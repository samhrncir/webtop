import { useRef, useCallback } from 'react'
import { useTheme } from '../../context/ThemeContext.jsx'
import { useSettings } from '../../context/SettingsContext.jsx'
import { supabase } from '../../lib/supabase.js'
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

export default function SettingsPage({ onBack, importData, exportData }) {
  const { theme, toggleTheme } = useTheme()
  const { settings, setSetting } = useSettings()
  const fileInputRef = useRef(null)

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
        <button className="settings-back" onClick={onBack} title="Back">
          ‹
        </button>
        <h1 className="settings-title">Settings</h1>
      </div>

      <div className="settings-body">

        <section className="settings-section">
          <h2 className="settings-section-title">Appearance</h2>

          <div className="settings-card">
            <SettingsRow
              label="Color Mode"
              description="Choose your preferred theme"
            >
              <SegmentedControl
                options={[
                  { label: '☀️ Light', value: 'light' },
                  { label: '🌙 Dark', value: 'dark' },
                ]}
                value={theme}
                onChange={(val) => val !== theme && toggleTheme()}
              />
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
    </div>
  )
}
