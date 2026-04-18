import { apiFetch } from './client'
import { companyPath } from './paths'

export type HolidayRow = {
  id: string
  company_id: string
  location_id: string | null
  date: string
  name: string
  created_at: string
}

export type LeaveRequestRow = {
  id: string
  company_id: string
  employee_id: string
  type: string
  start_date: string
  end_date: string
  reason: string | null
  status: string
  approved_by: string | null
  created_at: string
  updated_at: string
  employee_display_name: string | null
  employee_code: string | null
}

export type LeaveTypeSummary = {
  type: string
  allocated: number
  used: number
  pending: number
  remaining: number
}

export type LeaveYearSummary = {
  year: number
  types: LeaveTypeSummary[]
}

export function listHolidays(companyId: string) {
  return apiFetch<HolidayRow[]>(companyPath(companyId, '/holiday-calendars'))
}

export function listLeaveRequests(companyId: string, employeeId?: string) {
  const q = employeeId ? `?employee_id=${encodeURIComponent(employeeId)}` : ''
  return apiFetch<LeaveRequestRow[]>(companyPath(companyId, `/leave/requests${q}`))
}

export function getLeaveSummary(companyId: string, year?: number, forEmployeeId?: string) {
  const p = new URLSearchParams()
  if (year != null) p.set('year', String(year))
  if (forEmployeeId) p.set('for_employee_id', forEmployeeId)
  const qs = p.toString()
  return apiFetch<LeaveYearSummary>(companyPath(companyId, `/leave/summary${qs ? `?${qs}` : ''}`))
}

export function createLeaveRequest(
  companyId: string,
  body: { employee_id?: string | null; type: string; start_date: string; end_date: string; reason?: string | null },
) {
  return apiFetch<LeaveRequestRow>(companyPath(companyId, '/leave/requests'), {
    method: 'POST',
    json: body,
  })
}

export function decideLeaveRequest(
  companyId: string,
  requestId: string,
  body: { status: 'approved' | 'rejected'; reason?: string | null },
) {
  return apiFetch<LeaveRequestRow>(
    companyPath(companyId, `/leave/requests/${encodeURIComponent(requestId)}/decision`),
    { method: 'PATCH', json: body },
  )
}
