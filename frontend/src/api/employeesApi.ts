import { apiFetch } from './client'
import { companyPath } from './paths'

export type Employee = {
  id: string
  company_id: string
  user_id: string | null
  employee_code: string
  department_id: string | null
  job_id: string | null
  position_id: string | null
  manager_id: string | null
  location_id: string | null
  status: string
  hire_date: string | null
  personal_info_json: Record<string, unknown> | null
  documents_json: Record<string, unknown> | null
  onboarding_checklist_json: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type LifecycleEvent = {
  id: string
  company_id: string
  employee_id: string
  event_type: string
  effective_date: string | null
  payload_json: Record<string, unknown> | null
  status: string
  notes: string | null
  created_by: string | null
  created_at: string
}

export function listEmployees(companyId: string) {
  return apiFetch<Employee[]>(companyPath(companyId, '/employees'))
}

export function getEmployee(companyId: string, employeeId: string) {
  return apiFetch<Employee>(companyPath(companyId, `/employees/${employeeId}`))
}

export function getMyEmployee(companyId: string) {
  return apiFetch<Employee>(companyPath(companyId, '/employees/me'))
}

export function createEmployee(
  companyId: string,
  body: {
    user_id?: string | null
    employee_code: string
    department_id?: string | null
    job_id?: string | null
    position_id?: string | null
    manager_id?: string | null
    location_id?: string | null
    status?: string
    hire_date?: string | null
    personal_info_json?: Record<string, unknown> | null
    documents_json?: Record<string, unknown> | null
    onboarding_checklist_json?: Record<string, unknown> | null
  },
) {
  return apiFetch<Employee>(companyPath(companyId, '/employees'), { method: 'POST', json: body })
}

export function updateEmployee(
  companyId: string,
  employeeId: string,
  body: Partial<{
    user_id: string | null
    employee_code: string
    department_id: string | null
    job_id: string | null
    position_id: string | null
    manager_id: string | null
    location_id: string | null
    status: string
    hire_date: string | null
    personal_info_json: Record<string, unknown> | null
    documents_json: Record<string, unknown> | null
    onboarding_checklist_json: Record<string, unknown> | null
  }>,
) {
  return apiFetch<Employee>(companyPath(companyId, `/employees/${employeeId}`), {
    method: 'PATCH',
    json: body,
  })
}

export function patchMyEmployee(
  companyId: string,
  body: { personal_info_json?: Record<string, unknown> | null; documents_json?: Record<string, unknown> | null },
) {
  return apiFetch<Employee>(companyPath(companyId, '/employees/me'), { method: 'PATCH', json: body })
}

export function updateOnboardingChecklist(
  companyId: string,
  employeeId: string,
  onboarding_checklist_json: Record<string, unknown>,
) {
  return apiFetch<Employee>(companyPath(companyId, `/employees/${employeeId}/onboarding`), {
    method: 'PATCH',
    json: { onboarding_checklist_json },
  })
}

export function listLifecycleEvents(companyId: string, employeeId: string) {
  return apiFetch<LifecycleEvent[]>(
    companyPath(companyId, `/employees/${employeeId}/lifecycle-events`),
  )
}

export function createLifecycleEvent(
  companyId: string,
  employeeId: string,
  body: {
    event_type: string
    effective_date?: string | null
    payload_json?: Record<string, unknown> | null
    status?: string
    notes?: string | null
  },
) {
  return apiFetch<LifecycleEvent>(companyPath(companyId, `/employees/${employeeId}/lifecycle-events`), {
    method: 'POST',
    json: body,
  })
}
