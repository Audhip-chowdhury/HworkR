import { apiFetch, API_BASE, getToken } from './client'
import { companyPath } from './paths'

export type MemberSearchHit = {
  user_id: string
  name: string
  email: string
}

export type AuditCategoryOption = {
  id: string
  label: string
}

export type TrailEntry = {
  source: 'activity' | 'audit'
  id: string
  at: string
  user_id: string
  category: string
  category_label: string
  screen: string
  action: string
  detail: string | null
  extra: Record<string, unknown> | null
}

export type PolicyDocumentRow = {
  id: string
  company_id: string
  title: string
  description: string | null
  file_name: string
  created_by: string
  created_at: string
  /** HR only; null for employees */
  acknowledgment_count: number | null
  member_count: number | null
  acknowledged_by_me: boolean
}

export type PolicyAckMember = {
  user_id: string
  name: string
  email: string
  acknowledged: boolean
  acknowledged_at: string | null
}

export type PolicyAckDetailResponse = {
  items: PolicyAckMember[]
  total: number
  offset: number
  limit: number
}

export function searchAuditMembers(companyId: string, q: string) {
  const qs = new URLSearchParams({ q })
  return apiFetch<MemberSearchHit[]>(companyPath(companyId, `/audits/members/search?${qs}`))
}

export function listTrailCategories(companyId: string) {
  return apiFetch<AuditCategoryOption[]>(companyPath(companyId, '/audits/trail/categories'))
}

export type TrailQuery = {
  userId?: string
  category?: string
  fromDate?: string
  toDate?: string
}

export function listAuditTrail(companyId: string, q: TrailQuery) {
  const p = new URLSearchParams()
  if (q.userId) p.set('user_id', q.userId)
  if (q.category) p.set('category', q.category)
  if (q.fromDate) p.set('from_date', q.fromDate)
  if (q.toDate) p.set('to_date', q.toDate)
  const qs = p.toString()
  return apiFetch<TrailEntry[]>(companyPath(companyId, `/audits/trail${qs ? `?${qs}` : ''}`))
}

export function listPolicies(companyId: string) {
  return apiFetch<PolicyDocumentRow[]>(companyPath(companyId, '/audits/policies'))
}

const DEFAULT_ACK_PAGE = 50

export function getPolicyAcknowledgmentDetail(
  companyId: string,
  policyId: string,
  params: { q: string; offset?: number; limit?: number },
) {
  const p = new URLSearchParams()
  p.set('q', params.q)
  p.set('offset', String(params.offset ?? 0))
  p.set('limit', String(params.limit ?? DEFAULT_ACK_PAGE))
  return apiFetch<PolicyAckDetailResponse>(
    companyPath(companyId, `/audits/policies/${policyId}/acknowledgment-detail?${p.toString()}`),
  )
}

export function createPolicy(companyId: string, title: string, description: string | null, file: File) {
  const fd = new FormData()
  fd.append('title', title)
  if (description) fd.append('description', description)
  fd.append('file', file)
  return apiFetch<PolicyDocumentRow>(companyPath(companyId, '/audits/policies'), {
    method: 'POST',
    body: fd,
  })
}

export function acknowledgePolicy(companyId: string, policyId: string) {
  return apiFetch<PolicyDocumentRow>(companyPath(companyId, `/audits/policies/${policyId}/acknowledge`), {
    method: 'POST',
  })
}

/** Opens browser download with auth (policy file). */
export async function downloadPolicyBlob(companyId: string, policyId: string, fileName: string): Promise<void> {
  const path = companyPath(companyId, `/audits/policies/${policyId}/download`)
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const err = (await res.json()) as { detail?: string }
      if (typeof err.detail === 'string') detail = err.detail
    } catch {
      /* ignore */
    }
    throw new Error(detail || `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName || 'policy'
  a.click()
  URL.revokeObjectURL(url)
}
