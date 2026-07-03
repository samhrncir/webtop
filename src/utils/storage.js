import { supabase } from '../lib/supabase.js'

const STORAGE_KEY = 'browserhome_data'
const PENDING_SYNC_KEY = 'browserhome_pending_sync'

function createDefaultData() {
  return {
    pages: [
      {
        id: crypto.randomUUID(),
        items: [],
      },
    ],
  }
}

function isValidItem(item) {
  if (!item || typeof item !== 'object') return false
  if (!item.id || !item.type || !item.name) return false
  if (item.type === 'bookmark') {
    return typeof item.url === 'string'
  }
  if (item.type === 'folder') {
    return Array.isArray(item.items)
  }
  return false
}

function isValidData(data) {
  if (!data || typeof data !== 'object') return false
  if (!Array.isArray(data.pages)) return false
  for (const page of data.pages) {
    if (!page.id || !Array.isArray(page.items)) return false
    for (const item of page.items) {
      if (!isValidItem(item)) return false
    }
  }
  return true
}

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultData()
    const parsed = JSON.parse(raw)
    if (!isValidData(parsed)) return createDefaultData()
    return parsed
  } catch {
    return createDefaultData()
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (err) {
    console.error('Failed to save data:', err)
  }
}

// Fetch the server copy along with its updated_at, which acts as a version
// token for optimistic concurrency.
// Returns one of:
//   { status: 'ok', data, updatedAt }  — usable server copy
//   { status: 'empty' }                — no row yet (new user)
//   { status: 'invalid', updatedAt }   — row exists but blob failed validation
//   { status: 'error' }                — network/auth failure, server state unknown
export async function fetchFromServer() {
  const { data, error } = await supabase
    .from('homescreen_data')
    .select('data, updated_at')
    .maybeSingle()
  if (error) return { status: 'error' }
  if (!data) return { status: 'empty' }
  if (!isValidData(data.data)) return { status: 'invalid', updatedAt: data.updated_at }
  return { status: 'ok', data: data.data, updatedAt: data.updated_at }
}

// Conditional write: only succeeds if the server row still has the updated_at
// we last saw (expectedUpdatedAt). Pass null when no row is known to exist —
// then an insert is attempted instead.
// Returns { status: 'ok', updatedAt } | { status: 'conflict' } | { status: 'error' }
export async function syncToServer(data, expectedUpdatedAt) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { status: 'error' }
  const now = new Date().toISOString()

  if (expectedUpdatedAt) {
    const { data: rows, error } = await supabase
      .from('homescreen_data')
      .update({ data, updated_at: now })
      .eq('user_id', session.user.id)
      .eq('updated_at', expectedUpdatedAt)
      .select('updated_at')
    if (error) return { status: 'error' }
    // Zero rows updated means another session wrote first
    if (!rows || rows.length === 0) return { status: 'conflict' }
    return { status: 'ok', updatedAt: rows[0].updated_at }
  }

  const { data: rows, error } = await supabase
    .from('homescreen_data')
    .insert({ user_id: session.user.id, data, updated_at: now })
    .select('updated_at')
  if (error) {
    // 23505 = unique violation: a row appeared since we last checked
    return { status: error.code === '23505' ? 'conflict' : 'error' }
  }
  return { status: 'ok', updatedAt: rows[0].updated_at }
}

export function setPendingSync() {
  localStorage.setItem(PENDING_SYNC_KEY, 'true')
}

export function clearPendingSync() {
  localStorage.removeItem(PENDING_SYNC_KEY)
}

export function hasPendingSync() {
  return localStorage.getItem(PENDING_SYNC_KEY) === 'true'
}

// Union merge of two datasets by id. Server ordering wins; local wins on
// same-id content (local holds this device's unsynced edits). Items deleted
// on one side but present on the other are resurrected — acceptable tradeoff
// for a stopgap; per-item sync would fix this properly.
function mergeItems(localItems, serverItems) {
  const localById = new Map(localItems.map((item) => [item.id, item]))
  const merged = serverItems.map((serverItem) => {
    const localItem = localById.get(serverItem.id)
    if (!localItem) return serverItem
    localById.delete(serverItem.id)
    if (serverItem.type === 'folder' && localItem.type === 'folder') {
      return { ...localItem, items: mergeItems(localItem.items, serverItem.items) }
    }
    return localItem
  })
  for (const item of localItems) {
    if (localById.has(item.id)) merged.push(item)
  }
  return merged
}

export function mergeData(localData, serverData) {
  const localPages = new Map(localData.pages.map((page) => [page.id, page]))
  const pages = serverData.pages.map((serverPage) => {
    const localPage = localPages.get(serverPage.id)
    if (!localPage) return serverPage
    localPages.delete(serverPage.id)
    return { ...serverPage, items: mergeItems(localPage.items, serverPage.items) }
  })
  for (const page of localData.pages) {
    // Skip empty local-only pages (e.g. another device's untouched default page)
    if (localPages.has(page.id) && page.items.length > 0) pages.push(page)
  }
  if (pages.length === 0) pages.push({ id: crypto.randomUUID(), items: [] })
  return { ...serverData, pages }
}

export function exportData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const data = raw ? JSON.parse(raw) : createDefaultData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `webtop-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('Failed to export data:', err)
  }
}

export function importData(file) {
  return new Promise((resolve, reject) => {
    if (!file || file.type !== 'application/json') {
      reject(new Error('Please select a valid JSON file'))
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result)
        if (!isValidData(parsed)) {
          reject(new Error('Invalid data format'))
          return
        }
        resolve(parsed)
      } catch {
        reject(new Error('Failed to parse JSON file'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
