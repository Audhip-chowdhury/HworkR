import { apiFetch } from './client'
import { companyPath } from './paths'

export type Department = {
  id: string
  company_id: string
  name: string
  parent_id: string | null
  head_employee_id: string | null
  level: number
  created_at: string
}

export type Position = {
  id: string
  company_id: string
  name: string
  department_id: string | null
  department_name: string | null
  bucket: string
  grade: number
  reports_to_id: string | null
  works_with_id: string | null
  created_at: string
}

export const listDepartments = (companyId: string) =>
  apiFetch<Department[]>(companyPath(companyId, '/departments'))

/** Org chart positions; pass departmentId to restrict to that department. */
export const listPositions = (companyId: string, departmentId?: string) => {
  const q = departmentId ? `?department_id=${encodeURIComponent(departmentId)}` : ''
  return apiFetch<Position[]>(companyPath(companyId, `/positions${q}`))
}

export type PositionUpdate = {
  name?: string
  department_id?: string | null
  bucket?: 'none' | 'c_suite' | 'temporary'
  grade?: number
  reports_to_id?: string | null
  works_with_id?: string | null
}

export const updatePosition = (companyId: string, positionId: string, body: PositionUpdate) =>
  apiFetch<Position>(companyPath(companyId, `/positions/${positionId}`), { method: 'PATCH', json: body })
