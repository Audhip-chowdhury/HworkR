import { getToken } from './client'
import { companyPath } from './paths'

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1'

export async function downloadExport(
  companyId: string,
  relativePath: string,
  filename: string,
): Promise<void> {
  const token = getToken()
  const res = await fetch(`${API_BASE}${companyPath(companyId, relativePath)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    let msg = res.statusText
    try {
      const j = (await res.json()) as { detail?: string }
      if (j.detail) msg = j.detail
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
