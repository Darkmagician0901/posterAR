/**
 * vite.config.demo.ts — builds ARCADE STUDIO as one self-contained HTML file.
 *
 * Output is `demo-dist/index.html` with every script, stylesheet and font
 * inlined, so it can be dropped on a static host (or opened from disk) with no
 * server, no API and no build step. Run it with `npm run build:demo`.
 *
 * Deliberately separate from vite.config.ts rather than a mode inside it: the
 * production build's chunking is the exact opposite of what this needs, and the
 * live deploy path should not be able to regress because of a demo.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react(), viteSingleFile()],

  // Relative asset URLs keep the file openable straight from the filesystem.
  base: './',

  // public/ holds the viewer's favicon, poster art and the host redirect rules.
  // Copying any of it would break the one-file promise, and none of it is
  // reachable from the studio. demo.html carries its own inline favicon.
  publicDir: false,

  // Switches off the two actions that need a backend. See src/studio/demoMode.ts.
  define: {
    __DEMO_BUILD__: 'true'
  },

  // Mirrors vite.config.ts so React resolves identically in both builds.
  resolve: {
    alias: {
      '@': '/src',
      'react': resolve(__dirname, './node_modules/react'),
      'react-dom': resolve(__dirname, './node_modules/react-dom'),
      'react/jsx-runtime': resolve(__dirname, './node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': resolve(__dirname, './node_modules/react/jsx-dev-runtime')
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime']
  },

  build: {
    target: 'es2020',
    outDir: 'demo-dist',
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: false,

    // One file means one stylesheet and no separate asset requests: inline
    // everything regardless of size. `manualChunks` from the main config is
    // absent on purpose — chunking and inlining are contradictory.
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,

    rollupOptions: {
      input: resolve(__dirname, 'demo.html'),
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
