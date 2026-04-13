import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Must match the port you pass to uvicorn. Default 8080 avoids WinError 10013 on some Windows setups (port 8000 is often reserved/blocked).
const API_ORIGIN = process.env.VITE_API_ORIGIN ?? 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: API_ORIGIN,
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: API_ORIGIN,
        changeOrigin: true,
      },
      '/health': {
        target: API_ORIGIN,
        changeOrigin: true,
      },
      '/uploads': {
        target: API_ORIGIN,
        changeOrigin: true,
      },
    },
  },
})
