import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { mockApiPlugin } from './mockServer.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    mockApiPlugin(),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1',
        changeOrigin: true,
      },
      '/app': {
        target: 'http://127.0.0.1',
        ws: true,
        changeOrigin: true,
      }
    }
  },
})
