import React from 'react'
import './RecycleBin.css'

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hr ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString()
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function BinRow({ icon, title, meta, onRestore }) {
  return (
    <li className="bin-row">
      <div className="bin-icon" aria-hidden="true">{icon}</div>
      <div className="bin-text">
        <span className="bin-title">{title}</span>
        <span className="bin-meta">{meta}</span>
      </div>
      <button className="settings-action-btn bin-restore" onClick={onRestore}>
        Restore
      </button>
    </li>
  )
}

// Settings sub-page listing deleted pages and folders. Deletes are already
// tombstones that sync as such, so restoring is just clearing the tombstone.
export default function RecycleBin({ trash, restorePage, restoreFolder }) {
  const { pages, folders } = trash
  const empty = pages.length === 0 && folders.length === 0

  return (
    <>
      <section className="settings-section">
        <h2 className="settings-section-title">Pages ({pages.length})</h2>
        <div className="settings-card">
          {pages.length === 0 ? (
            <p className="bin-empty">No deleted pages.</p>
          ) : (
            <ul className="bin-list">
              {pages.map((p) => (
                <BinRow
                  key={p.id}
                  icon="📄"
                  title={`Page with ${plural(p.itemCount, 'item')}`}
                  meta={`Deleted ${timeAgo(p.deletedAt)} · restores as the last page`}
                  onRestore={() => restorePage(p.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">Folders ({folders.length})</h2>
        <div className="settings-card">
          {folders.length === 0 ? (
            <p className="bin-empty">No deleted folders.</p>
          ) : (
            <ul className="bin-list">
              {folders.map((f) => (
                <BinRow
                  key={f.id}
                  icon="📁"
                  title={f.name}
                  meta={`${plural(f.itemCount, 'bookmark')} · deleted ${timeAgo(f.deletedAt)} · restores to the next free spot`}
                  onRestore={() => restoreFolder(f.id)}
                />
              ))}
            </ul>
          )}
        </div>
        {!empty && (
          <p className="bin-hint">
            Restoring brings back everything that was deleted along with the page or folder.
            Deleted items are kept indefinitely.
          </p>
        )}
      </section>
    </>
  )
}
