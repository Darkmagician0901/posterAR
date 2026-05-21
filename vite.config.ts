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
    // Optimize for mobile performance
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'three-vendor': ['three', '@react-three/fiber', '@react-three/drei', '@react-three/xr'],
          'gesture-vendor': ['@use-gesture/react'],
          'state-vendor': ['zustand']
        },
        // Optimize chunk names for better caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Reduce bundle size using esbuild (faster than terser)
    minify: 'esbuild',
    // Source maps for production debugging (optional)
    sourcemap: false,
    // Chunk size warnings
    chunkSizeWarningLimit: 600,
    // CSS code splitting
    cssCodeSplit: true,
    // Report compressed size
    reportCompressedSize: true,
    // Optimize dependencies
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
