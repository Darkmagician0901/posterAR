import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    basicSsl()
  ],
  resolve: {
    alias: {
      '@': '/src',
      'react': resolve(__dirname, './node_modules/react'),
      'react-dom': resolve(__dirname, './node_modules/react-dom'),
      'react/jsx-runtime': resolve(__dirname, './node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': resolve(__dirname, './node_modules/react/jsx-dev-runtime')
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'three']
  },
  server: {
    https: true,
    host: true,
    port: 5173
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // three.js is the largest dependency — give it its own chunk.
            if (id.includes('/three/') || id.includes('\\three\\')) {
              return 'three';
            }
            // Everything else (incl. react/react-dom) stays in vendor.
            // React is intentionally NOT split out: separate React chunks
            // caused a load-order race where consumers ran before React was
            // defined. The 8th Wall engine itself is loaded via <script> in
            // index.html, so it is not part of the bundle graph.
            return 'vendor';
          }
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    cssCodeSplit: true,
    reportCompressedSize: true,
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true
    }
  },
  optimizeDeps: {
    // Pre-bundle the runtime deps. (The 8th Wall engine is loaded from CDN via
    // <script> in index.html, so it is not listed here.)
    include: ['react', 'react-dom', 'three']
  }
});