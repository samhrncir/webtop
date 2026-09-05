import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: false,
    // Tests always run on the inert Supabase stub, whether or not a .env with
    // real credentials is present: otherwise supabase.js takes a different
    // code path locally than on CI and the coverage numbers disagree.
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/main.jsx', 'src/test/**', '**/.claude/**', '**/*.css'],
      // Ratchet: `npm test` fails when coverage drops below these floors, so
      // an untested feature fails CI. The floors sit half a point under the
      // measured coverage — Windows and Linux differ by a statement or two,
      // and the sync tests cover slightly different paths under load, so
      // pinning the exact local number (what autoUpdate did) made CI flaky.
      // When your tests raise coverage, raise the floor to the nearest half
      // point below the new value; the floors only ever go up.
      thresholds: {
        statements: 61.5,
        branches: 56,
        functions: 57.5,
        lines: 65,
      },
    },
  },
})
