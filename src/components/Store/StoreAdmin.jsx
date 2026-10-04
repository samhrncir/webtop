import React, { useState, useMemo, useCallback } from 'react'
import {
  STORE_CATEGORIES, hostOf, groupByCategory, normalizeListing, validateListing, slugify,
} from '../../utils/store.js'
import StoreIcon from './StoreIcon.jsx'
import StoreCard from './StoreCard.jsx'
import './Store.css'
import './StoreAdmin.css'

// Admin pages: every listing (drafts included) with quick toggles, and a
// form for adding or editing one with a live card preview. `onSave` and
// `onDelete` resolve to { error } so the page can show what the server
// refused; RLS, not this component, decides who may write.

const EMPTY = {
  slug: '', name: '', url: '', tagline: '', description: '', category: 'Other',
  tags: [], icon_url: '', featured: false, rank: 0, published: true, install: {},
}

function matches(app, q) {
  return [app.name, app.slug, app.category, hostOf(app.url), ...(app.tags || [])]
    .filter(Boolean).join(' ').toLowerCase().includes(q)
}

export default function StoreAdmin({ apps, onSave, onDelete, onBack }) {
  const [editing, setEditing] = useState(null) // null | 'new' | listing
  const [query, setQuery] = useState('')
  const [banner, setBanner] = useState('')

  const ordered = useMemo(() => groupByCategory(apps).flatMap((g) => g.apps), [apps])
  const q = query.trim().toLowerCase()
  const shown = q ? ordered.filter((a) => matches(a, q)) : ordered

  const quickSave = useCallback(async (app, patch) => {
    const { error } = await onSave(normalizeListing({ ...app, ...patch }))
    setBanner(error ? `Couldn't save ${app.name}: ${error.message}` : '')
  }, [onSave])

  const remove = useCallback(async (app) => {
    if (!window.confirm(`Delete "${app.name}" from the marketplace?`)) return
    const { error } = await onDelete(app.id)
    setBanner(error ? `Couldn't delete ${app.name}: ${error.message}` : '')
  }, [onDelete])

  if (editing) {
    return (
      <ListingForm
        initial={editing === 'new' ? EMPTY : editing}
        existingSlugs={apps.filter((a) => a.id !== editing.id).map((a) => a.slug)}
        onCancel={() => setEditing(null)}
        onSave={async (row) => {
          const result = await onSave(row)
          if (!result.error) setEditing(null)
          return result
        }}
      />
    )
  }

  return (
    <div className="store-page store-admin">
      <div className="store-header">
        <button type="button" className="store-back" onClick={onBack} title="Back" aria-label="Back">‹</button>
        <h1 className="store-title">Manage marketplace</h1>
        <input
          className="store-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter listings"
          aria-label="Filter listings"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" className="store-btn store-btn--install" onClick={() => setEditing('new')}>
          + New listing
        </button>
      </div>

      <div className="store-body store-admin-body">
        {banner && <p className="store-admin-banner" role="alert">{banner}</p>}
        <p className="store-admin-count">
          {apps.length} {apps.length === 1 ? 'listing' : 'listings'}
          {apps.some((a) => !a.published) && `, ${apps.filter((a) => !a.published).length} unpublished`}
        </p>

        <div className="store-admin-list" role="list">
          {shown.map((app) => (
            <div key={app.id} className={`store-admin-row${app.published ? '' : ' store-admin-row--draft'}`} role="listitem">
              <StoreIcon app={app} size={40} />
              <div className="store-admin-row-text">
                <span className="store-admin-row-name">{app.name}</span>
                <span className="store-admin-row-meta">{app.category} · {hostOf(app.url) || app.url} · rank {app.rank ?? 0}</span>
              </div>
              <label className="store-admin-check">
                <input
                  type="checkbox"
                  checked={!!app.featured}
                  onChange={() => quickSave(app, { featured: !app.featured })}
                  aria-label={`Featured: ${app.name}`}
                />
                Featured
              </label>
              <label className="store-admin-check">
                <input
                  type="checkbox"
                  checked={app.published !== false}
                  onChange={() => quickSave(app, { published: app.published === false })}
                  aria-label={`Published: ${app.name}`}
                />
                Published
              </label>
              <button type="button" className="store-admin-action" onClick={() => setEditing(app)} aria-label={`Edit ${app.name}`}>
                Edit
              </button>
              <button type="button" className="store-admin-action store-admin-action--danger" onClick={() => remove(app)} aria-label={`Delete ${app.name}`}>
                Delete
              </button>
            </div>
          ))}
          {shown.length === 0 && <p className="store-status">No listings match.</p>}
        </div>
      </div>
    </div>
  )
}

