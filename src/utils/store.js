// The store: a shared catalog of popular sites (the store_apps table) that
// any user can install as a bookmark. Listings are global, not per-user, so
// they bypass the sync layer entirely: read with a plain select, cached in
// localStorage so the Android app and a flaky connection still show the
// catalog, written only by store admins (RLS enforces that server side; the
// client just hides the admin pages from everyone else).

import { supabase } from '../lib/supabase.js'
import { flattenBookmarks, normalizeTagList } from './tags.js'

export const STORE_CACHE_KEY = 'browserhome_store'

// Display order of category rows; anything else sorts alphabetically after
export const STORE_CATEGORIES = [
  'Social', 'Video', 'Music', 'News', 'Shopping', 'Productivity',
  'Developer', 'AI', 'Reference', 'Finance & Travel', 'Games', 'Other',
]

// Hostname without a leading www, lowercased; null for anything unparsable
export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase() || null
  } catch {
    return null
  }
}

// Hosts of every bookmark the user already has, on any page, in any folder,
// including hidden ones — "Installed" means "you have this site", wherever
// it lives. Hidden items are nested (folders carry their children) like the
// homescreen data, so the same flattener works on both.
export function installedHosts(data, hiddenItems = []) {
  const hosts = new Set()
  const add = ({ item }) => {
    const host = hostOf(item.url)
    if (host) hosts.add(host)
  }
  if (data) flattenBookmarks(data).forEach(add)
  flattenBookmarks({ pages: [{ id: 'hidden', items: hiddenItems }] }).forEach(add)
  return hosts
}

export function isInstalled(app, hosts) {
  const host = hostOf(app?.url)
  return !!host && hosts.has(host)
}

// The bookmark content an install writes: the listing's display fields,
// then whatever extra bookmark fields the listing's `install` payload
// carries (aliases, subUrls, emoji, ...). `install` wins on conflict so an
// admin can override the name or URL for the installed copy.
export function installPayload(app) {
  const base = {
    name: app.name,
    url: app.url,
    tags: normalizeTagList(app.tags),
  }
  if (app.icon_url) base.icon = app.icon_url
  const extra = app.install && typeof app.install === 'object' ? app.install : {}
  return { ...base, ...extra }
}

function haystack(app) {
  return [app.name, app.tagline, app.category, hostOf(app.url), ...(app.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

// Listings the store page shows: published, matching the search box and the
// selected category chip (null = all). The query is matched against the
// name, tagline, category, host and tags.
export function filterApps(apps, { query = '', category = null } = {}) {
  const q = query.trim().toLowerCase()
  return apps.filter((app) => {
    if (!app.published) return false
    if (category && app.category !== category) return false
    return !q || haystack(app).includes(q)
  })
}

function categoryOrder(category) {
  const i = STORE_CATEGORIES.indexOf(category)
  return i === -1 ? STORE_CATEGORIES.length : i
}

export function compareListings(a, b) {
  if ((a.rank ?? 0) !== (b.rank ?? 0)) return (a.rank ?? 0) - (b.rank ?? 0)
  return String(a.name).localeCompare(String(b.name))
}

// Rows for the store page: one per category that has a listing, in
// STORE_CATEGORIES order, each sorted by rank then name
export function groupByCategory(apps) {
  const groups = new Map()
  for (const app of apps) {
    const key = app.category || 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(app)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => categoryOrder(a) - categoryOrder(b) || a.localeCompare(b))
    .map(([category, list]) => ({ category, apps: list.sort(compareListings) }))
}

export function featuredApps(apps) {
  return apps.filter((app) => app.featured).sort(compareListings)
}

// Categories present in a list, in display order (drives the chip row)
export function categoriesOf(apps) {
  return groupByCategory(apps).map((g) => g.category)
}

export function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isHttpUrl(url) {
  try {
    const p = new URL(url).protocol
    return p === 'http:' || p === 'https:'
  } catch {
    return false
  }
}

// The admin form's draft (strings from inputs) to a store_apps row ready to
// upsert. Missing slug is derived from the name; tags accept a comma list.
export function normalizeListing(draft) {
  const name = String(draft.name || '').trim()
  const tags = Array.isArray(draft.tags)
    ? draft.tags
    : String(draft.tags || '').split(',')
  const rank = Number.parseInt(draft.rank, 10)
  let install = draft.install ?? {}
  if (typeof install === 'string') {
    try { install = install.trim() ? JSON.parse(install) : {} } catch { install = null }
  }
  const row = {
    slug: slugify(draft.slug || name),
    name,
    url: String(draft.url || '').trim(),
    tagline: String(draft.tagline || '').trim(),
    description: String(draft.description || '').trim(),
    category: String(draft.category || '').trim() || 'Other',
    tags: normalizeTagList(tags),
    icon_url: String(draft.icon_url || '').trim() || null,
    featured: !!draft.featured,
    rank: Number.isFinite(rank) ? rank : 0,
    published: draft.published !== false,
    install,
  }
  if (draft.id) row.id = draft.id
  return row
}

// Field -> message for anything that would make a listing unusable
export function validateListing(row) {
  const errors = {}
  if (!row.name) errors.name = 'Give the listing a name'
  if (!isHttpUrl(row.url)) errors.url = 'Enter a full http(s) URL'
  if (!row.slug) errors.slug = 'The slug needs at least one letter or digit'
  if (row.icon_url && !isHttpUrl(row.icon_url)) errors.icon_url = 'Icon must be an http(s) URL'
  if (row.install === null || typeof row.install !== 'object' || Array.isArray(row.install)) {
    errors.install = 'Extra fields must be a JSON object'
  }
  return errors
}

// ---- cache ----

export function readStoreCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_CACHE_KEY))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeStoreCache(apps) {
  try {
    localStorage.setItem(STORE_CACHE_KEY, JSON.stringify(apps))
  } catch {
    /* storage full or unavailable: the in-memory list still works */
  }
}

// ---- Supabase ----

export async function fetchStoreApps() {
  const { data, error } = await supabase
    .from('store_apps')
    .select('*')
    .order('category')
    .order('rank')
    .order('name')
  return { apps: error ? null : data ?? [], error }
}

// Whether the signed-in user may edit listings: RLS only ever returns the
// caller's own store_admins row, so any row at all means yes
export async function fetchIsStoreAdmin() {
  const { data, error } = await supabase.from('store_admins').select('user_id').maybeSingle()
  return !error && !!data
}

export async function upsertStoreApp(row) {
  const { data, error } = await supabase
    .from('store_apps')
    .upsert(row, { onConflict: row.id ? 'id' : 'slug' })
    .select()
    .single()
  return { app: error ? null : data, error }
}

export async function deleteStoreApp(id) {
  const { error } = await supabase.from('store_apps').delete().eq('id', id)
  return { error }
}
