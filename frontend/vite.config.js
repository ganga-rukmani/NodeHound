import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/health': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/trace': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/node/': { target: 'http://127.0.0.1:8080', changeOrigin: true },
    },
  },
})

