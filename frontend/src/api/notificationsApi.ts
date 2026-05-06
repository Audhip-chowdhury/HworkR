import { apiFetch } from './client'
import { companyPath } from './paths'

export type NotificationRow = {
  id: string
  company_id: string
  user_id: string
  type: string
  title: string
  message: string
  entity_type: string | null
  entity_id: string | null
  read: boolean
  context_json: Record<string, unknown> | null
  created_at: string
}

export function listNotifications(companyId: string) {
  return apiFetch<NotificationRow[]>(companyPath(companyId, '/notifications'))
}

/** Marks notifications read (omit ids to mark all unread for the current user in the company). */
export function markNotificationsRead(companyId: string, notificationIds?: string[]) {
  return apiFetch<void>(companyPath(companyId, '/notifications/mark-read'), {
    method: 'POST',
    json: { notification_ids: notificationIds ?? [] },
  })
}
