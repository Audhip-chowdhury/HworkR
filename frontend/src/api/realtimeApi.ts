/** Build WebSocket URL for company-scoped domain events (proxied in dev). */
export function companyWebSocketUrl(companyId: string, token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  return `${proto}//${host}/ws/companies/${companyId}?token=${encodeURIComponent(token)}`
}
