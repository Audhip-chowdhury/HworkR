import { apiFetch } from './client'
import { companyPath } from './paths'
import type { WebhookSubscription } from './types'

export function listWebhookSubscriptions(companyId: string) {
  return apiFetch<WebhookSubscription[]>(companyPath(companyId, '/webhooks/subscriptions'))
}

export function createWebhookSubscription(
  companyId: string,
  body: { url: string; secret: string; events?: string[] | null; is_active?: boolean },
) {
  return apiFetch<WebhookSubscription>(companyPath(companyId, '/webhooks/subscriptions'), {
    method: 'POST',
    json: body,
  })
}

export function patchWebhookSubscription(
  companyId: string,
  subscriptionId: string,
  body: {
    url?: string
    secret?: string
    events?: string[] | null
    is_active?: boolean
  },
) {
  return apiFetch<WebhookSubscription>(
    companyPath(companyId, `/webhooks/subscriptions/${subscriptionId}`),
    { method: 'PATCH', json: body },
  )
}

export function testWebhookSubscription(
  companyId: string,
  subscriptionId: string,
  body: { event_type?: string; data?: Record<string, unknown> | null },
) {
  return apiFetch<void>(
    companyPath(companyId, `/webhooks/subscriptions/${subscriptionId}/test`),
    { method: 'POST', json: body },
  )
}
