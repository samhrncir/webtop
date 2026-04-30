import { supabase } from '../lib/supabase.js'

const STORAGE_KEY = 'webtop_data'
const PENDING_SYNC_KEY = 'webtop_pending_sync'

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

export async function fetchFromServer() {
  const { data, error } = await supabase
    .from('homescreen_data')
    .select('data')
    .single()
  if (error || !data) return null
  if (!isValidData(data.data)) return null
  return data.data
}

export async function syncToServer(data) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return false
  const { error } = await supabase
    .from('homescreen_data')
    .upsert(
      { user_id: session.user.id, data, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  if (error) {
    localStorage.setItem(PENDING_SYNC_KEY, 'true')
    return false
  }
  localStorage.removeItem(PENDING_SYNC_KEY)
  return true
}

export function hasPendingSync() {
  return localStorage.getItem(PENDING_SYNC_KEY) === 'true'
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
