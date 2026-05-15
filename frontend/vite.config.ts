import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function normalizeBasePath(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed || trimmed === '/') return '/'
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

function normalizePrefixPath(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed || trimmed === '/') return ''
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash
}

function joinPath(prefix: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (!prefix) return normalizedPath
  return `${prefix}${normalizedPath}`.replace(/\/{2,}/g, '/')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  // Must match the port you pass to uvicorn. Default 8080 avoids WinError 10013 on some Windows setups (port 8000 is often reserved/blocked).
  const apiOrigin = new URL(env.VITE_API_ORIGIN ?? 'http://127.0.0.1:8080')
  const proxyTarget = `${apiOrigin.protocol}//${apiOrigin.host}`
  const upstreamPathPrefix = normalizePrefixPath(apiOrigin.pathname)
  const backendPathPrefix = normalizePrefixPath(env.VITE_BACKEND_BASE_PATH)
  const frontendBasePath = normalizeBasePath(env.VITE_FRONTEND_BASE_PATH)
  const rewriteToTarget = (path: string) => joinPath(upstreamPathPrefix, path)

  return {
    base: frontendBasePath,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        [joinPath(backendPathPrefix, '/ws')]: {
          target: proxyTarget,
          ws: true,
          changeOrigin: true,
          rewrite: rewriteToTarget,
        },
        [joinPath(backendPathPrefix, '/api')]: {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: rewriteToTarget,
        },
        [joinPath(backendPathPrefix, '/health')]: {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: rewriteToTarget,
        },
        [joinPath(backendPathPrefix, '/uploads')]: {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: rewriteToTarget,
        },
      },
    },
  }
})
