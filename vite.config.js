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
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/main.jsx', 'src/test/**'],
      // Ratchet: `npm test` fails when coverage drops below these floors, so
      // an untested feature fails CI. autoUpdate raises the floors in this
      // file whenever a local run beats them — commit the bump with your PR;
      // the floors only ever go up.
      thresholds: {
        autoUpdate: true,
        statements: 53.96,
        branches: 50,
        functions: 52.18,
        lines: 56.89,
      },
    },
  },
})
