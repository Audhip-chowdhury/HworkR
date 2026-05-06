/** Extract YouTube video id from common URL shapes. */
export function youtubeVideoId(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null
  const s = url.trim()
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`)
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id || null
    }
    const v = u.searchParams.get('v')
    if (v) return v
    const m = u.pathname.match(/\/embed\/([^/?]+)/)
    if (m) return m[1]
    const m2 = u.pathname.match(/\/shorts\/([^/?]+)/)
    if (m2) return m2[1]
  } catch {
    const m = s.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{6,})/)
    return m ? m[1] : null
  }
  return null
}
