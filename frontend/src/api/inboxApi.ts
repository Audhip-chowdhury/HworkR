import { apiFetch } from './client'
import { companyPath } from './paths'

export type InboxTask = {
  id: string
  company_id: string
  user_id: string
  type: string
  title: string
  entity_type: string | null
  entity_id: string | null
  priority: string
  status: string
  due_at: string | null
  context_json: Record<string, unknown> | null
  created_at: string
}

export function listInboxTasks(companyId: string) {
  return apiFetch<InboxTask[]>(companyPath(companyId, '/inbox/tasks'))
}
