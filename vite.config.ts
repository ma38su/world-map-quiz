import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/world-map-quiz/',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: '世界地図クイズ',
        short_name: '地図クイズ',
        description: '地図・国旗・国の特徴から世界の国々を学べるクイズアプリ',
        lang: 'ja',
        theme_color: '#083b66',
        background_color: '#f4f1e9',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globIgnores: ['**/earth-icon-source.png'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
