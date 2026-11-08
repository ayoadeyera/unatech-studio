import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})
