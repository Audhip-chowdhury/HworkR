import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function normalizeBasePath(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed || trimmed === '/') return '/'
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const frontendBasePath = normalizeBasePath(env.VITE_FRONTEND_BASE_PATH)

  return {
    base: frontendBasePath,
    plugins: [react()],
    server: {
      port: 5173,
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'hworkr.audhip-projects.com',
        '.audhip-projects.com',
      ],
    },
    preview: {
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'hworkr.audhip-projects.com',
        '.audhip-projects.com',
      ],
    },
  }
})
