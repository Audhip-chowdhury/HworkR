import { apiFetch } from './client'
import { companyPath } from './paths'

export type AnalyticsDashboard = {
  headcount: {
    total: number
    active: number
    by_status: Record<string, number>
    by_department: Array<{ department_id: string; department: string; count: number }>
    by_location: Array<{ location_id: string; location: string; count: number }>
    by_grade: Array<{ grade: string; count: number }>
    hires_last_12_months: number
    new_hires_trend_monthly: Array<{ month: string; count: number }>
  }
  attrition: {
    separated_headcount: number
    attrition_rate_percent: number | null
    note: string
  }
  diversity: {
    gender: Record<string, number> | null
    note: string
  }
  recruitment: {
    open_postings: number
    applications: number
    offers: number
    accepted_offers: number
    avg_time_to_fill_days: number | null
    median_time_to_fill_days: number | null
    avg_cost_per_hire: number | null
    pipeline_by_stage: Array<{ stage: string; count: number }>
    applications_trend_monthly: Array<{ month: string; count: number }>
  }
  leave: {
    pending_requests: number
    approved_requests: number
    by_type: Array<{ type: string; requests: number; approx_calendar_days: number }>
    balance_by_type_year: Array<{ type: string; total_balance: number }>
    year: number
  }
  learning: {
    training_assignments: number
    training_completions: number
    completion_rate_percent: number | null
    completion_by_course: Array<{ course: string; completions: number }>
  }
  payroll: {
    latest_run: {
      id: string
      year: number
      month: number
      status: string
      run_label: string | null
      run_kind: string
    } | null
    totals: { gross: number; net: number; payslip_count: number } | null
    earnings_breakdown: Array<{ component: string; amount: number }>
    deductions_breakdown: Array<{ component: string; amount: number }>
  }
}

export function getAnalyticsDashboard(companyId: string) {
  return apiFetch<AnalyticsDashboard>(companyPath(companyId, '/analytics/dashboard'))
}
