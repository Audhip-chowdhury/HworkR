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

export type EmployeeDocumentRow = {
  id: string
  doc_type: string
  status: string
  file_url: string | null
  notes: string | null
  meta_json: Record<string, unknown> | null
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export type EmployeeSummary = {
  id: string
  employee_code: string
  display_name: string
  display_email: string
  status: string
}

export type WorksWithPeer = {
  employee_id: string
  employee_code: string
  display_name: string
  display_email: string
  position_id: string
  position_name: string
  grade: number
}

export type EmployeeDetail = Employee & {
  display_name: string
  display_email: string
  department_name: string | null
  job_title: string | null
  job_grade: string | null
  manager_name: string | null
  location_name: string | null
  documents: EmployeeDocumentRow[]
}

export function listEmployeeSummaries(companyId: string) {
  return apiFetch<EmployeeSummary[]>(companyPath(companyId, '/employees/summary'))
}

export function getEmployeeDetail(companyId: string, employeeId: string) {
  return apiFetch<EmployeeDetail>(companyPath(companyId, `/employees/${employeeId}/detail`))
}

export function patchEmployeeDocument(
  companyId: string,
  employeeId: string,
  docType: string,
  body: { status?: 'missing' | 'submitted'; file_url?: string | null; notes?: string | null },
) {
  return apiFetch<EmployeeDocumentRow>(
    companyPath(companyId, `/employees/${employeeId}/documents/${encodeURIComponent(docType)}`),
    { method: 'PATCH', json: body },
  )
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

export function listMyDirectReports(companyId: string) {
  return apiFetch<Employee[]>(companyPath(companyId, '/employees/my-direct-reports'))
}

export function listMyWorksWithPeers(companyId: string) {
  return apiFetch<WorksWithPeer[]>(companyPath(companyId, '/employees/me/works-with-peers'))
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

export function listMyEmployeeDocuments(companyId: string) {
  return apiFetch<EmployeeDocumentRow[]>(companyPath(companyId, '/employees/me/documents'))
}

export function uploadMyEmployeeDocument(companyId: string, docType: string, file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return apiFetch<EmployeeDocumentRow>(
    companyPath(companyId, `/employees/me/documents/${encodeURIComponent(docType)}/upload`),
    { method: 'POST', body: fd },
  )
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
