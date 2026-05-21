import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl() // Enables HTTPS for local development (required for WebXR)
  ],
  resolve: {
    alias: {
      '@': '/src',
      // Force all React imports to resolve to the same instance
      'react': resolve(__dirname, './node_modules/react'),
      'react-dom': resolve(__dirname, './node_modules/react-dom'),
      'react/jsx-runtime': resolve(__dirname, './node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': resolve(__dirname, './node_modules/react/jsx-dev-runtime')
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'three']
  },
  server: {
    https: true, // Required for WebXR API access
    host: true, // Expose to network for mobile testing
    port: 5173
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // Split Three.js separately (largest dependency)
            if (id.includes('/three/') || id.includes('\\three\\')) {
              return 'three';
            }
            // Split React Three Fiber ecosystem
            if (id.includes('@react-three')) {
              return 'react-three';
            }
            // Split React core separately to avoid circular dependencies
            if (id.includes('/react/') || id.includes('\\react\\') ||
                id.includes('/react-dom/') || id.includes('\\react-dom\\')) {
              return 'react-vendor';
            }
            // Everything else goes into vendor
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
    include: ['three', '@react-three/fiber', '@react-three/xr', '@react-three/drei']
  }
});

// Made with Bob
