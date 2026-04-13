import { apiFetch } from './client'

export type MembershipRow = {
  id: string
  user_id: string
  company_id: string
  role: string
  status: string
  modules_access_json: Record<string, unknown> | null
}

export function listMembers(companyId: string) {
  return apiFetch<MembershipRow[]>(`/companies/${companyId}/members`)
}

export function inviteMember(
  companyId: string,
  body: { email: string; role: string; name?: string | null; password?: string | null },
) {
  return apiFetch<MembershipRow>(`/companies/${companyId}/members/invite`, {
    method: 'POST',
    json: body,
  })
}

export function updateMemberRole(companyId: string, targetUserId: string, role: string) {
  return apiFetch<MembershipRow>(`/companies/${companyId}/members/${targetUserId}/role`, {
    method: 'PATCH',
    json: { role },
  })
}

export function deactivateMember(companyId: string, targetUserId: string) {
  return apiFetch<MembershipRow>(`/companies/${companyId}/members/${targetUserId}/deactivate`, {
    method: 'POST',
  })
}
