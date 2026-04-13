import { apiFetch } from './client'
import { companyPath } from './paths'
import type { ActivityLog, ScoreDashboard, ScoringRule } from './types'

export function getScoreDashboard(companyId: string) {
  return apiFetch<ScoreDashboard>(companyPath(companyId, '/tracking/dashboard/score'))
}

export function getRecentActivity(companyId: string, limit = 20) {
  return apiFetch<ActivityLog[]>(
    companyPath(companyId, `/tracking/dashboard/recent-activity?limit=${limit}`),
  )
}

export function createActivityLog(
  companyId: string,
  body: {
    module: string
    action_type: string
    action_detail?: string | null
    entity_type?: string | null
    entity_id?: string | null
    quality_factors?: Record<string, unknown> | null
    context_json?: Record<string, unknown> | null
    session_id?: string | null
    reference_started_at?: string | null
  },
) {
  return apiFetch<ActivityLog>(companyPath(companyId, '/tracking/activity-logs'), {
    method: 'POST',
    json: body,
  })
}

export function listActivityLogs(
  companyId: string,
  params?: { user_id?: string; module?: string; limit?: number },
) {
  const q = new URLSearchParams()
  if (params?.user_id) q.set('user_id', params.user_id)
  if (params?.module) q.set('module', params.module)
  if (params?.limit != null) q.set('limit', String(params.limit))
  const qs = q.toString()
  return apiFetch<ActivityLog[]>(
    companyPath(companyId, '/tracking/activity-logs') + (qs ? `?${qs}` : ''),
  )
}

export function listScoringRules(companyId: string) {
  return apiFetch<ScoringRule[]>(companyPath(companyId, '/tracking/scoring-rules'))
}

export function createScoringRule(
  companyId: string,
  body: {
    module: string
    action_type: string
    sla_seconds?: number | null
    weight_completeness?: number
    weight_accuracy?: number
    weight_timeliness?: number
    weight_process?: number
    criteria_json?: Record<string, unknown> | null
  },
) {
  return apiFetch<ScoringRule>(companyPath(companyId, '/tracking/scoring-rules'), {
    method: 'POST',
    json: body,
  })
}
