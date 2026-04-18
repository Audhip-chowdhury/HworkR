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

export type SalaryStructureUpdate = {
  components_json?: Record<string, unknown> | null
  effective_from?: string | null
}

export type SalaryStructureAuditEntry = {
  id: string
  entity_id: string
  action: string
  changes_json: Record<string, unknown> | null
  user_id: string | null
  user_name: string | null
  user_email: string | null
  timestamp: string
}

/** Company pay band row (canonical min–mid–max annual); not the same as org Position.grade. */
export type CompensationGradeBand = {
  id: string
  company_id: string
  band_code: string
  display_name: string | null
  min_annual: number
  mid_annual: number
  max_annual: number
  currency_code: string
  effective_from: string
  effective_to: string | null
  notes: string | null
  org_position_grade_min: number | null
  org_position_grade_max: number | null
  created_at: string
  updated_at: string
}

export type CompensationGradeBandCreate = {
  band_code: string
  display_name?: string | null
  min_annual: number
  mid_annual: number
  max_annual: number
  currency_code?: string
  effective_from: string
  effective_to?: string | null
  notes?: string | null
  org_position_grade_min?: number | null
  org_position_grade_max?: number | null
}

export type CompensationGradeBandUpdate = Partial<CompensationGradeBandCreate>

export type GradeBandAuditEntry = {
  id: string
  entity_id: string
  action: string
  changes_json: Record<string, unknown> | null
  user_id: string | null
  user_name: string | null
  user_email: string | null
  timestamp: string
}

export type PayRunRunKind = 'regular' | 'off_cycle' | 'supplemental'

export type PayRun = {
  id: string
  company_id: string
  department_id: string | null
  department_name: string | null
  month: number
  year: number
  status: string
  processed_by: string | null
  processed_at: string | null
  created_at: string
  run_kind?: PayRunRunKind | string
  pay_date?: string | null
  run_label?: string | null
}

export type PayRunCreate = {
  month: number
  year: number
  status?: string
  department_id?: string | null
  run_kind?: PayRunRunKind | string
  pay_date?: string | null
  run_label?: string | null
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
  earnings_json: Record<string, unknown> | null
  deductions_json: Record<string, unknown> | null
  net: number
  pdf_url: string | null
  created_at: string
}

export type PayslipCreate = {
  pay_run_id: string
  employee_id: string
  gross: number
  earnings_json?: Record<string, unknown> | null
  deductions_json?: Record<string, unknown> | null
  net: number
  pdf_url?: string | null
}

/** SimCash payroll form / engine field ids (must match backend simcash_engine.FIELD_KEYS) */
export const SIMCASH_FORM_FIELDS = [
  'basic',
  'hra',
  'conveyance',
  'medical',
  'lta',
  'special_allowance',
  'performance_bonus',
  'gross',
  'pf_employee',
  'esi_employee',
  'professional_tax',
  'tds',
  'loan_recovery',
  'leave_deduction',
  'other_deductions',
  'total_deductions',
  'net',
] as const

export type SimCashFormField = (typeof SIMCASH_FORM_FIELDS)[number]

export type PayrollValidateCalculationIn = {
  employee_id: string
  pay_run_id?: string | null
  submitted: Partial<Record<SimCashFormField, number | string | null | undefined>> &
    Record<string, number | string | null | undefined>
}

export type PayrollValidateCalculationOut = {
  fields: Record<string, { ok: boolean }>
  all_match: boolean
  expected?: Record<string, number> | null
  employer_expected?: Record<string, number> | null
}

/** GET /payroll/engine-expected — monthly engine preview for worksheet watermark */
export type PayrollEngineExpectedOut = {
  expected: Record<string, number>
  employer_expected: Record<string, number>
}

export type CompensationReviewCycleState = 'draft' | 'open' | 'closed'

