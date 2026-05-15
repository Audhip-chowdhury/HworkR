/** Build WebSocket URL for company-scoped domain events (proxied in dev). */
export function companyWebSocketUrl(companyId: string, token: string): string {
  const apiBaseRaw = (import.meta.env.VITE_API_BASE ?? '').trim()
  if (apiBaseRaw) {
    const apiUrl = new URL(apiBaseRaw, window.location.origin)
    const wsProto = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    const basePath = apiUrl.pathname.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '')
    return `${wsProto}//${apiUrl.host}${basePath}/ws/companies/${companyId}?token=${encodeURIComponent(token)}`
  }

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  return `${proto}//${host}/ws/companies/${companyId}?token=${encodeURIComponent(token)}`
}
