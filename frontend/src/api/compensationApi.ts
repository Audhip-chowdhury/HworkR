import { apiFetch } from './client'
import { companyPath } from './paths'

export type SalaryStructure = {
  id: string
  company_id: string
  employee_id: string
  components_json: Record<string, unknown> | null
  effective_from: string | null
  created_at: string
}

export type SalaryStructureCreate = {
  employee_id: string
  components_json?: Record<string, unknown> | null
  effective_from?: string | null
}

export type PayRun = {
  id: string
  company_id: string
  month: number
  year: number
  status: string
  processed_by: string | null
  processed_at: string | null
  created_at: string
}

export type PayRunCreate = {
  month: number
  year: number
  status?: string
}

export type PayRunUpdate = {
  status?: string
}

export type Payslip = {
  id: string
  pay_run_id: string
  company_id: string
  employee_id: string
  gross: number
  deductions_json: Record<string, unknown> | null
  net: number
  pdf_url: string | null
  created_at: string
}

export type PayslipCreate = {
  pay_run_id: string
  employee_id: string
  gross: number
  deductions_json?: Record<string, unknown> | null
  net: number
  pdf_url?: string | null
}

export type BenefitsPlan = {
  id: string
  company_id: string
  name: string
  type: string | null
  details_json: Record<string, unknown> | null
  enrollment_period: string | null
  created_at: string
}

export type BenefitsPlanCreate = {
  name: string
  type?: string | null
  details_json?: Record<string, unknown> | null
  enrollment_period?: string | null
}

export type BenefitsEnrollment = {
  id: string
  plan_id: string
  company_id: string
  employee_id: string
  dependents_json: Record<string, unknown> | null
  status: string
  created_at: string
}

export type BenefitsEnrollmentCreate = {
  plan_id: string
  employee_id: string
  dependents_json?: Record<string, unknown> | null
  status?: string
}

export type Survey = {
  id: string
  company_id: string
  title: string
  questions_json: unknown
  target_audience_json: Record<string, unknown> | null
  start_date: string | null
  end_date: string | null
  status: string
  created_at: string
}

export type SurveyCreate = {
  title: string
  questions_json?: unknown
  target_audience_json?: Record<string, unknown> | null
  start_date?: string | null
  end_date?: string | null
  status?: string
}

export type SurveyResponse = {
  id: string
  survey_id: string
  company_id: string
  employee_id: string
  answers_json: Record<string, unknown> | null
  submitted_at: string
}

export type SurveyResponseCreate = {
  survey_id: string
  employee_id: string
  answers_json?: Record<string, unknown> | null
}

export const listSalaryStructures = (companyId: string) =>
  apiFetch<SalaryStructure[]>(
    companyPath(companyId, '/payroll/salary-structures'),
  )
export const createSalaryStructure = (companyId: string, body: SalaryStructureCreate) =>
  apiFetch<SalaryStructure>(companyPath(companyId, '/payroll/salary-structures'), { method: 'POST', json: body })
export const listPayRuns = (companyId: string) =>
  apiFetch<PayRun[]>(
    companyPath(companyId, '/payroll/pay-runs'),
  )
export const createPayRun = (companyId: string, body: PayRunCreate) =>
  apiFetch<PayRun>(companyPath(companyId, '/payroll/pay-runs'), { method: 'POST', json: body })
export const updatePayRun = (companyId: string, payRunId: string, body: PayRunUpdate) =>
  apiFetch<PayRun>(companyPath(companyId, `/payroll/pay-runs/${payRunId}`), { method: 'PATCH', json: body })
export const listPayslips = (companyId: string, employee_id?: string, pay_run_id?: string) => {
  const q = new URLSearchParams()
  if (employee_id) q.set('employee_id', employee_id)
  if (pay_run_id) q.set('pay_run_id', pay_run_id)
  return apiFetch<Payslip[]>(
    companyPath(companyId, `/payroll/payslips${q.toString() ? `?${q.toString()}` : ''}`),
  )
}
export const createPayslip = (companyId: string, body: PayslipCreate) =>
  apiFetch<Payslip>(companyPath(companyId, '/payroll/payslips'), { method: 'POST', json: body })
export const listBenefitsPlans = (companyId: string) =>
  apiFetch<BenefitsPlan[]>(companyPath(companyId, '/benefits/plans'))
export const createBenefitsPlan = (companyId: string, body: BenefitsPlanCreate) =>
  apiFetch<BenefitsPlan>(companyPath(companyId, '/benefits/plans'), { method: 'POST', json: body })
export const listBenefitsEnrollments = (companyId: string, employee_id?: string) =>
  apiFetch<BenefitsEnrollment[]>(
    companyPath(companyId, `/benefits/enrollments${employee_id ? `?employee_id=${encodeURIComponent(employee_id)}` : ''}`),
  )
export const createBenefitsEnrollment = (companyId: string, body: BenefitsEnrollmentCreate) =>
  apiFetch<BenefitsEnrollment>(companyPath(companyId, '/benefits/enrollments'), { method: 'POST', json: body })
export const listSurveys = (companyId: string) =>
  apiFetch<Survey[]>(companyPath(companyId, '/engagement/surveys'))
export const createSurvey = (companyId: string, body: SurveyCreate) =>
  apiFetch<Survey>(companyPath(companyId, '/engagement/surveys'), { method: 'POST', json: body })
export const listSurveyResponses = (companyId: string, survey_id?: string) =>
  apiFetch<SurveyResponse[]>(
    companyPath(companyId, `/engagement/survey-responses${survey_id ? `?survey_id=${encodeURIComponent(survey_id)}` : ''}`),
  )
export const createSurveyResponse = (companyId: string, body: SurveyResponseCreate) =>
  apiFetch<SurveyResponse>(companyPath(companyId, '/engagement/survey-responses'), { method: 'POST', json: body })
