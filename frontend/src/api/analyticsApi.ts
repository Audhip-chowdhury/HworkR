import { apiFetch } from './client'
import { companyPath } from './paths'

export type AnalyticsDashboard = {
  headcount: {
    total: number
    active: number
    by_department: Array<{ department_id: string; department: string; count: number }>
  }
  recruitment: { open_postings: number; applications: number; offers: number }
  leave: { pending_requests: number }
  learning: {
    training_assignments: number
    training_completions: number
    completion_rate_percent: number | null
  }
}

export function getAnalyticsDashboard(companyId: string) {
  return apiFetch<AnalyticsDashboard>(companyPath(companyId, '/analytics/dashboard'))
}
