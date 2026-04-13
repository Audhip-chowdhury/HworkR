import { apiFetch } from './client'
import { companyPath } from './paths'

export type LeavePolicy = {
  id: string
  company_id: string
  type: string
  accrual_rules_json: Record<string, unknown> | null
  carry_forward_limit: number | null
  applicable_to_json: Record<string, unknown> | null
  created_at: string
}

export type LeaveRequest = {
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
}

export type LeaveBalance = {
  id: string
  company_id: string
  employee_id: string
  type: string
  balance: number
  year: number
}

export type AttendanceRecord = {
  id: string
  company_id: string
  employee_id: string
  date: string
  clock_in: string | null
  clock_out: string | null
  status: string | null
  created_at: string
}

export type Holiday = {
  id: string
  company_id: string
  location_id: string | null
  date: string
  name: string
  created_at: string
}

export function listLeavePolicies(companyId: string) {
  return apiFetch<LeavePolicy[]>(companyPath(companyId, '/leave/policies'))
}

export function createLeavePolicy(
  companyId: string,
  body: {
    type: string
    accrual_rules_json?: Record<string, unknown> | null
    carry_forward_limit?: number | null
    applicable_to_json?: Record<string, unknown> | null
  },
) {
  return apiFetch<LeavePolicy>(companyPath(companyId, '/leave/policies'), {
    method: 'POST',
    json: body,
  })
}

export function listLeaveRequests(companyId: string, params?: { employee_id?: string }) {
  const q = new URLSearchParams()
  if (params?.employee_id) q.set('employee_id', params.employee_id)
  const qs = q.toString()
  return apiFetch<LeaveRequest[]>(
    companyPath(companyId, '/leave/requests') + (qs ? `?${qs}` : ''),
  )
}

export function createLeaveRequest(
  companyId: string,
  body: { employee_id?: string | null; type: string; start_date: string; end_date: string; reason?: string | null },
) {
  return apiFetch<LeaveRequest>(companyPath(companyId, '/leave/requests'), {
    method: 'POST',
    json: body,
  })
}

export function decideLeaveRequest(
  companyId: string,
  requestId: string,
  body: { status: 'approved' | 'rejected'; reason?: string | null },
) {
  return apiFetch<LeaveRequest>(
    companyPath(companyId, `/leave/requests/${requestId}/decision`),
    { method: 'PATCH', json: body },
  )
}

export function listLeaveBalances(companyId: string, params?: { employee_id?: string; year?: number }) {
  const q = new URLSearchParams()
  if (params?.employee_id) q.set('employee_id', params.employee_id)
  if (params?.year != null) q.set('year', String(params.year))
  const qs = q.toString()
  return apiFetch<LeaveBalance[]>(
    companyPath(companyId, '/leave/balances') + (qs ? `?${qs}` : ''),
  )
}

export function upsertLeaveBalance(
  companyId: string,
  body: { employee_id: string; type: string; balance: number; year: number },
) {
  return apiFetch<LeaveBalance>(companyPath(companyId, '/leave/balances'), {
    method: 'POST',
    json: body,
  })
}

export function listAttendance(companyId: string, params?: { employee_id?: string; date?: string }) {
  const q = new URLSearchParams()
  if (params?.employee_id) q.set('employee_id', params.employee_id)
  if (params?.date) q.set('date', params.date)
  const qs = q.toString()
  return apiFetch<AttendanceRecord[]>(
    companyPath(companyId, '/attendance') + (qs ? `?${qs}` : ''),
  )
}

export function createAttendance(
  companyId: string,
  body: { employee_id: string; date: string; clock_in?: string | null; clock_out?: string | null; status?: string | null },
) {
  return apiFetch<AttendanceRecord>(companyPath(companyId, '/attendance'), {
    method: 'POST',
    json: body,
  })
}

export function listHolidays(companyId: string, params?: { location_id?: string }) {
  const q = new URLSearchParams()
  if (params?.location_id) q.set('location_id', params.location_id)
  const qs = q.toString()
  return apiFetch<Holiday[]>(
    companyPath(companyId, '/holiday-calendars') + (qs ? `?${qs}` : ''),
  )
}

export function createHoliday(
  companyId: string,
  body: { location_id?: string | null; date: string; name: string },
) {
  return apiFetch<Holiday>(companyPath(companyId, '/holiday-calendars'), {
    method: 'POST',
    json: body,
  })
}
