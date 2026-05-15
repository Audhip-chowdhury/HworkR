/** Build WebSocket URL for company-scoped domain events (proxied in dev). */
export function companyWebSocketUrl(companyId: string, token: string): string {
  const backendBasePathRaw = (import.meta.env.VITE_BACKEND_BASE_PATH ?? '').trim()
  const backendBasePath =
    !backendBasePathRaw || backendBasePathRaw === '/'
      ? ''
      : backendBasePathRaw.startsWith('/')
        ? backendBasePathRaw.replace(/\/$/, '')
        : `/${backendBasePathRaw.replace(/\/$/, '')}`
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  return `${proto}//${host}${backendBasePath}/ws/companies/${companyId}?token=${encodeURIComponent(token)}`
}
