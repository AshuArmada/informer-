import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}
const contentPolicy = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://avatars.githubusercontent.com data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    strictPort: true,
    headers: { ...securityHeaders, 'Content-Security-Policy': `${contentPolicy}; script-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:5173 ws://localhost:5173` },
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  preview: {
    host: '127.0.0.1',
    strictPort: true,
    headers: { ...securityHeaders, 'Content-Security-Policy': `${contentPolicy}; script-src 'self'; connect-src 'self'` },
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
