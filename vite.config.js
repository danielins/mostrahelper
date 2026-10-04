import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['film-mark.svg'],
      manifest: {
        name: 'Mostra SP — minha programação',
        short_name: 'Mostra SP',
        description: 'Sua programação pessoal para a Mostra Internacional de Cinema em São Paulo.',
        theme_color: '#294438',
        background_color: '#f5f3e9',
        display: 'standalone',
        icons: [
          {
            src: '/film-mark.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
