import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.VITE_BASE_PATH || '/';
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: process.env.VITE_SITE_BUILD === 'true' ? 'autoUpdate' : 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'icons/*.png'],
      manifest: {
        id: base,
        name: 'JevOS · 意图桌面',
        short_name: 'JevOS',
        description: '围绕当前任务组合工具，保留你的工作。',
        lang: 'zh-CN',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f5f3ed',
        theme_color: '#244d3d',
        icons: [
          { src: `${base}icons/pwa-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/pwa-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,woff,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [{ urlPattern: /\/api\//, handler: 'NetworkOnly' },
          { urlPattern: /\/music\/.*\.(?:ogg|mp3|wav)$/, handler: 'CacheFirst', options: { cacheName: 'jevos-music', rangeRequests: true, cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 5 } } }],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    headers: { 'Content-Security-Policy': "frame-src 'self' blob:; object-src 'none'; base-uri 'self'" },
    proxy: { '/api': 'http://127.0.0.1:4107' },
  },
});