export type CompensationReviewCycle = {
  id: string
  company_id: string
  label: string
  fiscal_year: string
  state: CompensationReviewCycleState | string
  budget_amount: number | null
  budget_currency: string
  effective_from_default: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type CompensationReviewCycleCreate = {
  label: string
  fiscal_year: string
  state?: CompensationReviewCycleState
  budget_amount?: number | null
  budget_currency?: string
  effective_from_default?: string | null
  notes?: string | null
}

export type CompensationReviewCycleUpdate = {
  label?: string | null
  fiscal_year?: string | null
  state?: CompensationReviewCycleState | null
  budget_amount?: number | null
  budget_currency?: string | null
  effective_from_default?: string | null
  notes?: string | null
}

export type CompensationReviewGuideline = {
  id: string
  cycle_id: string
  band_code: string
  min_increase_pct: number
  max_increase_pct: number
  merit_pool_weight: number | null
  notes: string | null
  created_at: string
}

export type CompensationReviewGuidelineCreate = {
  band_code: string
  min_increase_pct: number
  max_increase_pct: number
  merit_pool_weight?: number | null
  notes?: string | null
}

export type CompensationReviewGuidelineUpdate = {
  min_increase_pct?: number | null
  max_increase_pct?: number | null
  merit_pool_weight?: number | null
  notes?: string | null
}

export type CompensationReviewProposal = {
  id: string
  cycle_id: string
  employee_id: string
  current_ctc_annual: number
  proposed_ctc_annual: number
  band_code: string | null
  justification: string | null
  status: string
  submitted_at: string | null
  approved_by_user_id: string | null
  approved_at: string | null
  rejected_reason: string | null
  applied_structure_id: string | null
  applied_at: string | null
  created_at: string
  updated_at: string
}

export type CompensationReviewProposalCreate = {
  employee_id: string
  proposed_ctc_annual: number
  band_code?: string | null
  justification?: string | null
}

export type CompensationReviewProposalUpdate = {
  proposed_ctc_annual?: number | null
  band_code?: string | null
  justification?: string | null
}

export type CompensationReviewBudgetSummary = {
  cycle_id: string
  budget_amount: number | null
  budget_currency: string
  approved_increase_total: number
  submitted_increase_total: number
  approved_count: number
  submitted_pending_count: number
}

export type PayrollLedgerEntry = {
  id: string
  company_id: string
  employee_id: string
  pay_run_id: string
  payslip_id: string
  entry_kind: string
  direction: string
  amount: number
  currency_code: string
  metadata_json: Record<string, unknown> | null
  created_at: string
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
  mandatory?: boolean
}

export type BenefitsPlanUpdate = {
  name?: string
  type?: string | null
  details_json?: Record<string, unknown> | null
  enrollment_period?: string | null
  mandatory?: boolean | null
}

export type BenefitsEnrollment = {
  id: string
  plan_id: string
  company_id: string
  employee_id: string
  dependents_json: Record<string, unknown> | null
  status: string
  created_at: string
  updated_at?: string | null
}

export type BenefitsEnrollmentCreate = {
  plan_id: string
  employee_id: string
  dependents_json?: Record<string, unknown> | null
  status?: string
}

export type BenefitsEnrollmentUpdate = {
  status?: string
  dependents_json?: Record<string, unknown> | null
}

export type BenefitsPlanEnrollmentCounts = {
  plan_id: string
  plan_name: string
  active_count: number
  cancelled_count: number
}

export type BenefitsEnrollmentSummary = {
  company_employee_count: number
  employees_with_active_enrollment: number
  plans: BenefitsPlanEnrollmentCounts[]
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
  survey_type?: string | null
  created_at: string
}

export type SurveyCreate = {
  title: string
  questions_json?: unknown
  target_audience_json?: Record<string, unknown> | null
  start_date?: string | null
  end_date?: string | null
  status?: string
  survey_type?: string | null
}

export type SurveyUpdate = {
  title?: string
  questions_json?: unknown
  target_audience_json?: Record<string, unknown> | null
  start_date?: string | null
  end_date?: string | null
  status?: string
  survey_type?: string | null
}

export type ParticipantScope = 'all' | 'department' | 'grade' | 'individual'

export type SurveyActionPlan = {
  id: string
  survey_id: string
  company_id: string
  title: string
  description: string | null
  assignee_employee_id: string | null
  owner_department_id: string | null
  participant_scope: ParticipantScope | string
  participant_filter_json: Record<string, unknown> | null
  due_date: string | null
  status: string
  created_by: string | null
  created_at: string
}

export type SurveyActionPlanCreate = {
  title: string
  description?: string | null
  assignee_employee_id?: string | null
  owner_department_id: string
  participant_scope?: ParticipantScope
  participant_filter_json?: Record<string, unknown> | null
  due_date?: string | null
  status?: string
}

export type SurveyActionPlanUpdate = {
  title?: string
  description?: string | null
  assignee_employee_id?: string | null
  owner_department_id?: string | null
  participant_scope?: ParticipantScope
  participant_filter_json?: Record<string, unknown> | null
  due_date?: string | null
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

export type SurveyTemplateQuestion = {
  id: string
  text: string
  type: 'rating_1_5' | 'yes_no' | 'text'
  required?: boolean
}

export type SurveyTemplate = {
  id: string
  title: string
  survey_type: string | null
  questions: SurveyTemplateQuestion[]
}

export const listSalaryStructures = (companyId: string) =>
  apiFetch<SalaryStructure[]>(
    companyPath(companyId, '/payroll/salary-structures'),
  )
export const createSalaryStructure = (companyId: string, body: SalaryStructureCreate) =>
  apiFetch<SalaryStructure>(companyPath(companyId, '/payroll/salary-structures'), { method: 'POST', json: body })
export const updateSalaryStructure = (companyId: string, structureId: string, body: SalaryStructureUpdate) =>
  apiFetch<SalaryStructure>(companyPath(companyId, `/payroll/salary-structures/${structureId}`), {
    method: 'PATCH',
    json: body,
  })
export const listSalaryStructureAudit = (companyId: string) =>
  apiFetch<SalaryStructureAuditEntry[]>(companyPath(companyId, '/payroll/salary-structures/audit'))

export const listGradeBands = (companyId: string) =>
  apiFetch<CompensationGradeBand[]>(companyPath(companyId, '/payroll/grade-bands'))
export const createGradeBand = (companyId: string, body: CompensationGradeBandCreate) =>
  apiFetch<CompensationGradeBand>(companyPath(companyId, '/payroll/grade-bands'), { method: 'POST', json: body })
export const updateGradeBand = (companyId: string, bandId: string, body: CompensationGradeBandUpdate) =>
  apiFetch<CompensationGradeBand>(companyPath(companyId, `/payroll/grade-bands/${bandId}`), {
    method: 'PATCH',
    json: body,
  })
export const listGradeBandAudit = (companyId: string) =>
  apiFetch<GradeBandAuditEntry[]>(companyPath(companyId, '/payroll/grade-bands/audit'))
export const listPayRuns = (companyId: string) =>
  apiFetch<PayRun[]>(
    companyPath(companyId, '/payroll/pay-runs'),
  )
export const createPayRun = (companyId: string, body: PayRunCreate) =>
  apiFetch<PayRun>(companyPath(companyId, '/payroll/pay-runs'), { method: 'POST', json: body })
export const updatePayRun = (companyId: string, payRunId: string, body: PayRunUpdate) =>
  apiFetch<PayRun>(companyPath(companyId, `/payroll/pay-runs/${payRunId}`), { method: 'PATCH', json: body })

export type PayRunEmployeeLineOut = {
  employee_id: string
  employee_code: string
  full_name: string
  email: string | null
  payroll_status: string
}

export type PayRunDepartmentOverview = {
  department_id: string
  department_name: string
  pay_run_id: string | null
  /** open | payrun_closed */
  department_pay_run_status: string
  employees: PayRunEmployeeLineOut[]
}

export const listPayRunPeriodOverview = (
  companyId: string,
  params: { month: number; year: number; department_id?: string; status_filter?: string },
) => {
  const q = new URLSearchParams()
  q.set('month', String(params.month))
  q.set('year', String(params.year))
  if (params.department_id) q.set('department_id', params.department_id)
  if (params.status_filter) q.set('status_filter', params.status_filter)
  return apiFetch<PayRunDepartmentOverview[]>(
    companyPath(companyId, `/payroll/pay-runs/period-overview?${q.toString()}`),
  )
}

export const releaseEmployeeSalary = (companyId: string, payRunId: string, employeeId: string) =>
  apiFetch<PayRunEmployeeLineOut>(
    companyPath(companyId, `/payroll/pay-runs/${payRunId}/employees/${employeeId}/release-salary`),
    { method: 'POST' },
  )
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

export const listPayslipLedgerEntries = (companyId: string, payslipId: string) =>
  apiFetch<PayrollLedgerEntry[]>(
    companyPath(companyId, `/payroll/payslips/${encodeURIComponent(payslipId)}/ledger-entries`),
  )

export const validatePayrollCalculation = (
  companyId: string,
  body: PayrollValidateCalculationIn,
  opts?: { debug?: boolean },
) => {
  const headers: Record<string, string> = {}
  if (opts?.debug) headers['X-SimCash-Debug'] = '1'
  return apiFetch<PayrollValidateCalculationOut>(companyPath(companyId, '/payroll/validate-calculation'), {
    method: 'POST',
    json: body,
    headers,
  })
}

export const getSimCashEngineExpected = (
  companyId: string,
  params: { employee_id: string; loan_recovery?: number; leave_deduction?: number; other_deductions?: number },
) => {
  const q = new URLSearchParams()
  q.set('employee_id', params.employee_id)
  if (params.loan_recovery != null) q.set('loan_recovery', String(params.loan_recovery))
  if (params.leave_deduction != null) q.set('leave_deduction', String(params.leave_deduction))
  if (params.other_deductions != null) q.set('other_deductions', String(params.other_deductions))
  return apiFetch<PayrollEngineExpectedOut>(
    companyPath(companyId, `/payroll/engine-expected?${q.toString()}`),
  )
}

export type PayrollReconciliationExpectedOut = {
  eligible: boolean
  message: string | null
  headcount: number | null
  total_gross: number | null
  total_deductions: number | null
  total_net: number | null
}

export const getReconciliationExpected = (companyId: string, payRunId: string) => {
  const q = new URLSearchParams()
  q.set('pay_run_id', payRunId)
  return apiFetch<PayrollReconciliationExpectedOut>(
    companyPath(companyId, `/payroll/reconciliation-expected?${q.toString()}`),
  )
}

export type PayrollReconciliationValidateIn = {
  pay_run_id: string
  submitted: Record<string, number | string>
}

export const validateReconciliation = (companyId: string, body: PayrollReconciliationValidateIn) =>
  apiFetch<PayrollValidateCalculationOut>(companyPath(companyId, '/payroll/validate-reconciliation'), {
    method: 'POST',
    json: body,
  })
export const listBenefitsPlans = (companyId: string) =>
  apiFetch<BenefitsPlan[]>(companyPath(companyId, '/benefits/plans'))
export const createBenefitsPlan = (companyId: string, body: BenefitsPlanCreate) =>
  apiFetch<BenefitsPlan>(companyPath(companyId, '/benefits/plans'), { method: 'POST', json: body })
export const updateBenefitsPlan = (companyId: string, planId: string, body: BenefitsPlanUpdate) =>
  apiFetch<BenefitsPlan>(companyPath(companyId, `/benefits/plans/${planId}`), { method: 'PATCH', json: body })
export const listBenefitsEnrollments = (companyId: string, employee_id?: string) =>
  apiFetch<BenefitsEnrollment[]>(
    companyPath(companyId, `/benefits/enrollments${employee_id ? `?employee_id=${encodeURIComponent(employee_id)}` : ''}`),
  )
export const createBenefitsEnrollment = (companyId: string, body: BenefitsEnrollmentCreate) =>
  apiFetch<BenefitsEnrollment>(companyPath(companyId, '/benefits/enrollments'), { method: 'POST', json: body })
export const updateBenefitsEnrollment = (companyId: string, enrollmentId: string, body: BenefitsEnrollmentUpdate) =>
  apiFetch<BenefitsEnrollment>(companyPath(companyId, `/benefits/enrollments/${enrollmentId}`), {
    method: 'PATCH',
    json: body,
  })
export const getBenefitsEnrollmentSummary = (companyId: string) =>
  apiFetch<BenefitsEnrollmentSummary>(companyPath(companyId, '/benefits/enrollment-summary'))
export const listSurveys = (companyId: string) =>
  apiFetch<Survey[]>(companyPath(companyId, '/engagement/surveys'))
export const listSurveyTemplates = (companyId: string) =>
  apiFetch<SurveyTemplate[]>(companyPath(companyId, '/engagement/survey-templates'))
export const createSurvey = (companyId: string, body: SurveyCreate) =>
  apiFetch<Survey>(companyPath(companyId, '/engagement/surveys'), { method: 'POST', json: body })
export const updateSurvey = (companyId: string, surveyId: string, body: SurveyUpdate) =>
  apiFetch<Survey>(companyPath(companyId, `/engagement/surveys/${surveyId}`), { method: 'PATCH', json: body })
export const deleteSurvey = (companyId: string, surveyId: string) =>
  apiFetch<void>(companyPath(companyId, `/engagement/surveys/${surveyId}`), { method: 'DELETE' })
export const listSurveyResponses = (companyId: string, survey_id?: string) =>
  apiFetch<SurveyResponse[]>(
    companyPath(companyId, `/engagement/survey-responses${survey_id ? `?survey_id=${encodeURIComponent(survey_id)}` : ''}`),
  )
export const createSurveyResponse = (companyId: string, body: SurveyResponseCreate) =>
  apiFetch<SurveyResponse>(companyPath(companyId, '/engagement/survey-responses'), { method: 'POST', json: body })

export const listActionPlans = (companyId: string, surveyId: string) =>
  apiFetch<SurveyActionPlan[]>(companyPath(companyId, `/engagement/surveys/${surveyId}/action-plans`))
/** Action plans visible to the current user (employee role); scoped by owning department and participant rules. */
export const listMyActionPlans = (companyId: string) =>
  apiFetch<SurveyActionPlan[]>(companyPath(companyId, '/engagement/my-action-plans'))
export const createActionPlan = (companyId: string, surveyId: string, body: SurveyActionPlanCreate) =>
  apiFetch<SurveyActionPlan>(companyPath(companyId, `/engagement/surveys/${surveyId}/action-plans`), {
    method: 'POST',
    json: body,
  })
export const updateActionPlan = (companyId: string, actionPlanId: string, body: SurveyActionPlanUpdate) =>
  apiFetch<SurveyActionPlan>(companyPath(companyId, `/engagement/action-plans/${actionPlanId}`), {
    method: 'PATCH',
    json: body,
  })

export const listCompensationReviewCycles = (companyId: string) =>
  apiFetch<CompensationReviewCycle[]>(companyPath(companyId, '/compensation/review-cycles'))

export const createCompensationReviewCycle = (companyId: string, body: CompensationReviewCycleCreate) =>
  apiFetch<CompensationReviewCycle>(companyPath(companyId, '/compensation/review-cycles'), {
    method: 'POST',
    json: body,
  })

export const updateCompensationReviewCycle = (
  companyId: string,
  cycleId: string,
  body: CompensationReviewCycleUpdate,
) =>
  apiFetch<CompensationReviewCycle>(
    companyPath(companyId, `/compensation/review-cycles/${encodeURIComponent(cycleId)}`),
    { method: 'PATCH', json: body },
  )

export const listCompensationReviewGuidelines = (companyId: string, cycleId: string) =>
  apiFetch<CompensationReviewGuideline[]>(
    companyPath(companyId, `/compensation/review-cycles/${encodeURIComponent(cycleId)}/guidelines`),
  )

export const createCompensationReviewGuideline = (
  companyId: string,
  cycleId: string,
  body: CompensationReviewGuidelineCreate,
) =>
  apiFetch<CompensationReviewGuideline>(
    companyPath(companyId, `/compensation/review-cycles/${encodeURIComponent(cycleId)}/guidelines`),
    { method: 'POST', json: body },
  )

export const updateCompensationReviewGuideline = (
  companyId: string,
  cycleId: string,
  guidelineId: string,
  body: CompensationReviewGuidelineUpdate,
) =>
  apiFetch<CompensationReviewGuideline>(
    companyPath(
      companyId,
      `/compensation/review-cycles/${encodeURIComponent(cycleId)}/guidelines/${encodeURIComponent(guidelineId)}`,
    ),
    { method: 'PATCH', json: body },
  )

export const deleteCompensationReviewGuideline = (companyId: string, cycleId: string, guidelineId: string) =>
  apiFetch<void>(
    companyPath(
      companyId,
      `/compensation/review-cycles/${encodeURIComponent(cycleId)}/guidelines/${encodeURIComponent(guidelineId)}`,
    ),
    { method: 'DELETE' },
  )

export const listCompensationReviewProposals = (companyId: string, cycleId: string) =>
  apiFetch<CompensationReviewProposal[]>(
    companyPath(companyId, `/compensation/review-cycles/${encodeURIComponent(cycleId)}/proposals`),
  )

export const createCompensationReviewProposal = (
  companyId: string,
  cycleId: string,
  body: CompensationReviewProposalCreate,
) =>
  apiFetch<CompensationReviewProposal>(
    companyPath(companyId, `/compensation/review-cycles/${encodeURIComponent(cycleId)}/proposals`),
    { method: 'POST', json: body },
  )

export const updateCompensationReviewProposal = (
  companyId: string,
  cycleId: string,
  proposalId: string,
  body: CompensationReviewProposalUpdate,
) =>
  apiFetch<CompensationReviewProposal>(
    companyPath(
      companyId,
      `/compensation/review-cycles/${encodeURIComponent(cycleId)}/proposals/${encodeURIComponent(proposalId)}`,
    ),
    { method: 'PATCH', json: body },
  )

export const submitCompensationReviewProposal = (companyId: string, cycleId: string, proposalId: string) =>
  apiFetch<CompensationReviewProposal>(
    companyPath(
      companyId,
      `/compensation/review-cycles/${encodeURIComponent(cycleId)}/proposals/${encodeURIComponent(proposalId)}/submit`,
    ),
    { method: 'POST' },
  )

export const approveCompensationReviewProposal = (companyId: string, cycleId: string, proposalId: string) =>
  apiFetch<CompensationReviewProposal>(
    companyPath(
      companyId,
      `/compensation/review-cycles/${encodeURIComponent(cycleId)}/proposals/${encodeURIComponent(proposalId)}/approve`,
    ),
    { method: 'POST' },
  )

export const rejectCompensationReviewProposal = (
  companyId: string,
  cycleId: string,
  proposalId: string,
  reason?: string | null,
) => {
  const q = reason != null && reason !== '' ? `?reason=${encodeURIComponent(reason)}` : ''
  return apiFetch<CompensationReviewProposal>(
    companyPath(
      companyId,
      `/compensation/review-cycles/${encodeURIComponent(cycleId)}/proposals/${encodeURIComponent(proposalId)}/reject${q}`,
    ),
    { method: 'POST' },
  )
}

export const getCompensationReviewBudgetSummary = (companyId: string, cycleId: string) =>
  apiFetch<CompensationReviewBudgetSummary>(
    companyPath(companyId, `/compensation/review-cycles/${encodeURIComponent(cycleId)}/budget-summary`),
  )

export const applyApprovedCompensationReviewProposals = (companyId: string, cycleId: string) =>
  apiFetch<{ applied_structure_ids: string[]; count: number }>(
    companyPath(companyId, `/compensation/review-cycles/${encodeURIComponent(cycleId)}/apply-approved`),
    { method: 'POST' },
  )
