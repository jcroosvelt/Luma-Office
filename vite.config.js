import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500, target: 'es2020' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'logo.png', 'icons/apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,woff2,ttf,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            // images distantes d'un document : gardées en cache pour rester visibles hors ligne
            urlPattern: ({ request, url }) => request.destination === 'image' && url.origin !== self.location.origin,
            handler: 'CacheFirst',
            options: { cacheName: 'luma-images', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
      manifest: {
        name: 'Luma Office',
        short_name: 'Luma Office',
        description: 'Traitement de texte professionnel pour téléphone et tablette — export Word (.docx) et PDF.',
        lang: 'fr',
        id: './',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#001e6c',
        categories: ['productivity', 'business'],
        display_override: ['standalone', 'minimal-ui'],
        shortcuts: [
          { name: 'Nouveau document', short_name: 'Nouveau', description: 'Créer un document vierge', url: './#/new', icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        file_handlers: [
          { action: './', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'], 'text/plain': ['.txt'] } },
        ],
        screenshots: [
          { src: 'screens/phone.png', sizes: '824x1678', type: 'image/png', form_factor: 'narrow', label: 'Éditeur sur téléphone' },
          { src: 'screens/tablet.png', sizes: '1600x1000', type: 'image/png', form_factor: 'wide', label: 'Éditeur sur tablette' },
        ],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
