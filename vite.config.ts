import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const basePath = process.env.NODE_ENV === 'production' ? '/pwa-movie-viewer/' : '/';

export default defineConfig({
  base: basePath,
  css: {
    postcss: {
      plugins: [tailwindcss() as any, autoprefixer() as any],
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['robots.txt', 'icons/icon-192.svg', 'icons/icon-512.svg'],
      manifest: {
        name: 'Golf Swing Analyzer',
        short_name: 'Swing Analyzer',
        description: 'PWA for frame stepping and drawing overlays on golf swing videos.',
        start_url: basePath,
        scope: basePath,
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: `${basePath}icons/icon-192.svg`, sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: `${basePath}icons/icon-512.svg`, sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: true
  }
});
