import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  // Mirrors vite.config.ts so modules reading the demo flag load under vitest.
  // Demo-mode UI is exercised by passing the flag in as a prop, not by flipping
  // this — see StudioApp's `demo` prop.
  define: { __DEMO_BUILD__: 'false' },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
