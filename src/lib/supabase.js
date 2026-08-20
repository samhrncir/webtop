import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Without credentials (tests, fresh checkouts) the app runs local-only on an
// inert stub instead of crashing at import time. Every call answers the way
// the real client does when the network is down — no session, errors from
// data calls — so callers take their existing offline paths.
function stubClient() {
  const error = { message: 'Supabase is not configured', code: 'OFFLINE' }
  const makeQuery = () => {
    const q = {}
    for (const m of [
      'select', 'insert', 'upsert', 'update', 'delete',
      'eq', 'neq', 'in', 'order', 'limit', 'maybeSingle', 'single',
    ]) q[m] = () => q
    // Thenable, so any length of chain can be awaited
    q.then = (resolve) => resolve({ data: null, error })
    return q
  }
  const channel = { on: () => channel, subscribe: () => channel }
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: null, error }),
      signUp: async () => ({ data: null, error }),
      signOut: async () => ({ error: null }),
    },
    from: makeQuery,
    rpc: async () => ({ data: null, error }),
    channel: () => channel,
    removeChannel: () => {},
  }
}

export const supabase = url && key ? createClient(url, key) : stubClient()
