import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  base: './',
  build: { chunkSizeWarningLimit: 1500, target: 'es2020' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'logo.png', 'icons/apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,woff2,ttf,mjs,svg,webmanifest}'],
        // Modules lourds chargés à la demande (PDF, export, lecteur) : non téléchargés à l'installation,
        // mis en cache à la première utilisation (voir runtimeCaching ci-dessous) → installation et mises à jour plus légères.
        globIgnores: ['**/pdf.worker*', '**/pdfmake-*', '**/pdf-*.js', '**/pdf-view-*', '**/pdf_viewer*', '**/es-*.js', '**/dist-*.js', '**/pdfjs/**', '**/screens/**', '**/import-docx-*', '**/sheet-view-*', '**/xlsx-*', '**/pdf-tools-*', '**/pdf-annot-*', '**/fonts/**', '**/katex*', '**/KaTeX_*', '**/mailmerge-*', '**/math-*.js', '**/bookmarks-*', '**/versions-*', '**/compare-*', '**/ocr/**', '**/{open-sans,roboto,lato,montserrat,poppins,nunito,source-sans-3,merriweather,lora,playfair-display,dancing-script}-latin-*'],
        importScripts: ['share-target-sw.js'],
        navigateFallbackDenylist: [/share-target/, /^\/api\//, /\.apk$/],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            // modules à la demande (voir globIgnores) : mis en cache à la première utilisation
            urlPattern: ({ url }) => url.origin === self.location.origin && /\/assets\/.+\.(js|mjs|css)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'luma-modules', expiration: { maxEntries: 80 } },
          },
          {
            // polices supplémentaires (affichage et export PDF) : mises en cache à la première utilisation
            urlPattern: ({ url }) => url.origin === self.location.origin && /\.(woff2|ttf)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'luma-fonts', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            // ressources du lecteur PDF (polices, cmaps, wasm) : disponibles hors ligne après la première lecture
            urlPattern: ({ url }) => url.pathname.includes('/pdfjs/'),
            handler: 'CacheFirst',
            options: { cacheName: 'luma-pdfjs', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
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
          { action: './', accept: {
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            'application/pdf': ['.pdf'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xlsm'],
            'text/csv': ['.csv'],
            'text/plain': ['.txt'],
            'application/vnd.oasis.opendocument.text': ['.odt'],
            'application/rtf': ['.rtf'],
            'application/msword': ['.doc'],
          } },
        ],
        share_target: {
          action: './share-target', method: 'POST', enctype: 'multipart/form-data',
          params: { files: [{ name: 'files', accept: ['application/pdf', '.pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx', '.xlsm', 'text/csv', '.csv', 'text/plain', '.txt', 'application/vnd.oasis.opendocument.text', '.odt', 'application/rtf', '.rtf', 'application/msword', '.doc'] }] },
        },
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
