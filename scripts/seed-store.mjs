// Loads supabase/seed/store_apps.json into the store_apps table, matching
// rows by slug so re-running updates listings in place and never duplicates.
//
// Two ways to run it:
//
//   node scripts/seed-store.mjs --sql > seed.sql
//       Prints an upsert statement to paste into the Supabase SQL editor.
//       No credentials needed.
//
//   node --env-file=.env scripts/seed-store.mjs
//       Upserts directly, using VITE_SUPABASE_URL and
//       SUPABASE_SERVICE_ROLE_KEY from .env. The service-role key bypasses
//       RLS; never ship it to the client.
//
// A different JSON file in the same shape can be passed as an argument,
// which is how a listing-writing agent will feed the store later.

import { readFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const asSql = args.includes('--sql')
const file = args.find((a) => !a.startsWith('--')) ?? new URL('../supabase/seed/store_apps.json', import.meta.url)
const listings = JSON.parse(await readFile(file, 'utf8'))

const rows = listings.map((l) => ({
  slug: l.slug,
  name: l.name,
  url: l.url,
  tagline: l.tagline ?? '',
  description: l.description ?? '',
  category: l.category ?? 'Other',
  tags: l.tags ?? [],
  icon_url: l.icon_url ?? null,
  featured: !!l.featured,
  rank: l.rank ?? 0,
  published: l.published ?? true,
  install: l.install ?? {},
}))

const COLUMNS = ['slug', 'name', 'url', 'tagline', 'description', 'category', 'tags', 'icon_url', 'featured', 'rank', 'published', 'install']

function sqlLiteral(value) {
  if (value === null) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return `array[${value.map(sqlLiteral).join(', ')}]::text[]`
  if (typeof value === 'object') return `${sqlLiteral(JSON.stringify(value))}::jsonb`
  return `'${String(value).replace(/'/g, "''")}'`
}

if (asSql) {
  const values = rows.map((r) => `  (${COLUMNS.map((c) => sqlLiteral(r[c])).join(', ')})`).join(',\n')
  const updates = COLUMNS.filter((c) => c !== 'slug').map((c) => `${c} = excluded.${c}`).join(', ')
  console.log(`insert into store_apps (${COLUMNS.join(', ')}) values\n${values}\non conflict (slug) do update set ${updates};`)
  process.exit(0)
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or run with --sql (see the comment at the top of this script).')
  process.exit(1)
}

const { createClient } = await import('@supabase/supabase-js')
const supabase = createClient(url, key, { auth: { persistSession: false } })
const { error } = await supabase.from('store_apps').upsert(rows, { onConflict: 'slug' })
if (error) {
  console.error('Seed failed:', error.message)
  process.exit(1)
}
console.log(`Upserted ${rows.length} listings.`)
