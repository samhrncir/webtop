import React, { useState, useMemo, useCallback } from 'react'
import { filterApps, groupByCategory, featuredApps, categoriesOf, isInstalled } from '../../utils/store.js'
import StoreCard from './StoreCard.jsx'
import StoreDetail from './StoreDetail.jsx'
import StoreAdmin from './StoreAdmin.jsx'
import './Store.css'

// The marketplace: search, category chips, a Featured row and one row per
// category, Play-style. Searching or picking a chip flattens the view into
// a grid of matches. Pure presentation: the catalog, what's installed and
// the install action all come in as props so both shells can host it.
// Admins get a Manage button that swaps in the admin pages (StoreAdmin).
export default function StoreScreen({
  apps,
  status = 'ready',
  installedHosts,
  onInstall,
  onOpen,
  onBack,
  isAdmin = false,
  onSaveListing,
  onDeleteListing,
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(null)
  const [selected, setSelected] = useState(null)
  const [managing, setManaging] = useState(false)

  const published = useMemo(() => filterApps(apps), [apps])
  const categories = useMemo(() => categoriesOf(published), [published])
  const filtering = query.trim() !== '' || category !== null
  const matches = useMemo(() => filterApps(apps, { query, category }), [apps, query, category])
  const rows = useMemo(() => groupByCategory(published), [published])
  const featured = useMemo(() => featuredApps(published), [published])

  // The detail view reads the live listing so an install flips its button
  const liveSelected = selected ? apps.find((a) => a.id === selected.id) ?? selected : null
  const installed = useCallback((app) => isInstalled(app, installedHosts), [installedHosts])

  const cardProps = { onSelect: setSelected, onInstall, onOpen }
  const renderCard = (app) => (
    <StoreCard key={app.id} app={app} installed={installed(app)} {...cardProps} />
  )

  const empty = published.length === 0
  const statusText = empty
    ? status === 'offline'
      ? "Couldn't reach the marketplace. Check your connection and try again."
      : status === 'loading'
        ? 'Loading the marketplace…'
        : 'The marketplace is empty.'
    : null

  if (isAdmin && managing) {
    return (
      <StoreAdmin
        apps={apps}
        onSave={onSaveListing}
        onDelete={onDeleteListing}
        onBack={() => setManaging(false)}
      />
    )
  }

  return (
    <div className="store-page">
      <div className="store-header">
        <button type="button" className="store-back" onClick={onBack} title="Back" aria-label="Back">‹</button>
        <h1 className="store-title">Marketplace</h1>
        <input
          className="store-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sites"
          aria-label="Search the marketplace"
          autoComplete="off"
          spellCheck={false}
        />
        {isAdmin && (
          <button type="button" className="store-manage" onClick={() => setManaging(true)}>
            Manage
          </button>
        )}
      </div>

      <div className="store-body">
        {categories.length > 0 && (
          <div className="store-chips" role="tablist" aria-label="Categories">
            <button
              type="button"
              role="tab"
              aria-selected={category === null}
              className={`store-chip${category === null ? ' active' : ''}`}
              onClick={() => setCategory(null)}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={category === c}
                className={`store-chip${category === c ? ' active' : ''}`}
                onClick={() => setCategory(category === c ? null : c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {statusText && <p className="store-status" role="status">{statusText}</p>}

        {!empty && filtering && (
          <section className="store-section">
            <h2 className="store-section-title">
              {matches.length === 0 ? 'No matches' : `${matches.length} ${matches.length === 1 ? 'site' : 'sites'}`}
            </h2>
            <div className="store-grid" role="list">{matches.map(renderCard)}</div>
          </section>
        )}

        {!empty && !filtering && (
          <>
            {featured.length > 0 && (
              <section className="store-section">
                <h2 className="store-section-title">Featured</h2>
                <div className="store-row" role="list">{featured.map(renderCard)}</div>
              </section>
            )}
            {rows.map(({ category: c, apps: list }) => (
              <section key={c} className="store-section">
                <h2 className="store-section-title">
                  <button type="button" className="store-section-link" onClick={() => setCategory(c)}>
                    {c} ›
                  </button>
                </h2>
                <div className="store-row" role="list">{list.map(renderCard)}</div>
              </section>
            ))}
          </>
        )}
      </div>

      {liveSelected && (
        <StoreDetail
          app={liveSelected}
          installed={installed(liveSelected)}
          onClose={() => setSelected(null)}
          onInstall={onInstall}
          onOpen={onOpen}
        />
      )}
    </div>
  )
}
