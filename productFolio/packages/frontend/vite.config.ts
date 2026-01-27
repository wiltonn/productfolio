import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Optimize chunk size and splitting
    rollupOptions: {
      output: {
        // Manual chunk strategy for optimal loading
        manualChunks: {
          // Core vendor chunks - loaded immediately
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],

          // Data management - loaded when needed
          'vendor-data': ['@tanstack/react-query', '@tanstack/react-table', '@tanstack/react-virtual'],

          // DnD library - only needed for scenario planner
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],

          // State management
          'vendor-state': ['zustand'],
        },
        // Optimize chunk naming for better caching
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId;
          if (facadeModuleId && facadeModuleId.includes('pages/')) {
            // Name page chunks based on the page name
            const pageName = facadeModuleId.split('pages/')[1]?.split('.')[0];
            if (pageName) {
              return `pages/${pageName}.[hash].js`;
            }
          }
          return 'chunks/[name].[hash].js';
        },
        // Asset file naming
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          if (name.endsWith('.css')) {
            return 'styles/[name].[hash][extname]';
          }
          if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(name)) {
            return 'images/[name].[hash][extname]';
          }
          if (/\.(woff2?|eot|ttf|otf)$/i.test(name)) {
            return 'fonts/[name].[hash][extname]';
          }
          return 'assets/[name].[hash][extname]';
        },
        // Entry file naming
        entryFileNames: '[name].[hash].js',
      },
    },
    // Target modern browsers for smaller bundle
    target: 'es2020',
    // Use esbuild for minification (default, faster than terser)
    minify: 'esbuild',
    // Report compressed sizes
    reportCompressedSize: true,
    // Chunk size warning limit (in KB)
    chunkSizeWarningLimit: 500,
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Generate source maps for production debugging (disable for smaller builds)
    sourcemap: false,
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      '@tanstack/react-table',
      '@tanstack/react-virtual',
      'zustand',
    ],
    // Exclude heavy deps from pre-bundling if they're lazy loaded
    exclude: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
  },
});
