import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl() // Enables HTTPS for local development (required for WebXR)
  ],
  resolve: {
    alias: {
      '@': '/src'
    }
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
            // Only split Three.js (the largest dependency)
            if (id.includes('three')) {
              return 'three';
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
