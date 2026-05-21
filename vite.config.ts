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
            if (id.includes('/three/') || id.includes('\\three\\')) {
              return 'three';
            }
            if (id.includes('@react-three')) {
              return 'react-three';
            }
            // ❌ REMOVED: React chunk splitting — was causing load order race
            // React now stays in vendor, always available when other chunks run
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
    include: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/xr', '@react-three/drei']
    //         👆 also added react + react-dom here to pre-bundle them
  }
});