function toDraft(listing) {
  return {
    ...listing,
    tags: (listing.tags || []).join(', '),
    icon_url: listing.icon_url || '',
    rank: String(listing.rank ?? 0),
    install: listing.install && Object.keys(listing.install).length > 0
      ? JSON.stringify(listing.install, null, 2)
      : '',
  }
}

function guessName(url) {
  const host = hostOf(url)
  if (!host) return ''
  const label = host.split('.')[0]
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function ListingForm({ initial, existingSlugs, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => toDraft(initial))
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)
  const isNew = !initial.id

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setDraft((d) => ({ ...d, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  // Paste a URL, press this, and the name and slug fill themselves in
  const fillFromUrl = () => {
    setDraft((d) => {
      const name = d.name.trim() || guessName(d.url)
      return { ...d, name, slug: d.slug.trim() || slugify(name) }
    })
  }

  const preview = useMemo(() => {
    const row = normalizeListing(draft)
    return { ...row, id: 'preview', name: row.name || 'Name', tagline: row.tagline || 'Tagline' }
  }, [draft])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const row = normalizeListing(draft)
    const found = validateListing(row)
    if (existingSlugs.includes(row.slug)) found.slug = 'Another listing already uses this slug'
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return
    }
    setSaving(true)
    const { error } = await onSave(row)
    setSaving(false)
    if (error) setServerError(error.message || 'Save failed')
  }

  const field = (name, label, props = {}) => (
    <label className="store-admin-field">
      <span className="store-admin-label">{label}</span>
      {props.textarea ? (
        <textarea className={`store-admin-input${errors[name] ? ' error' : ''}`} aria-label={label} value={draft[name]} onChange={set(name)} rows={props.rows || 3} spellCheck={props.spell ?? false} />
      ) : (
        <input className={`store-admin-input${errors[name] ? ' error' : ''}`} aria-label={label} type="text" value={draft[name]} onChange={set(name)} placeholder={props.placeholder} list={props.list} autoComplete="off" spellCheck={false} />
      )}
      {errors[name] && <span className="store-admin-error">{errors[name]}</span>}
    </label>
  )

  return (
    <div className="store-page store-admin">
      <div className="store-header">
        <button type="button" className="store-back" onClick={onCancel} title="Back" aria-label="Back">‹</button>
        <h1 className="store-title">{isNew ? 'New listing' : `Edit ${initial.name}`}</h1>
      </div>

      <div className="store-body store-admin-body">
        <form className="store-admin-form" onSubmit={handleSubmit} noValidate>
          <div className="store-admin-form-main">
            <div className="store-admin-url-row">
              {field('url', 'URL', { placeholder: 'https://example.com/' })}
              <button type="button" className="store-admin-action" onClick={fillFromUrl}>Fill from URL</button>
            </div>
            {field('name', 'Name')}
            {field('slug', 'Slug', { placeholder: 'derived from the name when blank' })}
            {field('tagline', 'Tagline', { placeholder: 'One line under the name' })}
            {field('description', 'Description', { textarea: true, rows: 4, spell: true })}
            {field('category', 'Category', { list: 'store-admin-categories' })}
            <datalist id="store-admin-categories">
              {STORE_CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
            {field('tags', 'Tags', { placeholder: 'comma separated' })}
            {field('icon_url', 'Icon URL', { placeholder: 'leave blank for the brand icon or favicon' })}
            {field('rank', 'Rank', { placeholder: '0' })}
            <div className="store-admin-checks">
              <label className="store-admin-check">
                <input type="checkbox" checked={!!draft.featured} onChange={set('featured')} /> Featured
              </label>
              <label className="store-admin-check">
                <input type="checkbox" checked={draft.published !== false} onChange={set('published')} /> Published
              </label>
            </div>
            {field('install', 'Extra bookmark fields (JSON)', { textarea: true, rows: 3 })}
            <p className="store-admin-hint">
              Merged into the bookmark when someone adds the site, e.g. {'{"aliases": ["hn"]}'}.
            </p>

            {serverError && <p className="store-admin-banner" role="alert">{serverError}</p>}

            <div className="store-admin-form-actions">
              <button type="button" className="store-btn store-btn--open" onClick={onCancel}>Cancel</button>
              <button type="submit" className="store-btn store-btn--install" disabled={saving}>
                {saving ? 'Saving…' : isNew ? 'Add listing' : 'Save changes'}
              </button>
            </div>
          </div>

          <aside className="store-admin-preview" aria-label="Preview">
            <span className="store-admin-label">Preview</span>
            <div className="store-admin-preview-card">
              <StoreCard app={preview} installed={false} onSelect={() => {}} onInstall={() => {}} onOpen={() => {}} />
            </div>
          </aside>
        </form>
      </div>
    </div>
  )
}
