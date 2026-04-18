import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import {
  SIMCASH_FORM_FIELDS,
  type CompensationGradeBand,
  type CompensationReviewBudgetSummary,
  type CompensationReviewCycle,
  type CompensationReviewGuideline,
  type CompensationReviewProposal,
  type GradeBandAuditEntry,
  type PayrollLedgerEntry,
  type Payslip,
  type PayrollValidateCalculationOut,
  type PayRunRunKind,
  type SalaryStructure,
  type SimCashFormField,
  applyApprovedCompensationReviewProposals,
  approveCompensationReviewProposal,
  createCompensationReviewCycle,
  createCompensationReviewGuideline,
  createCompensationReviewProposal,
  createGradeBand,
  createPayRun,
  createPayslip,
  createSalaryStructure,
  deleteCompensationReviewGuideline,
  getCompensationReviewBudgetSummary,
  getSimCashEngineExpected,
  getReconciliationExpected,
  listCompensationReviewCycles,
  listCompensationReviewGuidelines,
  listCompensationReviewProposals,
  listGradeBandAudit,
  listGradeBands,
  listPayRunPeriodOverview,
  listPayRuns,
  listBenefitsEnrollments,
  listBenefitsPlans,
  listPayslipLedgerEntries,
  listPayslips,
  listSalaryStructureAudit,
  listSalaryStructures,
  rejectCompensationReviewProposal,
  releaseEmployeeSalary,
  submitCompensationReviewProposal,
  updateCompensationReviewCycle,
  updateCompensationReviewProposal,
  updateGradeBand,
  updateSalaryStructure,
  type PayRunDepartmentOverview,
  type BenefitsEnrollment,
  type BenefitsPlan,
  type SalaryStructureAuditEntry,
  validatePayrollCalculation,
  validateReconciliation,
  type PayrollReconciliationExpectedOut,
} from '../../../api/compensationApi'
import { listEmployees, updateEmployee, type Employee } from '../../../api/employeesApi'
import {
  listDepartments,
  listPositions,
  updatePosition,
  type Department,
  type Position,
} from '../../../api/organizationApi'
import { AlertModal } from '../../../components/AlertModal'
import { ToastNotification, type ToastItem } from '../../../components/ToastNotification'
import styles from '../CompanyWorkspacePage.module.css'
import { SimCashWorksheet, WORKSHEET_DEDUCTION_KEYS as DEDUCTION_KEYS, WORKSHEET_EARNINGS_KEYS as EARNINGS_KEYS } from './SimCashWorksheet'
import { ReconciliationWorksheet, type ReconciliationField } from './ReconciliationWorksheet'

const SIMCASH_SHOW_ENGINE_KEY = 'hworkr_simcash_show_engine'
const RECON_SHOW_ENGINE_KEY = 'hworkr_reconciliation_show_engine'

type Tab = 'salary' | 'runs' | 'grades' | 'merit' | 'reconciliation' | 'reimbursements' | 'payslips'

const SUPPLEMENTAL_LINE_TYPES = ['reimbursement', 'adjustment', 'arrears', 'other'] as const
type SupplementalLineType = (typeof SUPPLEMENTAL_LINE_TYPES)[number]

type SupplementalLineRow = {
  id: string
  lineType: SupplementalLineType
  code: string
  amount: string
  taxable: boolean
}

function newSupplementalLine(): SupplementalLineRow {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()),
    lineType: 'reimbursement',
    code: '',
    amount: '',
    taxable: false,
  }
}

function parseSupplementalLinesFromEarnings(earnings: Record<string, unknown> | null | undefined): SupplementalLineRow[] {
  if (!earnings || typeof earnings !== 'object') return []
  const raw = earnings.lines
  if (!Array.isArray(raw)) return []
  const out: SupplementalLineRow[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const t = String(o.type || '').toLowerCase()
    if (!SUPPLEMENTAL_LINE_TYPES.includes(t as SupplementalLineType)) continue
    const amt = o.amount
    const amountStr =
      typeof amt === 'number' && !Number.isNaN(amt)
        ? String(amt)
        : typeof amt === 'string'
          ? amt
          : ''
    out.push({
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()),
      lineType: t as SupplementalLineType,
      code: typeof o.code === 'string' ? o.code : String(o.code ?? ''),
      amount: amountStr,
      taxable: Boolean(o.taxable),
    })
  }
  return out
}

function payRunKindLabel(kind: string | null | undefined): string {
  const k = kind || 'regular'
  if (k === 'off_cycle') return 'Off-cycle'
  if (k === 'supplemental') return 'Supplemental'
  return 'Regular'
}

function formatPayRunOptionLabel(r: { year: number; month: number; department_name: string | null; department_id: string | null; run_kind?: string | null; run_label?: string | null; pay_date?: string | null }): string {
  const cal = new Date(r.year, r.month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  const batch = r.department_name ?? (r.department_id == null ? 'All / no department' : '—')
  const kind = payRunKindLabel(r.run_kind)
  const tail = [kind, r.run_label?.trim() || null, r.pay_date?.trim() ? `pay ${r.pay_date}` : null].filter(Boolean).join(' · ')
  return tail ? `${cal} · ${batch} · ${tail}` : `${cal} · ${batch}`
}

function sessionGetJson<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function sessionSetJson(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

function touchRecentIdList(key: string, id: string, max = 12) {
  if (!id) return
  const cur = sessionGetJson<string[]>(key, [])
  const next = [id, ...cur.filter((x) => x !== id)].slice(0, max)
  sessionSetJson(key, next)
}

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function matchGradeBand(ctc: number, bands: CompensationGradeBand[]): CompensationGradeBand | null {
  const today = todayISO()
  const active = bands
    .filter(
      (b) =>
        String(b.effective_from) <= today &&
        (!b.effective_to || String(b.effective_to).trim() === '' || String(b.effective_to) >= today) &&
        ctc >= b.min_annual &&
        ctc <= b.max_annual,
    )
    .sort((a, z) => String(z.effective_from).localeCompare(String(a.effective_from)))
  return active[0] ?? null
}

function bandPosPct(ctc: number, band: CompensationGradeBand): number {
  const range = band.max_annual - band.min_annual
  if (range <= 0) return 100
  return Math.max(0, Math.min(100, ((ctc - band.min_annual) / range) * 100))
}

function fmtSC(n: number): string {
  return `₹S ${n.toLocaleString('en-IN')}`
}

function activeBands(bands: CompensationGradeBand[]): CompensationGradeBand[] {
  const today = todayISO()
  return bands.filter(
    (b) =>
      String(b.effective_from) <= today &&
      (!b.effective_to || String(b.effective_to).trim() === '' || String(b.effective_to) >= today),
  )
}

function emptyNewGradeBandForm() {
  return {
    display_name: '',
    min_annual: '',
    max_annual: '',
    currency_code: 'SIMCASH',
    effective_from: todayISO(),
    notes: '',
    org_position_grade_min: '',
  }
}

/** Backend still stores band_code; we derive it from org grade only (G1, G2, …). */
function derivedBandCodeFromOrgGrade(orgGrade: number): string {
  return `G${Math.round(orgGrade)}`
}

function formatGradeBandAuditSummary(entry: GradeBandAuditEntry): string {
  const cj = entry.changes_json
  if (!cj || typeof cj !== 'object') return entry.action
  const parts: string[] = []
  for (const [k, v] of Object.entries(cj)) {
    if (v && typeof v === 'object' && 'old' in v && 'new' in v) {
      const o = v as { old: unknown; new: unknown }
      parts.push(`${k}: ${JSON.stringify(o.old)} → ${JSON.stringify(o.new)}`)
    } else {
      parts.push(`${k}: ${JSON.stringify(v)}`)
    }
  }
  return parts.length ? parts.join('; ') : entry.action
}

function emptyForm(): Record<SimCashFormField, string> {
  const o = {} as Record<SimCashFormField, string>
  for (const k of SIMCASH_FORM_FIELDS) o[k] = ''
  return o
}

function employeeLabel(e: Employee): string {
  const p = e.personal_info_json
  const name = p && typeof p === 'object' && 'full_name' in p && typeof (p as { full_name?: unknown }).full_name === 'string'
    ? (p as { full_name: string }).full_name
    : null
  return name || e.employee_code
}

function parseCtc(st: SalaryStructure | undefined): { ctc: number | null; bonusPct: number | null } {
  if (!st?.components_json || typeof st.components_json !== 'object') return { ctc: null, bonusPct: null }
  const j = st.components_json as Record<string, unknown>
  const c = j.ctc_annual
  const b = j.bonus_pct_of_ctc
  return {
    ctc: typeof c === 'number' ? c : typeof c === 'string' ? Number(c) : null,
    bonusPct: typeof b === 'number' ? b : typeof b === 'string' ? Number(b) : null,
  }
}

function formatSalaryAuditSummary(e: SalaryStructureAuditEntry): string {
  const c = e.changes_json
  if (!c) return '—'
  if (e.action === 'create') {
    const ctc = c.ctc_annual
    const bp = c.bonus_pct_of_ctc
    const pct =
      bp != null && (typeof bp === 'number' || typeof bp === 'string')
        ? `${(Number(bp) * 100).toFixed(2)}%`
        : '—'
    return `CTC ₹S ${String(ctc != null ? ctc : '—')}/yr · bonus ${pct} of CTC`
  }
  const parts: string[] = []
  for (const key of ['ctc_annual', 'bonus_pct_of_ctc', 'effective_from'] as const) {
    const v = c[key]
    if (v && typeof v === 'object' && v !== null && 'old' in v && 'new' in v) {
      const o = v as { old: unknown; new: unknown }
      parts.push(`${key}: ${String(o.old)} → ${String(o.new)}`)
    }
  }
  return parts.length ? parts.join('; ') : '—'
}

/** Employee id for this audit row: from changes_json, else salary structure row → employee_id. */
function auditAffectedEmployeeId(
  e: SalaryStructureAuditEntry,
  structures: SalaryStructure[],
): string {
  const fromJson = e.changes_json?.employee_id
  if (typeof fromJson === 'string' && fromJson.length > 0) return fromJson
  const st = structures.find((s) => s.id === e.entity_id)
  return st?.employee_id ?? ''
}

/** Build searchable text for salary-structure audit rows (users, dept, ids, names). */
function buildSalaryAuditSearchHay(
  e: SalaryStructureAuditEntry,
  employees: Employee[],
  departments: Department[],
  structures: SalaryStructure[],
): string {
  const parts: string[] = []
  const push = (v: string | undefined | null) => {
    if (v != null && String(v).length > 0) parts.push(String(v))
  }

  push(e.user_name)
  push(e.user_email)
  push(e.user_id)
  push(e.action)
  push(e.id)
  push(e.entity_id)
  push(formatSalaryAuditSummary(e))

  const empId = auditAffectedEmployeeId(e, structures)
  push(empId)
  if (empId) {
    const emp = employees.find((x) => x.id === empId)
    if (emp) {
      push(emp.employee_code)
      push(employeeLabel(emp))
      push(emp.department_id ?? '')
      push(emp.position_id ?? '')
      const dn = departments.find((d) => d.id === emp.department_id)?.name
      push(dn)
    }
  }

  if (e.changes_json && typeof e.changes_json === 'object') {
    try {
      push(JSON.stringify(e.changes_json))
    } catch {
      /* ignore */
    }
  }

  return parts.join(' ').toLowerCase()
}

function matchesAuditSearch(hayLower: string, queryRaw: string): boolean {
  const q = queryRaw.trim().toLowerCase()
  if (!q) return true
  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  return tokens.every((t) => hayLower.includes(t))
}

function defaultPayRunPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function parsePayRunPeriod(ym: string): { year: number; month: number } {
  const [ys, ms] = ym.split('-')
  const year = Number(ys)
  const month = Number(ms)
  return { year: Number.isFinite(year) ? year : new Date().getFullYear(), month: Number.isFinite(month) ? month : 1 }
}

function monthYearDropdownOptions(): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  const cur = new Date()
  const start = new Date(cur.getFullYear(), cur.getMonth() - 18, 1)
  const end = new Date(cur.getFullYear(), cur.getMonth() + 6, 1)
  for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const label = d.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    out.push({ label, value: `${y}-${String(m).padStart(2, '0')}` })
  }
  return out
}

function payrollStatusLabel(status: string): string {
  switch (status) {
    case 'to_be_processed':
      return 'To be processed'
    case 'payslip_generated':
      return 'Payslip generated'
    case 'salary_released':
      return 'Salary released'
    default:
      return status
  }
}

function matchesPayRunEmpSearch(
  emp: { employee_id: string; employee_code: string; full_name: string; email: string | null },
  q: string,
): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const hay = [emp.employee_code, emp.full_name, emp.email ?? '', emp.employee_id].join(' ').toLowerCase()
  return hay.includes(s)
}

function formFromPayslip(p: Payslip): Record<SimCashFormField, string> {
  const o = emptyForm()
  const e = (p.earnings_json ?? {}) as Record<string, unknown>
  const d = (p.deductions_json ?? {}) as Record<string, unknown>
  for (const k of SIMCASH_FORM_FIELDS) {
    if (k === 'gross') {
      o[k] = String(p.gross ?? '')
      continue
    }
    if (k === 'net') {
      o[k] = String(p.net ?? '')
      continue
    }
    const raw = e[k] ?? d[k]
    if (typeof raw === 'number' && !Number.isNaN(raw)) o[k] = String(raw)
    else if (typeof raw === 'string') o[k] = raw
  }
  return o
}

function monthlyPremiumFromPlanDetails(details: Record<string, unknown> | null | undefined): number {
  if (!details || typeof details !== 'object') return 0
  const raw = details.monthly_premium_simcash
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function PayrollPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const role = myCompanies.find((x) => x.company.id === companyId)?.membership.role ?? ''
  const canConfigure =
    role === 'company_admin' || role === 'compensation_analytics' || role === 'hr_ops'
  const isPayAdmin = role === 'company_admin' || role === 'compensation_analytics'
  const isHrOps = role === 'hr_ops'
  const payslipViewOnly = false
  const canEditPayslip = canConfigure

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState<Tab>('salary')
  const [structures, setStructures] = useState<SalaryStructure[]>([])
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof listPayRuns>>>([])
  const [payslips, setPayslips] = useState<Payslip[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])

  const [structureEmpId, setStructureEmpId] = useState('')
  const [ctcAnnual, setCtcAnnual] = useState('80000')
  const [bonusPct, setBonusPct] = useState('0.0625')
  const [structureEffectiveFrom, setStructureEffectiveFrom] = useState('')
  const [editingStructureId, setEditingStructureId] = useState<string | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [allPositions, setAllPositions] = useState<Position[]>([])
  const [salaryDeptId, setSalaryDeptId] = useState('')
  const [salaryPositionId, setSalaryPositionId] = useState('')
  const [salaryCodeInput, setSalaryCodeInput] = useState('')
  const [salaryGradeInput, setSalaryGradeInput] = useState('')
  const [salaryEditMode, setSalaryEditMode] = useState(false)
  const [auditLog, setAuditLog] = useState<SalaryStructureAuditEntry[]>([])
  const [auditSearch, setAuditSearch] = useState('')
  const [gradeBands, setGradeBands] = useState<CompensationGradeBand[]>([])
  const [gradeBandAudit, setGradeBandAudit] = useState<GradeBandAuditEntry[]>([])
  const [newGradeBand, setNewGradeBand] = useState(emptyNewGradeBandForm)
  const [showNewGradeBandForm, setShowNewGradeBandForm] = useState(false)
  const [editingBandId, setEditingBandId] = useState<string | null>(null)
  const [editGradeBand, setEditGradeBand] = useState<ReturnType<typeof emptyNewGradeBandForm> | null>(null)

  const [payRunPeriod, setPayRunPeriod] = useState(defaultPayRunPeriod)
  const [runsViewDeptFilter, setRunsViewDeptFilter] = useState('')
  const [lineStatusFilter, setLineStatusFilter] = useState('')
  const [createPayRunDeptId, setCreatePayRunDeptId] = useState('')
  const [createPayRunKind, setCreatePayRunKind] = useState<PayRunRunKind>('regular')
  const [createPayRunPayDate, setCreatePayRunPayDate] = useState('')
  const [createPayRunLabel, setCreatePayRunLabel] = useState('')
  const [runsKindListFilter, setRunsKindListFilter] = useState<'all' | 'regular_only' | 'non_regular'>('all')
  const [payRunOverview, setPayRunOverview] = useState<PayRunDepartmentOverview[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [expandedRunDeptIds, setExpandedRunDeptIds] = useState<Record<string, boolean>>({})
  const [runEmpSearchByDept, setRunEmpSearchByDept] = useState<Record<string, string>>({})
  const [releaseConfirm, setReleaseConfirm] = useState<{
    payRunId: string
    employeeId: string
    employeeName: string
  } | null>(null)

  const [payrollEmpId, setPayrollEmpId] = useState('')
  const [payRunId, setPayRunId] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [fieldOk, setFieldOk] = useState<Partial<Record<SimCashFormField, boolean>>>({})
  const [allMatch, setAllMatch] = useState<boolean | null>(null)
  const [debugPanel, setDebugPanel] = useState<PayrollValidateCalculationOut | null>(null)
  const [showValidationColors, setShowValidationColors] = useState(false)
  const [devDebugHeader, setDevDebugHeader] = useState(false)
  const [enginePreview, setEnginePreview] = useState<{
    expected: Record<string, number>
    employer_expected: Record<string, number>
  } | null>(null)
  const [engineLoading, setEngineLoading] = useState(false)
  const [engineFetchError, setEngineFetchError] = useState<string | null>(null)
  const [showEngineColumn, setShowEngineColumn] = useState(() => {
    try {
      return localStorage.getItem(SIMCASH_SHOW_ENGINE_KEY) !== 'false'
    } catch {
      return true
    }
  })

  const [recoPeriod, setRecoPeriod] = useState(defaultPayRunPeriod)
  const [recoDeptId, setRecoDeptId] = useState('')
  const [recoExpected, setRecoExpected] = useState<PayrollReconciliationExpectedOut | null>(null)
  const [recoEngineLoading, setRecoEngineLoading] = useState(false)
  const [recoForm, setRecoForm] = useState<Record<ReconciliationField, string>>({
    headcount: '',
    total_gross: '',
    total_deductions: '',
    total_net: '',
  })
  const [recoFieldOk, setRecoFieldOk] = useState<Partial<Record<ReconciliationField, boolean>>>({})
  const [recoAllMatch, setRecoAllMatch] = useState<boolean | null>(null)
  const [recoShowValidationColors, setRecoShowValidationColors] = useState(false)
  const [showReconciliationEngine, setShowReconciliationEngine] = useState(() => {
    try {
      return localStorage.getItem(RECON_SHOW_ENGINE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  function showToast(title: string, detail?: string, variant: ToastItem['variant'] = 'success') {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, title, detail, variant }])
  }
  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const [salarySaveBanner, setSalarySaveBanner] = useState<{ message: string; employeeId: string } | null>(null)
  const [salaryMissingOnly, setSalaryMissingOnly] = useState(false)
  const [benefitPlans, setBenefitPlans] = useState<BenefitsPlan[]>([])
  const [benefitEnrollments, setBenefitEnrollments] = useState<BenefitsEnrollment[]>([])

  const [payRunCreatedBanner, setPayRunCreatedBanner] = useState<{
    payRunId: string
    message: string
    cta: string
  } | null>(null)

  const [payslipSaveBanner, setPayslipSaveBanner] = useState<{
    payRunId: string
    message: string
    allDone: boolean
  } | null>(null)

  const [recoPassBanner, setRecoPassBanner] = useState<{ payRunId: string | null } | null>(null)
  const [recoBannerDismissed, setRecoBannerDismissed] = useState(false)

  const [meritApplyBanner, setMeritApplyBanner] = useState<{ count: number; effective: string } | null>(null)

  const [reimburseDirtyBanner, setReimburseDirtyBanner] = useState(false)

  const [payRunOverviewFull, setPayRunOverviewFull] = useState<PayRunDepartmentOverview[]>([])

  const [meritCycles, setMeritCycles] = useState<CompensationReviewCycle[]>([])
  const [meritCycleId, setMeritCycleId] = useState('')
  const [meritGuidelines, setMeritGuidelines] = useState<CompensationReviewGuideline[]>([])
  const [meritProposals, setMeritProposals] = useState<CompensationReviewProposal[]>([])
  const [meritBudget, setMeritBudget] = useState<CompensationReviewBudgetSummary | null>(null)
  const [meritLoading, setMeritLoading] = useState(false)
  const [meritNewCycle, setMeritNewCycle] = useState({
    label: '',
    fiscal_year: '',
    budget_amount: '',
    budget_currency: 'SIMCASH',
    effective_from_default: '',
    notes: '',
  })
  const [meritNewGuideline, setMeritNewGuideline] = useState({ band_code: '', min_increase_pct: '', max_increase_pct: '' })
  const [meritNewProposal, setMeritNewProposal] = useState({
    employee_id: '',
    proposed_ctc_annual: '',
    band_code: '',
    justification: '',
  })
  const [supplementalLines, setSupplementalLines] = useState<SupplementalLineRow[]>([])
  const [payslipLedger, setPayslipLedger] = useState<PayrollLedgerEntry[]>([])
  const [proposalEditCtc, setProposalEditCtc] = useState<Record<string, string>>({})
  const [meritCycleEditBudget, setMeritCycleEditBudget] = useState('')
  const [meritCycleEditEffective, setMeritCycleEditEffective] = useState('')

  const mergePayrollSearchParams = useCallback(
    (mutate: (n: URLSearchParams) => void, opts?: { replace?: boolean }) => {
      setSearchParams((prev) => {
        const n = new URLSearchParams(prev)
        mutate(n)
        return n
      }, { replace: opts?.replace ?? false })
    },
    [setSearchParams],
  )

  const gotoPayrollTab = useCallback(
    (nextTab: Tab, extra?: Partial<{ pay_run_id: string; employee_id: string; line_status: string; month: string }>) => {
      setTab(nextTab)
      mergePayrollSearchParams((n) => {
        n.set('tab', nextTab)
        if (extra?.pay_run_id != null) n.set('pay_run_id', extra.pay_run_id)
        if (extra?.employee_id != null) n.set('employee_id', extra.employee_id)
        if (extra?.line_status != null) n.set('line_status', extra.line_status)
        if (extra?.month != null) n.set('month', extra.month)
      })
    },
    [mergePayrollSearchParams],
  )

  async function computePayRunPayslipProgress(
    payRunId: string,
    runRows?: Awaited<ReturnType<typeof listPayRuns>>,
  ): Promise<{ total: number; done: number; allDone: boolean }> {
    const pr = (runRows ?? runs).find((r) => r.id === payRunId)
    if (!pr) return { total: 0, done: 0, allDone: false }
    const rowsAll = await listPayRunPeriodOverview(companyId, {
      month: pr.month,
      year: pr.year,
      status_filter: undefined,
    })
    const match = rowsAll.find((x) => x.pay_run_id === payRunId)
    if (match) {
      const total = match.employees.length
      const done = match.employees.filter(
        (e) => e.payroll_status === 'payslip_generated' || e.payroll_status === 'salary_released',
      ).length
      const pending = match.employees.filter((e) => e.payroll_status === 'to_be_processed').length
      return { total, done, allDone: total > 0 && pending === 0 }
    }
    const slips = await listPayslips(companyId, undefined, payRunId)
    const slipCount = slips.length
    if (pr.department_id) {
      const total = employees.filter((e) => e.department_id === pr.department_id).length
      return { total, done: slipCount, allDone: total > 0 && slipCount >= total }
    }
    const total = employees.length
    return { total, done: slipCount, allDone: total > 0 && slipCount >= total }
  }

  async function pickDefaultPayRunIdForPayslips(runRows: Awaited<ReturnType<typeof listPayRuns>>): Promise<string | ''> {
    if (!companyId || runRows.length === 0) return ''
    const now = new Date()
    const curMonth = now.getMonth() + 1
    const curYear = now.getFullYear()
    const monthRuns = runRows.filter((r) => r.month === curMonth && r.year === curYear)
    const candidates = monthRuns.length ? monthRuns : runRows
    const scored: { id: string; pending: number; ts: number }[] = []
    for (const r of candidates) {
      const rows = await listPayRunPeriodOverview(companyId, { month: r.month, year: r.year })
      const row = rows.find((x) => x.pay_run_id === r.id)
      if (!row) continue
      const pending = row.employees.filter((e) => e.payroll_status === 'to_be_processed').length
      if (pending <= 0) continue
      const ts = new Date(r.created_at).getTime()
      scored.push({ id: r.id, pending, ts })
    }
    if (scored.length !== 1) return ''
    return scored[0].id
  }

  useEffect(() => {
    if (role === 'employee') setTab('payslips')
  }, [role])

  useEffect(() => {
    const t = searchParams.get('tab')
    if (
      t === 'payslips' ||
      t === 'runs' ||
      t === 'salary' ||
      t === 'grades' ||
      t === 'merit' ||
      t === 'reimbursements' ||
      t === 'reconciliation'
    ) {
      if ((t === 'grades' || t === 'merit' || t === 'reimbursements' || t === 'reconciliation') && !canConfigure) setTab('payslips')
      else setTab(t as Tab)
    }
    const pr = searchParams.get('pay_run_id')
    const emp = searchParams.get('employee_id')
    if (pr) setPayRunId(pr)
    if (emp) setPayrollEmpId(emp)
  }, [searchParams, canConfigure])

  useEffect(() => {
    if (tab !== 'reconciliation' || runs.length === 0) return
    const prFromUrl = searchParams.get('pay_run_id')
    if (!prFromUrl) return
    const run = runs.find((r) => r.id === prFromUrl)
    if (!run?.department_id) return
    setRecoDeptId(run.department_id)
    setRecoPeriod(`${run.year}-${String(run.month).padStart(2, '0')}`)
  }, [tab, runs, searchParams])

  const loadPeriodOverview = useCallback(async () => {
    if (!companyId) return
    setOverviewLoading(true)
    setError(null)
    try {
      const { year, month } = parsePayRunPeriod(payRunPeriod)
      const [rowsFull, rowsFiltered] = await Promise.all([
        listPayRunPeriodOverview(companyId, {
          month,
          year,
          department_id: runsViewDeptFilter || undefined,
        }),
        listPayRunPeriodOverview(companyId, {
          month,
          year,
          department_id: runsViewDeptFilter || undefined,
          status_filter: lineStatusFilter || undefined,
        }),
      ])
      setPayRunOverviewFull(rowsFull)
      setPayRunOverview(rowsFiltered)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pay run overview')
    } finally {
      setOverviewLoading(false)
    }
  }, [companyId, payRunPeriod, runsViewDeptFilter, lineStatusFilter])

  const loadMeritCycles = useCallback(async () => {
    if (!companyId) return
    setMeritLoading(true)
    setError(null)
    try {
      const c = await listCompensationReviewCycles(companyId)
      setMeritCycles(c)
      setMeritCycleId((prev) => {
        if (prev && c.some((x) => x.id === prev)) return prev
        return c[0]?.id ?? ''
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load review cycles')
    } finally {
      setMeritLoading(false)
    }
  }, [companyId])

  const loadMeritCycleDetails = useCallback(async () => {
    if (!companyId || !meritCycleId) {
      setMeritGuidelines([])
      setMeritProposals([])
      setMeritBudget(null)
      return
    }
    setMeritLoading(true)
    try {
      const [g, p, b] = await Promise.all([
        listCompensationReviewGuidelines(companyId, meritCycleId),
        listCompensationReviewProposals(companyId, meritCycleId),
        getCompensationReviewBudgetSummary(companyId, meritCycleId),
      ])
      setMeritGuidelines(g)
      setMeritProposals(p)
      setMeritBudget(b)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load merit cycle')
    } finally {
      setMeritLoading(false)
    }
  }, [companyId, meritCycleId])

  useEffect(() => {
    if (!companyId || tab !== 'merit' || !canConfigure) return
    void loadMeritCycles()
  }, [companyId, tab, canConfigure, loadMeritCycles])

  useEffect(() => {
    if (!companyId || tab !== 'merit' || !meritCycleId) return
    void loadMeritCycleDetails()
  }, [companyId, tab, meritCycleId, loadMeritCycleDetails])

  useEffect(() => {
    if (!companyId || tab !== 'runs' || !canConfigure) return
    void loadPeriodOverview()
  }, [companyId, tab, canConfigure, loadPeriodOverview])

  useEffect(() => {
    if (!releaseConfirm) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) setReleaseConfirm(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [releaseConfirm, pending])

  async function refresh(): Promise<{
    structures: SalaryStructure[]
    runs: Awaited<ReturnType<typeof listPayRuns>>
    payslips: Payslip[]
  } | null> {
    if (!companyId) return null
    setLoading(true)
    setError(null)
    try {
      const [s, r, p, audit, bands, gAudit] = await Promise.all([
        listSalaryStructures(companyId),
        listPayRuns(companyId),
        listPayslips(companyId),
        listSalaryStructureAudit(companyId).catch(() => [] as SalaryStructureAuditEntry[]),
        canConfigure
          ? listGradeBands(companyId).catch(() => [] as CompensationGradeBand[])
          : Promise.resolve([] as CompensationGradeBand[]),
        canConfigure
          ? listGradeBandAudit(companyId).catch(() => [] as GradeBandAuditEntry[])
          : Promise.resolve([] as GradeBandAuditEntry[]),
      ])
      setStructures(s)
      setRuns(r)
      setPayslips(p)
      setAuditLog(Array.isArray(audit) ? audit : [])
      setGradeBands(Array.isArray(bands) ? bands : [])
      setGradeBandAudit(Array.isArray(gAudit) ? gAudit : [])
      return { structures: s, runs: r, payslips: p }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payroll')
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    void Promise.all([listBenefitsPlans(companyId), listBenefitsEnrollments(companyId)])
      .then(([plans, ens]) => {
        if (!cancelled) {
          setBenefitPlans(plans)
          setBenefitEnrollments(ens)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBenefitPlans([])
          setBenefitEnrollments([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [companyId])

  useEffect(() => {
    if (!companyId || tab !== 'payslips' || !canConfigure) return
    if (searchParams.get('pay_run_id')) return
    if (payRunId) return
    if (!runs.length) return
    let cancelled = false
    void (async () => {
      const next = await pickDefaultPayRunIdForPayslips(runs)
      if (!cancelled && next) setPayRunId(next)
    })()
    return () => {
      cancelled = true
    }
  }, [companyId, tab, canConfigure, runs, payRunId, searchParams])

  useEffect(() => {
    if (!companyId || !canConfigure) return
    let cancelled = false
    void listEmployees(companyId)
      .then((rows) => {
        if (!cancelled) setEmployees(rows)
      })
      .catch(() => {
        if (!cancelled) setEmployees([])
      })
    return () => {
      cancelled = true
    }
  }, [companyId, canConfigure])

  useEffect(() => {
    if (!companyId || !canConfigure) return
    let cancelled = false
    void listDepartments(companyId)
      .then((rows) => {
        if (!cancelled) setDepartments(rows)
      })
      .catch(() => {
        if (!cancelled) setDepartments([])
      })
    void listPositions(companyId)
      .then((rows) => {
        if (!cancelled) setAllPositions(rows)
      })
      .catch(() => {
        if (!cancelled) setAllPositions([])
      })
    return () => {
      cancelled = true
    }
  }, [companyId, canConfigure])

  useEffect(() => {
    if (!companyId || !salaryDeptId) {
      setPositions([])
      return
    }
    let cancelled = false
    void listPositions(companyId, salaryDeptId)
      .then((rows) => {
        if (!cancelled) setPositions(rows)
      })
      .catch(() => {
        if (!cancelled) setPositions([])
      })
    return () => {
      cancelled = true
    }
  }, [companyId, salaryDeptId])

  useEffect(() => {
    if (!structureEmpId) {
      setSalaryGradeInput('')
      return
    }
    if (!salaryPositionId) {
      setSalaryGradeInput('')
      return
    }
    const p = positions.find((x) => x.id === salaryPositionId)
    if (p) setSalaryGradeInput(String(p.grade))
  }, [structureEmpId, salaryPositionId, positions])

  const salaryFilteredEmployees = useMemo(() => {
    let list = employees
    if (salaryDeptId) list = list.filter((e) => e.department_id === salaryDeptId)
    if (salaryPositionId) list = list.filter((e) => e.position_id === salaryPositionId)
    return list
  }, [employees, salaryDeptId, salaryPositionId])

  const latestStructure = useMemo(() => {
    if (!payrollEmpId) return undefined
    return structures.filter((x) => x.employee_id === payrollEmpId).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
  }, [structures, payrollEmpId])

  const ctcInfo = parseCtc(latestStructure)

  const payRunMeta = useMemo(() => runs.find((r) => r.id === payRunId), [runs, payRunId])
  const payPeriodLabel = useMemo(() => {
    if (!payRunMeta) return '—'
    const batch =
      payRunMeta.department_name ??
      (payRunMeta.department_id == null ? 'All departments (legacy)' : '—')
    const label = new Date(payRunMeta.year, payRunMeta.month - 1, 1).toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
    })
    const kind = payRunKindLabel(payRunMeta.run_kind)
    const payDt = payRunMeta.pay_date?.trim()
    const runLb = payRunMeta.run_label?.trim()
    const extras = [kind, payDt ? `pay ${payDt}` : null, runLb || null].filter(Boolean).join(' · ')
    return extras ? `${label} · ${batch} · ${extras}` : `${label} · ${batch}`
  }, [payRunMeta])

  const runsForSelectedPeriod = useMemo(() => {
    const { year, month } = parsePayRunPeriod(payRunPeriod)
    return runs.filter((r) => r.year === year && r.month === month)
  }, [runs, payRunPeriod])

  const filteredRunsForPeriodList = useMemo(() => {
    const rows = runsForSelectedPeriod
    if (runsKindListFilter === 'regular_only') return rows.filter((r) => (r.run_kind || 'regular') === 'regular')
    if (runsKindListFilter === 'non_regular') return rows.filter((r) => (r.run_kind || 'regular') !== 'regular')
    return rows
  }, [runsForSelectedPeriod, runsKindListFilter])

  const selectedMeritCycle = useMemo(
    () => meritCycles.find((c) => c.id === meritCycleId),
    [meritCycles, meritCycleId],
  )

  const meritBandSelectOptions = useMemo(() => {
    const codes = gradeBands.map((b) => b.band_code).filter(Boolean)
    return [...new Set(codes)].sort()
  }, [gradeBands])

  /** Unique sorted org grade numbers from all positions across the company. */
  const allOrgGrades = useMemo(() => {
    const nums = allPositions.map((p) => p.grade).filter((g) => g != null && Number.isFinite(g))
    return [...new Set(nums)].sort((a, b) => a - b)
  }, [allPositions])

  /** Org grades from positions that have no grade band configured for them. */
  const unconfiguredOrgGrades = useMemo(() => {
    const configuredSet = new Set(
      gradeBands.map((b) => b.org_position_grade_min).filter((v): v is number => v != null),
    )
    return allOrgGrades.filter((g) => !configuredSet.has(g))
  }, [allOrgGrades, gradeBands])

  const meritBandCeilingCount = useMemo(() => {
    if (!gradeBands.length) return 0
    const current = activeBands(gradeBands)
    return meritProposals.filter((p) => {
      const proposed = Number(proposalEditCtc[p.id] ?? p.proposed_ctc_annual)
      if (!Number.isFinite(proposed) || proposed <= 0) return false
      const band = matchGradeBand(p.current_ctc_annual, current) ?? matchGradeBand(proposed, current)
      if (!band) return false
      return proposed >= band.max_annual * 0.95
    }).length
  }, [gradeBands, meritProposals, proposalEditCtc])

  useEffect(() => {
    const o: Record<string, string> = {}
    for (const p of meritProposals) o[p.id] = String(p.proposed_ctc_annual)
    setProposalEditCtc(o)
  }, [meritProposals])

  useEffect(() => {
    if (!selectedMeritCycle) {
      setMeritCycleEditBudget('')
      setMeritCycleEditEffective('')
      return
    }
    setMeritCycleEditBudget(
      selectedMeritCycle.budget_amount != null ? String(selectedMeritCycle.budget_amount) : '',
    )
    setMeritCycleEditEffective(selectedMeritCycle.effective_from_default ?? '')
  }, [selectedMeritCycle?.id, selectedMeritCycle?.budget_amount, selectedMeritCycle?.effective_from_default])

  const recoMatchingRun = useMemo(() => {
    if (!recoDeptId) return undefined
    const { year, month } = parsePayRunPeriod(recoPeriod)
    return runs.find((r) => r.department_id === recoDeptId && r.year === year && r.month === month)
  }, [runs, recoDeptId, recoPeriod])

  const recoPayPeriodLabel = useMemo(() => {
    const pr = recoMatchingRun
    if (!pr) return '—'
    const batch =
      pr.department_name ?? (pr.department_id == null ? 'All departments (legacy)' : '—')
    const label = new Date(pr.year, pr.month - 1, 1).toLocaleString('en-IN', {
      month: 'long',
      year: 'numeric',
    })
    return `${label} · ${batch}`
  }, [recoMatchingRun])

  const recoDepartmentName = useMemo(
    () => (recoDeptId ? departments.find((d) => d.id === recoDeptId)?.name ?? '—' : '—'),
    [recoDeptId, departments],
  )

  const recoEngineValues = useMemo(() => {
    if (!recoExpected?.eligible || recoExpected.headcount == null) return null
    return {
      headcount: recoExpected.headcount,
      total_gross: recoExpected.total_gross ?? 0,
      total_deductions: recoExpected.total_deductions ?? 0,
      total_net: recoExpected.total_net ?? 0,
    }
  }, [recoExpected])

  useEffect(() => {
    if (!companyId || tab !== 'reconciliation') return
    if (!recoMatchingRun?.id) {
      setRecoExpected(null)
      setRecoEngineLoading(false)
      return
    }
    let cancelled = false
    setRecoExpected(null)
    setRecoEngineLoading(true)
    void getReconciliationExpected(companyId, recoMatchingRun.id)
      .then((data) => {
        if (!cancelled) setRecoExpected(data)
      })
      .catch(() => {
        if (!cancelled) setRecoExpected(null)
      })
      .finally(() => {
        if (!cancelled) setRecoEngineLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [companyId, tab, recoMatchingRun?.id])

  const payslipFilteredEmployees = useMemo(() => {
    const pr = runs.find((r) => r.id === payRunId)
    if (!pr?.department_id) return employees
    return employees.filter((e) => e.department_id === pr.department_id)
  }, [employees, runs, payRunId])

  useEffect(() => {
    const pr = runs.find((r) => r.id === payRunId)
    if (!pr?.department_id || !payrollEmpId) return
    const rk = pr.run_kind || 'regular'
    if (rk !== 'regular') return
    const emp = employees.find((e) => e.id === payrollEmpId)
    if (emp && emp.department_id !== pr.department_id) {
      setPayrollEmpId('')
      setForm(emptyForm())
      setFieldOk({})
      setAllMatch(null)
      setDebugPanel(null)
      setSupplementalLines([])
    }
  }, [payRunId, runs, employees, payrollEmpId])

  const payrollEmployee = useMemo(() => employees.find((e) => e.id === payrollEmpId), [employees, payrollEmpId])

  const benefitsPremiumDisplay = useMemo(() => {
    if (!payrollEmpId || benefitPlans.length === 0) return 0
    const active = benefitEnrollments.filter(
      (e) => e.employee_id === payrollEmpId && String(e.status).toLowerCase() === 'active',
    )
    let sum = 0
    for (const en of active) {
      const plan = benefitPlans.find((p) => p.id === en.plan_id)
      const dj =
        plan?.details_json && typeof plan.details_json === 'object' ? (plan.details_json as Record<string, unknown>) : undefined
      sum += monthlyPremiumFromPlanDetails(dj)
    }
    return Math.round((sum + Number.EPSILON) * 100) / 100
  }, [payrollEmpId, benefitPlans, benefitEnrollments])

  const reimbursementTotalDisplay = useMemo(
    () =>
      supplementalLines
        .filter((r) => r.lineType === 'reimbursement')
        .reduce((s, r) => {
          const n = Number(String(r.amount).trim())
          return s + (Number.isFinite(n) && n > 0 ? n : 0)
        }, 0),
    [supplementalLines],
  )

  const selectedPayslip = useMemo(
    () => payslips.find((x) => x.pay_run_id === payRunId && x.employee_id === payrollEmpId),
    [payslips, payRunId, payrollEmpId],
  )

  useEffect(() => {
    if (!selectedPayslip) return
    const ej = selectedPayslip.earnings_json
    if (!ej || typeof ej !== 'object') {
      setSupplementalLines([])
      return
    }
    setSupplementalLines(parseSupplementalLinesFromEarnings(ej as Record<string, unknown>))
  }, [selectedPayslip])

  useEffect(() => {
    if (!companyId || tab !== 'payslips' || !selectedPayslip?.id) {
      setPayslipLedger([])
      return
    }
    let cancelled = false
    void listPayslipLedgerEntries(companyId, selectedPayslip.id)
      .then((rows) => {
        if (!cancelled) setPayslipLedger(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setPayslipLedger([])
      })
    return () => {
      cancelled = true
    }
  }, [companyId, tab, selectedPayslip?.id])

  useEffect(() => {
    if (!payslipViewOnly || !payRunId || !payrollEmpId) return
    const p = payslips.find((x) => x.pay_run_id === payRunId && x.employee_id === payrollEmpId)
    if (p) setForm(formFromPayslip(p))
    else setForm(emptyForm())
    setFieldOk({})
    setAllMatch(null)
    setDebugPanel(null)
  }, [payslipViewOnly, payRunId, payrollEmpId, payslips])

  const salaryEmployee = useMemo(() => employees.find((e) => e.id === structureEmpId), [employees, structureEmpId])

  const filteredAuditLog = useMemo(() => {
    const q = auditSearch.trim()
    if (!q) return auditLog
    return auditLog.filter((e) => {
      const hay = buildSalaryAuditSearchHay(e, employees, departments, structures)
      return matchesAuditSearch(hay, q)
    })
  }, [auditLog, auditSearch, employees, departments, structures])

  const salaryDeptName = useMemo(
    () => (salaryEmployee ? departments.find((d) => d.id === salaryEmployee.department_id)?.name : undefined),
    [departments, salaryEmployee],
  )
  const salaryPositionRow = useMemo(
    () => (salaryEmployee ? positions.find((p) => p.id === salaryEmployee.position_id) : undefined),
    [positions, salaryEmployee],
  )

  const payRunFullByDeptId = useMemo(() => {
    const m = new Map<string, PayRunDepartmentOverview>()
    for (const r of payRunOverviewFull) m.set(r.department_id, r)
    return m
  }, [payRunOverviewFull])

  const sortedPayRunOverview = useMemo(() => {
    const rows = [...payRunOverview]
    rows.sort((a, b) => {
      const aClosed = a.department_pay_run_status === 'payrun_closed' ? 1 : 0
      const bClosed = b.department_pay_run_status === 'payrun_closed' ? 1 : 0
      if (aClosed !== bClosed) return aClosed - bClosed
      return (a.department_name || '').localeCompare(b.department_name || '', undefined, { sensitivity: 'base' })
    })
    return rows
  }, [payRunOverview])

  const salaryHasStructure = !!editingStructureId
  const salaryFieldsEditable = !salaryHasStructure || salaryEditMode

  const gradeCtxInfo = useMemo(() => {
    if (!canConfigure || !gradeBands.length || !structureEmpId) return null
    const ctc = Number(String(ctcAnnual).replace(/,/g, '').trim())
    if (!Number.isFinite(ctc) || ctc <= 0) return null
    const current = activeBands(gradeBands)
    const band = matchGradeBand(ctc, current)
    return { ctc, band, hasBands: current.length > 0 }
  }, [canConfigure, gradeBands, structureEmpId, ctcAnnual])

  const ctcBandAlignment = gradeCtxInfo
    ? gradeCtxInfo.band
      ? 'in'
      : 'out'
    : null

  /* Engine preview: backend resolves salary structure. Refetch when employee, structures list, or loan/other inputs change (debounced). */
  const loanRecovery = form.loan_recovery
  const leaveDeduction = form.leave_deduction
  const otherDeductions = form.other_deductions
  useEffect(() => {
    if (!companyId || !payrollEmpId || !canConfigure || payslipViewOnly) {
      setEnginePreview(null)
      setEngineFetchError(null)
      setEngineLoading(false)
      return
    }
    setEngineLoading(true)
    setEngineFetchError(null)
    let cancelled = false
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const loan = Number(loanRecovery.trim() || 0)
          const leave = Number(leaveDeduction.trim() || 0)
          const other = Number(otherDeductions.trim() || 0)
          const res = await getSimCashEngineExpected(companyId, {
            employee_id: payrollEmpId,
            loan_recovery: loan,
            leave_deduction: leave,
            other_deductions: other,
          })
          if (!cancelled) {
            setEnginePreview({ expected: res.expected, employer_expected: res.employer_expected })
            setEngineFetchError(null)
          }
        } catch (e) {
          if (!cancelled) {
            setEnginePreview(null)
            setEngineFetchError(e instanceof Error ? e.message : 'Could not load engine reference')
          }
        } finally {
          if (!cancelled) setEngineLoading(false)
        }
      })()
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [companyId, payrollEmpId, canConfigure, payslipViewOnly, structures, loanRecovery, leaveDeduction, otherDeductions])

  function persistShowEngine(show: boolean) {
    setShowEngineColumn(show)
    try {
      localStorage.setItem(SIMCASH_SHOW_ENGINE_KEY, show ? 'true' : 'false')
    } catch {
      /* ignore */
    }
  }

  function persistReconciliationEngine(show: boolean) {
    setShowReconciliationEngine(show)
    try {
      localStorage.setItem(RECON_SHOW_ENGINE_KEY, show ? 'true' : 'false')
    } catch {
      /* ignore */
    }
  }

  function setRecoField(key: ReconciliationField, value: string) {
    setRecoForm((prev) => ({ ...prev, [key]: value }))
    setRecoFieldOk({})
    setRecoAllMatch(null)
  }

  function buildRecoSubmitted(): Record<string, number | string> {
    const o: Record<string, number | string> = {}
    for (const k of ['headcount', 'total_gross', 'total_deductions', 'total_net'] as const) {
      const raw = recoForm[k].trim()
      if (raw === '') o[k] = ''
      else o[k] = Number(raw)
    }
    return o
  }

  async function onRecoValidate() {
    if (!companyId || !recoMatchingRun?.id) {
      setError('Select a department and month with a pay run first.')
      return
    }
    if (!recoExpected?.eligible) {
      setError(recoExpected?.message ?? 'Reconciliation is not available for this pay run.')
      return
    }
    setPending(true)
    setError(null)
    try {
      const res = await validateReconciliation(companyId, {
        pay_run_id: recoMatchingRun.id,
        submitted: buildRecoSubmitted(),
      })
      const keys: ReconciliationField[] = ['headcount', 'total_gross', 'total_deductions', 'total_net']
      const next: Partial<Record<ReconciliationField, boolean>> = {}
      for (const k of keys) {
        next[k] = res.fields[k]?.ok ?? false
      }
      setRecoFieldOk(next)
      setRecoAllMatch(res.all_match)
      setRecoShowValidationColors(true)
      if (res.all_match) {
        setRecoBannerDismissed(false)
        setRecoPassBanner({ payRunId: recoMatchingRun.id })
      } else {
        setRecoPassBanner(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reconciliation validation failed')
    } finally {
      setPending(false)
    }
  }

  function setField(key: SimCashFormField, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFieldOk({})
    setAllMatch(null)
    setDebugPanel(null)
  }

  function buildSubmitted(): Record<string, number | string> {
    const o: Record<string, number | string> = {}
    for (const k of SIMCASH_FORM_FIELDS) {
      const raw = form[k].trim()
      if (raw === '') o[k] = ''
      else o[k] = Number(raw)
    }
    return o
  }

  function beginEditGradeBand(row: CompensationGradeBand) {
    setEditingBandId(row.id)
    setEditGradeBand({
      display_name: row.display_name ?? '',
      min_annual: String(row.min_annual),
      max_annual: String(row.max_annual),
      currency_code: row.currency_code || 'SIMCASH',
      effective_from: row.effective_from,
      notes: row.notes ?? '',
      org_position_grade_min: row.org_position_grade_min != null ? String(row.org_position_grade_min) : '',
    })
  }

  function cancelEditGradeBand() {
    setEditingBandId(null)
    setEditGradeBand(null)
  }

  async function submitNewGradeBand(e: FormEvent) {
    e.preventDefault()
    if (!companyId) return
    const mn = Math.round(Number(newGradeBand.min_annual))
    const mx = Math.round(Number(newGradeBand.max_annual))
    if (!newGradeBand.effective_from.trim() || !newGradeBand.org_position_grade_min.trim()) {
      setError('Effective from and org grade are required.')
      return
    }
    if (mn > mx) {
      setError('Min annual must be ≤ max annual.')
      return
    }
    const omin = newGradeBand.org_position_grade_min.trim()
    const orgN = Math.round(Number(omin))
    if (!Number.isFinite(orgN) || orgN < 1) {
      setError('Org grade must be a positive number.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await createGradeBand(companyId, {
        band_code: derivedBandCodeFromOrgGrade(orgN),
        display_name: newGradeBand.display_name.trim() || null,
        min_annual: mn,
        mid_annual: Math.round((mn + mx) / 2),
        max_annual: mx,
        currency_code: newGradeBand.currency_code.trim() || 'SIMCASH',
        effective_from: newGradeBand.effective_from.trim(),
        effective_to: null,
        notes: newGradeBand.notes.trim() || null,
        org_position_grade_min: orgN,
        org_position_grade_max: null,
      })
      showToast(
        'Grade band saved',
        `Org grade: ${orgN}${newGradeBand.display_name.trim() ? ` (${newGradeBand.display_name.trim()})` : ''} | Min: ₹S ${mn.toLocaleString('en-IN')} – Max: ₹S ${mx.toLocaleString('en-IN')}`,
      )
      setNewGradeBand(emptyNewGradeBandForm())
      setShowNewGradeBandForm(false)
      await refresh()
      if (searchParams.get('returnTo') === 'org') {
        navigate(`/company/${companyId}/org`)
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create grade band')
    } finally {
      setPending(false)
    }
  }

  async function saveEditGradeBand() {
    if (!companyId || !editingBandId || !editGradeBand) return
    const mn = Math.round(Number(editGradeBand.min_annual))
    const mx = Math.round(Number(editGradeBand.max_annual))
    if (mn > mx) {
      setError('Min annual must be ≤ max annual.')
      return
    }
    const omin = editGradeBand.org_position_grade_min.trim()
    const orgN = Math.round(Number(omin))
    if (!Number.isFinite(orgN) || orgN < 1) {
      setError('Org grade must be a positive number.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await updateGradeBand(companyId, editingBandId, {
        band_code: derivedBandCodeFromOrgGrade(orgN),
        display_name: editGradeBand.display_name.trim() || null,
        min_annual: mn,
        mid_annual: Math.round((mn + mx) / 2),
        max_annual: mx,
        currency_code: editGradeBand.currency_code.trim() || 'SIMCASH',
        effective_from: editGradeBand.effective_from.trim(),
        effective_to: null,
        notes: editGradeBand.notes.trim() || null,
        org_position_grade_min: orgN,
        org_position_grade_max: null,
      })
      showToast(
        'Grade band updated',
        `Org grade: ${orgN} | Min: ₹S ${mn.toLocaleString('en-IN')} – Max: ₹S ${mx.toLocaleString('en-IN')}`,
      )
      cancelEditGradeBand()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update grade band')
    } finally {
      setPending(false)
    }
  }

  async function onValidate() {
    if (!companyId || !payrollEmpId) {
      setError('Select an employee first.')
      return
    }
    setPending(true)
    setError(null)
    try {
      const useDebug = import.meta.env.DEV && devDebugHeader
      const res = await validatePayrollCalculation(
        companyId,
        { employee_id: payrollEmpId, pay_run_id: payRunId || null, submitted: buildSubmitted() },
        { debug: useDebug },
      )
      const next: Partial<Record<SimCashFormField, boolean>> = {}
      for (const k of SIMCASH_FORM_FIELDS) {
        next[k] = res.fields[k]?.ok ?? false
      }
      setFieldOk(next as Record<SimCashFormField, boolean>)
      setAllMatch(res.all_match)
      setShowValidationColors(true)
      setDebugPanel(useDebug ? res : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Validation failed')
    } finally {
      setPending(false)
    }
  }

  function buildEarningsDeductionsForSave() {
    const num = (k: SimCashFormField) => {
      const t = form[k].trim()
      return t === '' ? 0 : Number(t)
    }
    const earnings: Record<string, unknown> = {}
    for (const k of EARNINGS_KEYS) earnings[k] = num(k)
    const deductions: Record<string, number> = {}
    for (const k of DEDUCTION_KEYS) {
      if (k === 'net') continue
      deductions[k] = num(k)
    }
    const lines = supplementalLines
      .map((row) => {
        const a = row.amount.trim()
        const n = a === '' ? 0 : Number(a)
        if (!Number.isFinite(n) || n <= 0) return null
        const code = row.code.trim() || 'line'
        return { type: row.lineType, code, amount: n, taxable: row.taxable }
      })
      .filter((x): x is { type: SupplementalLineType; code: string; amount: number; taxable: boolean } => x != null)
    if (lines.length) earnings.lines = lines
    return { earnings_json: earnings, deductions_json: deductions, gross: num('gross'), net: num('net') }
  }

  function executeReleaseSalary() {
    if (!releaseConfirm || !companyId) return
    setPending(true)
    setError(null)
    void releaseEmployeeSalary(companyId, releaseConfirm.payRunId, releaseConfirm.employeeId)
      .then(() => {
        setReleaseConfirm(null)
        void refresh()
        void loadPeriodOverview()
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Release failed'))
      .finally(() => setPending(false))
  }

  async function onSavePayslip(e: FormEvent) {
    e.preventDefault()
    if (!canEditPayslip) return
    if (!companyId || !payrollEmpId || !payRunId) {
      setError('Employee and pay run are required.')
      return
    }
    if (allMatch === false) {
      const ok = window.confirm('SimCash validation did not pass. Save this payslip anyway?')
      if (!ok) return
    }
    setPending(true)
    setError(null)
    try {
      const { earnings_json, deductions_json, gross, net } = buildEarningsDeductionsForSave()
      await createPayslip(companyId, {
        employee_id: payrollEmpId,
        pay_run_id: payRunId,
        gross,
        net,
        earnings_json,
        deductions_json,
      })
      const refreshed = await refresh()
      await loadPeriodOverview()
      const prog = await computePayRunPayslipProgress(payRunId, refreshed?.runs)
      const allDone = prog.allDone && prog.total > 0
      setPayslipSaveBanner({
        payRunId,
        allDone,
        message: allDone
          ? 'All payslips generated for this pay run. Ready for reconciliation.'
          : `Payslip saved. ${prog.done} of ${prog.total} employees completed for this run.`,
      })
      const empName = payrollEmployee ? employeeLabel(payrollEmployee) : payrollEmpId
      showToast(
        'Payslip saved',
        `Employee: ${empName} | Gross: ₹S ${gross.toLocaleString('en-IN')} | Net: ₹S ${net.toLocaleString('en-IN')} | ${prog.done}/${prog.total} payslips done`,
      )
      touchRecentIdList(`hworkr_payroll_recent_emp_${companyId}`, payrollEmpId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save payslip')
    } finally {
      setPending(false)
    }
  }

  function fillStructureFieldsFromRow(st: SalaryStructure | undefined) {
    if (!st) {
      setEditingStructureId(null)
      setCtcAnnual('80000')
      setBonusPct('0.0625')
      setStructureEffectiveFrom('')
      return
    }
    setEditingStructureId(st.id)
    const { ctc, bonusPct: bp } = parseCtc(st)
    setCtcAnnual(ctc != null ? String(ctc) : '80000')
    setBonusPct(bp != null ? String(bp) : '0.0625')
    setStructureEffectiveFrom(st.effective_from ?? '')
  }

  function onSalaryEmployeeChange(empId: string) {
    setStructureEmpId(empId)
    setSalaryEditMode(false)
    if (empId && companyId) touchRecentIdList(`hworkr_payroll_recent_emp_${companyId}`, empId)
    if (!empId) {
      fillStructureFieldsFromRow(undefined)
      return
    }
    const emp = employees.find((e) => e.id === empId)
    if (emp) {
      setSalaryDeptId(emp.department_id ?? '')
      setSalaryPositionId(emp.position_id ?? '')
      setSalaryCodeInput(emp.employee_code)
    }
    const latest = structures
      .filter((s) => s.employee_id === empId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
    fillStructureFieldsFromRow(latest)
  }

  function onLookupEmployeeCode() {
    const code = salaryCodeInput.trim()
    if (!code || !companyId) return
    const found = employees.find((e) => e.employee_code.toLowerCase() === code.toLowerCase())
    if (!found) {
      setError(`No employee with code “${code}”.`)
      return
    }
    setError(null)
    onSalaryEmployeeChange(found.id)
  }

  function resetSalaryEditor() {
    setStructureEmpId('')
    setSalaryDeptId('')
    setSalaryPositionId('')
    setSalaryCodeInput('')
    setSalaryGradeInput('')
    setSalaryEditMode(false)
    fillStructureFieldsFromRow(undefined)
  }

  function cancelSalaryEdit() {
    if (!structureEmpId) return
    const latest = structures
      .filter((s) => s.employee_id === structureEmpId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
    fillStructureFieldsFromRow(latest)
    setSalaryEditMode(false)
  }

  async function onSaveSalaryStructure(e: FormEvent) {
    e.preventDefault()
    if (!companyId || !structureEmpId.trim()) return
    setPending(true)
    setError(null)
    try {
      const components = {
        ctc_annual: Number(ctcAnnual),
        bonus_pct_of_ctc: Number(bonusPct),
      }
      const eff = structureEffectiveFrom.trim() || null
      if (editingStructureId) {
        await updateSalaryStructure(companyId, editingStructureId, {
          components_json: components,
          effective_from: eff,
        })
      } else {
        await createSalaryStructure(companyId, {
          employee_id: structureEmpId.trim(),
          components_json: components,
          effective_from: eff,
        })
      }
      await updateEmployee(companyId, structureEmpId.trim(), {
        department_id: salaryDeptId || null,
        position_id: salaryPositionId || null,
      })
      if (salaryPositionId.trim()) {
        const g = Number(salaryGradeInput.trim())
        if (!Number.isNaN(g) && g >= 0 && g <= 999_999) {
          await updatePosition(companyId, salaryPositionId.trim(), { grade: Math.round(g) })
        }
      }
      if (salaryDeptId) {
        const posRows = await listPositions(companyId, salaryDeptId)
        setPositions(posRows)
      }
      const rows = await listEmployees(companyId)
      setEmployees(rows)
      await refresh()
      const empRow = rows.find((e) => e.id === structureEmpId.trim())
      const name = empRow ? employeeLabel(empRow) : structureEmpId.trim()
      setSalarySaveBanner({
        employeeId: structureEmpId.trim(),
        message: `Salary structure saved for ${name}. This employee can now be included in a pay run.`,
      })
      showToast(
        editingStructureId ? 'Salary structure updated' : 'Salary structure saved',
        `Employee: ${name} | CTC: ₹S ${Number(ctcAnnual).toLocaleString('en-IN')}/yr | Bonus: ${(Number(bonusPct) * 100).toFixed(1)}%${salaryGradeInput ? ` | Grade: ${salaryGradeInput}` : ''}`,
      )
      touchRecentIdList(`hworkr_payroll_recent_emp_${companyId}`, structureEmpId.trim())
      setSalaryEditMode(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save salary structure')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={styles.org}>
      <p className={styles.flowHint}>
        SimCash (₹S) payroll: assign a salary structure (annual CTC), pick a pay run, then complete the worksheet. The{' '}
        <strong>Engine reference</strong> column shows backend-calculated monthly values for verification. Use{' '}
        <strong>Validate</strong> to highlight fields within tolerance; optional dev debug still available below.
      </p>

      <AlertModal
        open={Boolean(error || engineFetchError)}
        title={error ? 'Error' : 'Engine reference'}
        message={error ?? engineFetchError ?? ''}
        variant={error ? 'error' : 'info'}
        onClose={() => {
          setError(null)
          setEngineFetchError(null)
        }}
      />

      <ToastNotification toasts={toasts} onDismiss={dismissToast} />

      {canConfigure && tab === 'salary' ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Salary structures (SimCash CTC)</h3>
          <p className={styles.flowHint}>
            Pick a <strong>department</strong>, then a <strong>position</strong> (optional filter). Choose an <strong>employee</strong> or enter their{' '}
            <strong>employee code</strong> and use Look up.             CTC and bonus load from the latest saved structure when available. Saving writes the SimCash
            structure, sets the employee&apos;s department and position, and updates <strong>grade</strong> on the
            selected org position when a position is chosen.
          </p>

          <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            <label className={styles.hint}>
              Department
              <select
                className={styles.input}
                value={salaryDeptId}
                onChange={(e) => {
                  const v = e.target.value
                  setSalaryDeptId(v)
                  setSalaryPositionId('')
                  setStructureEmpId('')
                  setSalaryCodeInput('')
                  setSalaryEditMode(false)
                  fillStructureFieldsFromRow(undefined)
                }}
              >
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.hint}>
              Position
              <select
                className={styles.input}
                value={salaryPositionId}
                onChange={(e) => {
                  const v = e.target.value
                  setSalaryPositionId(v)
                  const p = positions.find((x) => x.id === v)
                  setSalaryGradeInput(p ? String(p.grade) : '')
                }}
                disabled={!salaryDeptId}
              >
                <option value="">Any position in department</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!salaryDeptId ? (
            <p className={styles.muted}>Select a department to load positions and filter employees.</p>
          ) : null}

          <form onSubmit={onSaveSalaryStructure}>
            <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
              <label className={styles.hint}>
                Employee
                <select
                  className={styles.input}
                  value={structureEmpId}
                  onChange={(e) => onSalaryEmployeeChange(e.target.value)}
                >
                  <option value="">Select employee</option>
                  {salaryFilteredEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {employeeLabel(e)} ({e.employee_code})
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.hint}>
                Employee code
                <div className={styles.inline}>
                  <input
                    className={styles.input}
                    value={salaryCodeInput}
                    onChange={(e) => setSalaryCodeInput(e.target.value)}
                    placeholder="e.g. TOM-C01"
                    aria-label="Employee code"
                  />
                  <button type="button" className={styles.btnSm} onClick={() => onLookupEmployeeCode()}>
                    Look up
                  </button>
                </div>
              </label>
            </div>

            {!structureEmpId ? (
              <p className={styles.muted}>Select an employee to view their salary profile and SimCash CTC.</p>
            ) : !salaryEmployee ? (
              <p className={styles.error}>Employee not found in the current list. Refresh or pick another person.</p>
            ) : (
              <div className={styles.profileCard}>
                <div className={styles.profileHeader}>
                  <p className={styles.profileTitle}>
                    {employeeLabel(salaryEmployee)} <span className={styles.profileMeta}>· {salaryEmployee.employee_code}</span>
                  </p>
                  <span className={salaryHasStructure ? `${styles.badge} ${styles.badgeGreen}` : `${styles.badge} ${styles.badgeAmber}`}>
                    {salaryHasStructure ? `Existing · effective ${structureEffectiveFrom || '—'}` : 'New recruit — confirm CTC & bonus'}
                  </span>
                </div>
                <div className={styles.profileGrid}>
                  <span className={styles.profileLabel}>Department</span>
                  <span>{salaryDeptName ?? '—'}</span>
                  <span className={styles.profileLabel}>Position (designation)</span>
                  <span>{salaryPositionRow?.name ?? '—'}</span>
                  <span className={styles.profileLabel}>Grade (org position)</span>
                  <span>
                    {salaryFieldsEditable && salaryPositionId ? (
                      <select
                        className={styles.input}
                        value={salaryGradeInput}
                        onChange={(e) => setSalaryGradeInput(e.target.value)}
                        aria-label="Grade for org position"
                      >
                        <option value="">— Select grade —</option>
                        {allOrgGrades.map((g) => (
                          <option key={g} value={String(g)}>Grade {g}</option>
                        ))}
                      </select>
                    ) : (
                      <span>{salaryPositionId ? (salaryGradeInput ? `Grade ${salaryGradeInput}` : '—') : '—'}</span>
                    )}
                  </span>
                </div>

                <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginTop: '1rem' }}>
                  <label className={styles.hint}>
                    ₹S CTC / year
                    {salaryFieldsEditable ? (
                      <input
                        className={styles.input}
                        type="number"
                        min={1}
                        step={1}
                        value={ctcAnnual}
                        onChange={(e) => setCtcAnnual(e.target.value)}
                        required
                      />
                    ) : (
                      <div className={styles.fieldLocked}>{Number(ctcAnnual).toLocaleString('en-IN')}</div>
                    )}
                  </label>
                  <label className={styles.hint}>
                    Bonus % of CTC (0–1)
                    {salaryFieldsEditable ? (
                      <input
                        className={styles.input}
                        type="number"
                        min={0}
                        max={1}
                        step={0.0001}
                        value={bonusPct}
                        onChange={(e) => setBonusPct(e.target.value)}
                      />
                    ) : (
                      <div className={styles.fieldLocked}>{(Number(bonusPct) * 100).toFixed(2)}%</div>
                    )}
                  </label>
                  <label className={styles.hint}>
                    Effective from (optional)
                    {salaryFieldsEditable ? (
                      <input
                        className={styles.input}
                        type="text"
                        value={structureEffectiveFrom}
                        onChange={(e) => setStructureEffectiveFrom(e.target.value)}
                        placeholder="YYYY-MM-DD"
                      />
                    ) : (
                      <div className={styles.fieldLocked}>{structureEffectiveFrom || '—'}</div>
                    )}
                  </label>
                  <label className={styles.hint}>
                    Grade (org position)
                    {salaryFieldsEditable && salaryPositionId ? (
                      <select
                        className={styles.input}
                        value={salaryGradeInput}
                        onChange={(e) => setSalaryGradeInput(e.target.value)}
                        aria-label="Grade for org position"
                      >
                        <option value="">— Select grade —</option>
                        {allOrgGrades.map((g) => (
                          <option key={g} value={String(g)}>Grade {g}</option>
                        ))}
                      </select>
                    ) : (
                      <div className={styles.fieldLocked}>
                        {salaryPositionId ? (salaryGradeInput ? `Grade ${salaryGradeInput}` : '—') : '—'}
                      </div>
                    )}
                  </label>
                </div>
                {gradeCtxInfo ? (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 6,
                      background: gradeCtxInfo.band ? 'rgba(27,79,114,0.07)' : 'rgba(0,0,0,0.04)',
                      border: '1px solid',
                      borderColor: gradeCtxInfo.band ? 'rgba(27,79,114,0.25)' : 'var(--border)',
                      maxWidth: '44rem',
                      fontSize: '0.85rem',
                    }}
                  >
                    {gradeCtxInfo.band ? (() => {
                      const b = gradeCtxInfo.band
                      const pct = bandPosPct(gradeCtxInfo.ctc, b)
                      const aboveMax = gradeCtxInfo.ctc > b.max_annual
                      const belowMin = gradeCtxInfo.ctc < b.min_annual
                      return (
                        <>
                          <span style={{ fontWeight: 600 }}>Grade: {b.band_code}</span>
                          {b.display_name ? ` (${b.display_name})` : ''}{' '}
                          <span className={styles.muted}>{fmtSC(b.min_annual)} – {fmtSC(b.max_annual)}</span>
                          {' | '}
                          <span>Position in band: {pct.toFixed(0)}%</span>
                          <div style={{ marginTop: '0.35rem', height: 6, background: 'rgba(0,0,0,0.1)', borderRadius: 3, maxWidth: 260, position: 'relative' }}>
                            <div style={{ position: 'absolute', left: `${Math.min(100, pct)}%`, top: -3, width: 12, height: 12, borderRadius: '50%', background: 'var(--accent, #1b4f72)', transform: 'translateX(-50%)' }} />
                          </div>
                          {aboveMax ? (
                            <div style={{ color: '#b45309', marginTop: '0.25rem' }}>
                              Above {b.band_code} maximum by {fmtSC(gradeCtxInfo.ctc - b.max_annual)} — consider promotion to next band
                            </div>
                          ) : belowMin ? (
                            <div style={{ color: '#b45309', marginTop: '0.25rem' }}>
                              Below {b.band_code} minimum by {fmtSC(b.min_annual - gradeCtxInfo.ctc)}
                            </div>
                          ) : null}
                        </>
                      )
                    })() : (
                      <span className={styles.muted}>No matching grade band for this CTC — check Grade structure tab.</span>
                    )}
                  </div>
                ) : null}

                <div className={styles.inline} style={{ marginTop: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {salaryHasStructure && !salaryFieldsEditable ? (
                    <button type="button" className={styles.btnSm} onClick={() => setSalaryEditMode(true)}>
                      Edit
                    </button>
                  ) : null}
                  {salaryHasStructure && salaryFieldsEditable ? (
                    <button type="button" className={styles.btnSm} onClick={() => void cancelSalaryEdit()}>
                      Cancel
                    </button>
                  ) : null}
                  <button
                    className={styles.btnSm}
                    type="submit"
                    disabled={pending || !structureEmpId || (salaryHasStructure && !salaryFieldsEditable)}
                  >
                    {salaryHasStructure ? 'Save changes' : 'Confirm & save'}
                  </button>
                  <button type="button" className={styles.btnSm} onClick={() => resetSalaryEditor()}>
                    Clear
                  </button>
                </div>
              </div>
            )}
          </form>

          <h4 className={styles.h3} style={{ marginTop: '1.5rem' }}>
            Change history
          </h4>
          <p className={styles.flowHint}>
            Search by <strong>actor</strong> (name, email, user id), <strong>affected employee</strong> (name, code, employee id),{' '}
            <strong>department</strong> (name or id), <strong>structure / audit ids</strong>, or change text. Multiple words must all match.
          </p>
          <label className={styles.hint} style={{ display: 'block', marginBottom: '0.75rem' }}>
            Search log
            <input
              className={styles.input}
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="User, department, employee, or UUID…"
            />
          </label>
          {loading ? (
            <p className={styles.muted}>Loading…</p>
          ) : filteredAuditLog.length === 0 ? (
            <p className={styles.muted}>{auditLog.length === 0 ? 'No salary structure changes yet.' : 'No matches for your search.'}</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>By</th>
                    <th>Employee</th>
                    <th>Action</th>
                    <th>What changed</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLog.map((e) => {
                    const empId = auditAffectedEmployeeId(e, structures)
                    const emp = employees.find((x) => x.id === empId)
                    const empLabel = emp ? `${employeeLabel(emp)} (${emp.employee_code})` : empId ? empId.slice(0, 8) + '…' : '—'
                    const when = new Date(e.timestamp)
                    return (
                      <tr key={e.id}>
                        <td>{when.toLocaleString()}</td>
                        <td>
                          {e.user_name ?? '—'}
                          {e.user_email ? <span className={styles.muted}> · {e.user_email}</span> : null}
                        </td>
                        <td>{empLabel}</td>
                        <td>{e.action}</td>
                        <td>{formatSalaryAuditSummary(e)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {canConfigure && tab === 'runs' ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Pay runs</h3>
          <p className={styles.flowHint}>
            Only departments with a <strong>pay run</strong> for the selected month are listed. Expand a row for a searchable employee table.{' '}
            {isPayAdmin
              ? 'Create a pay run for a department first; filters below apply to that list.'
              : isHrOps
                ? 'Use filters to narrow rows, then open an employee or use Release salary when appropriate.'
                : 'Use filters to narrow rows, then open an employee to view their payslip.'}
          </p>

          {isPayAdmin ? (
            <div style={{ marginBottom: '1.25rem' }}>
              <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                <label className={styles.hint}>
                  Month for new pay run
                  <select className={styles.input} value={payRunPeriod} onChange={(e) => setPayRunPeriod(e.target.value)}>
                    {monthYearDropdownOptions().map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.hint}>
                  Run kind
                  <select
                    className={styles.input}
                    value={createPayRunKind}
                    onChange={(e) => {
                      const v = e.target.value as PayRunRunKind
                      setCreatePayRunKind(v)
                      if (v === 'regular') {
                        setCreatePayRunPayDate('')
                        setCreatePayRunLabel('')
                      }
                    }}
                  >
                    <option value="regular">Regular (monthly batch)</option>
                    <option value="off_cycle">Off-cycle</option>
                    <option value="supplemental">Supplemental</option>
                  </select>
                </label>
                <label className={styles.hint}>
                  {createPayRunKind === 'regular' ? 'Department (required)' : 'Department (optional)'}
                  <select
                    className={styles.input}
                    value={createPayRunDeptId}
                    onChange={(e) => setCreatePayRunDeptId(e.target.value)}
                  >
                    <option value="">{createPayRunKind === 'regular' ? 'Select department' : 'All / none'}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                {createPayRunKind !== 'regular' ? (
                  <>
                    <label className={styles.hint}>
                      Pay date
                      <input
                        className={styles.input}
                        type="date"
                        value={createPayRunPayDate}
                        onChange={(e) => setCreatePayRunPayDate(e.target.value)}
                      />
                    </label>
                    <label className={styles.hint}>
                      Label / reason
                      <input
                        className={styles.input}
                        value={createPayRunLabel}
                        onChange={(e) => setCreatePayRunLabel(e.target.value)}
                        placeholder="e.g. Bonus correction, travel reimbursement batch"
                      />
                    </label>
                  </>
                ) : null}
                <button
                  className={styles.btnSm}
                  type="button"
                  disabled={pending || (createPayRunKind === 'regular' && !createPayRunDeptId)}
                  onClick={() => {
                    const { year, month } = parsePayRunPeriod(payRunPeriod)
                    setPending(true)
                    setError(null)
                    void (async () => {
                      try {
                        const created = await createPayRun(companyId, {
                          month,
                          year,
                          status: 'draft',
                          department_id: createPayRunDeptId || null,
                          run_kind: createPayRunKind,
                          pay_date:
                            createPayRunKind !== 'regular' && createPayRunPayDate.trim()
                              ? createPayRunPayDate.trim()
                              : null,
                          run_label:
                            createPayRunKind !== 'regular' && createPayRunLabel.trim()
                              ? createPayRunLabel.trim()
                              : null,
                        })
                        const deptName =
                          departments.find((d) => d.id === (created.department_id ?? ''))?.name ??
                          (created.department_id ? 'Selected department' : 'Company-wide')
                        const monthLabel = new Date(created.year, created.month - 1, 1).toLocaleString('en-IN', {
                          month: 'long',
                          year: 'numeric',
                        })
                        let ready = 0
                        if (created.department_id) {
                          ready = employees.filter((e) => e.department_id === created.department_id).length
                        } else if (createPayRunKind === 'regular') {
                          ready = 0
                        } else {
                          ready = employees.length
                        }
                        setPayRunCreatedBanner({
                          payRunId: created.id,
                          message: `Pay run created for ${deptName}, ${monthLabel}. ${ready} employee${ready === 1 ? '' : 's'} ready for payslip processing.`,
                          cta: 'Go to Payslips →',
                        })
                        showToast(
                          'Pay run created',
                          `Period: ${monthLabel} | Department: ${deptName} | Kind: ${createPayRunKind} | ${ready} employee${ready === 1 ? '' : 's'} eligible`,
                        )
                        setCreatePayRunDeptId('')
                        setCreatePayRunPayDate('')
                        setCreatePayRunLabel('')
                        await refresh()
                        await loadPeriodOverview()
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Failed to create pay run')
                      } finally {
                        setPending(false)
                      }
                    })()
                  }}
                >
                  Create pay run
                </button>
              </div>
              <p className={styles.muted} style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem' }}>
                Regular runs stay one per department per month. Off-cycle and supplemental runs can repeat and may omit a department so any employee can be paid.
              </p>
            </div>
          ) : null}

          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '1rem',
              marginBottom: '1rem',
              background: 'rgba(0,0,0,0.02)',
            }}
          >
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 600 }}>Filter pay runs</p>
            <p className={styles.muted} style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem' }}>
              Narrow the department list (same calendar month as above).
            </p>
            <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
              <label className={styles.hint}>
                Month
                <select className={styles.input} value={payRunPeriod} onChange={(e) => setPayRunPeriod(e.target.value)}>
                  {monthYearDropdownOptions().map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.hint}>
                Department
                <select className={styles.input} value={runsViewDeptFilter} onChange={(e) => setRunsViewDeptFilter(e.target.value)}>
                  <option value="">All with pay runs</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.hint}>
                Employee status
                <select className={styles.input} value={lineStatusFilter} onChange={(e) => setLineStatusFilter(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="to_be_processed">To be processed</option>
                  <option value="payslip_generated">Payslip generated</option>
                  <option value="salary_released">Salary released</option>
                </select>
              </label>
            </div>
          </div>

          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '1rem',
              marginBottom: '1rem',
              background: 'rgba(0,0,0,0.02)',
            }}
          >
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 600 }}>Runs in selected month</p>
            <p className={styles.muted} style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem' }}>
              Includes regular, off-cycle, and supplemental batches for the same calendar month as above. Use the filter to focus on non-regular runs.
            </p>
            <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
              <label className={styles.hint}>
                Kind filter
                <select
                  className={styles.input}
                  value={runsKindListFilter}
                  onChange={(e) => setRunsKindListFilter(e.target.value as typeof runsKindListFilter)}
                >
                  <option value="all">All kinds</option>
                  <option value="regular_only">Regular only</option>
                  <option value="non_regular">Off-cycle & supplemental only</option>
                </select>
              </label>
            </div>
            {filteredRunsForPeriodList.length === 0 ? (
              <p className={styles.muted}>No pay runs for this month match the filter.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Kind</th>
                      <th>Department</th>
                      <th>Pay date</th>
                      <th>Label</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRunsForPeriodList.map((r) => (
                      <tr key={r.id}>
                        <td>{payRunKindLabel(r.run_kind)}</td>
                        <td>{r.department_name ?? (r.department_id == null ? '—' : r.department_id.slice(0, 8) + '…')}</td>
                        <td>{r.pay_date?.trim() ? r.pay_date : '—'}</td>
                        <td>{r.run_label?.trim() ? r.run_label : '—'}</td>
                        <td>{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {overviewLoading ? (
            <p className={styles.muted}>Loading…</p>
          ) : payRunOverview.length === 0 ? (
            <p className={styles.muted}>
              {isPayAdmin
                ? 'No regular department pay runs for this month in the overview yet. Off-cycle runs appear in the table above; create a regular run per department for this grid.'
                : 'No pay runs for this month yet.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {sortedPayRunOverview.map((row) => {
                const open = !!expandedRunDeptIds[row.department_id]
                const q = runEmpSearchByDept[row.department_id] ?? ''
                const tableRows = row.employees.filter((emp) => matchesPayRunEmpSearch(emp, q))
                const isClosed = row.department_pay_run_status === 'payrun_closed'
                const deptLabel = isClosed ? 'Payrun closed' : 'Pay run created'
                const statusForAria = isClosed ? 'Pay run is closed and finalized.' : 'Pay run is open and in progress.'
                return (
                  <div
                    key={row.department_id}
                    className={`${styles.payRunDeptCard} ${isClosed ? styles.payRunDeptCardClosed : styles.payRunDeptCardOpen}`}
                  >
                    <button
                      type="button"
                      className={styles.payRunRowToggle}
                      aria-expanded={open}
                      aria-label={`${row.department_name}. ${statusForAria} ${open ? 'Employee list expanded.' : 'Employee list collapsed.'}`}
                      onClick={() =>
                        setExpandedRunDeptIds((prev) => ({
                          ...prev,
                          [row.department_id]: !prev[row.department_id],
                        }))
                      }
                    >
                      <span aria-hidden>{open ? '▼' : '▶'}</span>
                      <strong className={styles.payRunRowDept}>{row.department_name}</strong>
                      <span
                        className={`${styles.payRunStatusPill} ${isClosed ? styles.payRunStatusPillClosed : styles.payRunStatusPillOpen}`}
                      >
                        {isClosed ? (
                          <svg
                            className={styles.payRunStatusSvg}
                            width={14}
                            height={14}
                            viewBox="0 0 16 16"
                            aria-hidden
                            focusable="false"
                          >
                            <polyline
                              points="3.5 8.2 6.8 11.5 12.5 4.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          <svg
                            className={styles.payRunStatusSvg}
                            width={14}
                            height={14}
                            viewBox="0 0 16 16"
                            aria-hidden
                            focusable="false"
                          >
                            <circle
                              cx="8"
                              cy="8"
                              r="4.75"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.75"
                            />
                          </svg>
                        )}
                        {deptLabel}
                      </span>
                    </button>
                    {open ? (
                      <>
                        <label className={styles.hint} style={{ display: 'block', marginTop: '0.75rem' }}>
                          Search employees
                          <input
                            className={styles.input}
                            value={runEmpSearchByDept[row.department_id] ?? ''}
                            onChange={(e) =>
                              setRunEmpSearchByDept((prev) => ({
                                ...prev,
                                [row.department_id]: e.target.value,
                              }))
                            }
                            placeholder="Code, name, email, or id…"
                            aria-label="Search employees in department"
                          />
                        </label>
                        {row.employees.length === 0 ? (
                          <p className={styles.muted} style={{ marginTop: '0.5rem' }}>
                            No employees match the status filter. Clear Status or pick another month.
                          </p>
                        ) : (
                          <div className={styles.tableWrap} style={{ marginTop: '0.5rem' }}>
                            <table className={styles.table}>
                              <thead>
                                <tr>
                                  <th>Employee code</th>
                                  <th>Name</th>
                                  <th>Email</th>
                                  <th>Grade</th>
                                  <th>Payroll status</th>
                                  <th className={styles.tableCellActions}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tableRows.length === 0 ? (
                                  <tr>
                                    <td colSpan={6} className={styles.muted}>
                                      No employees match this search.
                                    </td>
                                  </tr>
                                ) : (
                                  tableRows.map((emp) => {
                                    const empStructures = structures
                                      .filter((s) => s.employee_id === emp.employee_id)
                                      .sort((a, z) => z.created_at.localeCompare(a.created_at))
                                    const empCtc = empStructures[0]?.ctc_annual
                                    const empBand = empCtc != null ? matchGradeBand(empCtc, activeBands(gradeBands)) : null
                                    return (
                                    <tr key={emp.employee_id}>
                                      <td>{emp.employee_code}</td>
                                      <td>{emp.full_name}</td>
                                      <td>{emp.email ?? '—'}</td>
                                      <td style={{ color: empBand ? undefined : 'var(--muted, #888)' }}>
                                        {empBand ? empBand.band_code : '—'}
                                      </td>
                                      <td>{payrollStatusLabel(emp.payroll_status)}</td>
                                      <td className={styles.tableCellActions}>
                                        <button
                                          type="button"
                                          className={styles.linkBtn}
                                          disabled={!row.pay_run_id}
                                          onClick={() => {
                                            if (!row.pay_run_id) return
                                            navigate(
                                              `/company/${companyId}/payroll?tab=payslips&pay_run_id=${row.pay_run_id}&employee_id=${emp.employee_id}`,
                                            )
                                          }}
                                        >
                                          Open payslip
                                        </button>
                                        {isHrOps && emp.payroll_status === 'payslip_generated' ? (
                                          <>
                                            {' '}
                                            <button
                                              type="button"
                                              className={styles.btnSm}
                                              disabled={pending || !row.pay_run_id}
                                              onClick={() => {
                                                if (!row.pay_run_id) return
                                                setReleaseConfirm({
                                                  payRunId: row.pay_run_id,
                                                  employeeId: emp.employee_id,
                                                  employeeName: emp.full_name,
                                                })
                                              }}
                                            >
                                              Release salary
                                            </button>
                                          </>
                                        ) : null}
                                      </td>
                                    </tr>
                                  )
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      ) : null}

      {canConfigure && tab === 'grades' ? (
        <section className={styles.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 className={styles.h3} style={{ margin: 0 }}>Grade structure</h3>
            {canConfigure && !showNewGradeBandForm && !editingBandId ? (
              <button
                type="button"
                className={styles.btnSm}
                onClick={() => { setNewGradeBand(emptyNewGradeBandForm()); setShowNewGradeBandForm(true) }}
              >
                + New grade band
              </button>
            ) : null}
          </div>
          <p className={styles.flowHint} style={{ marginTop: '0.5rem' }}>
            Maintain company <strong>pay bands</strong> (min / max annual in SimCash). Rows are versioned by <strong>effective from</strong>.{' '}
            <strong>Org grade</strong> is the only grade identifier (a positive number); it links to positions in Org Structure.
          </p>

          {searchParams.get('returnTo') === 'org' ? (
            <div style={{ margin: '0 0 1rem', padding: '0.6rem 0.9rem', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 6, fontSize: '0.875rem', color: '#1e40af' }}>
              ← You came from <strong>Org Structure → Positions</strong>. Create a new grade band below, then you will be returned automatically.
            </div>
          ) : null}

          {gradeBands.length > 0 ? (() => {
            const cur = activeBands(gradeBands)
            const totalEmp = structures.reduce((acc, s) => {
              const already = acc.counted.has(s.employee_id)
              return already ? acc : { counted: new Set([...acc.counted, s.employee_id]), n: acc.n + 1 }
            }, { counted: new Set<string>(), n: 0 }).n
            const bandCounts = cur.map((b) => ({
              code: String(b.org_position_grade_min ?? b.band_code),
              count: [...new Set(structures.map((s) => s.employee_id))].filter((eid) => {
                const ss = structures.filter((x) => x.employee_id === eid).sort((a, z) => z.created_at.localeCompare(a.created_at))
                const ctc = ss[0]?.ctc_annual
                return ctc != null && ctc >= b.min_annual && ctc <= b.max_annual
              }).length,
            }))
            const total = bandCounts.reduce((s, b) => s + b.count, 0) || 1
            return (
              <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', height: 28, marginBottom: '1rem', border: '1px solid var(--border)' }}>
                {bandCounts.filter((b) => b.count > 0).map((b, i) => (
                  <div
                    key={b.code + i}
                    title={`${b.code}: ${b.count} employee${b.count !== 1 ? 's' : ''}`}
                    style={{
                      width: `${(b.count / total) * 100}%`,
                      minWidth: 32,
                      background: `hsl(${210 + i * 28}, 55%, ${48 + i * 4}%)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      paddingInline: 4,
                    }}
                  >
                    {b.code}: {b.count}
                  </div>
                ))}
                {totalEmp === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingInline: 8, fontSize: '0.8rem', color: 'var(--muted, #888)' }}>
                    No salary structures yet
                  </div>
                ) : null}
              </div>
            )
          })() : null}

          {unconfiguredOrgGrades.length > 0 ? (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.6rem 0.9rem',
                borderRadius: 6,
                background: 'rgba(180, 83, 9, 0.07)',
                border: '1px solid rgba(180, 83, 9, 0.3)',
                fontSize: '0.875rem',
              }}
            >
              <strong>Org grades without a band configured:</strong>{' '}
              {unconfiguredOrgGrades.join(', ')}
              {' — '}use the form below to add bands for these grades.
            </div>
          ) : null}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Display name</th>
                  <th>Min annual (₹S)</th>
                  <th>Max annual (₹S)</th>
                  <th>CCY</th>
                  <th>Effective from</th>
                  <th>Org grade</th>
                  <th>Employees in band</th>
                  <th>Notes</th>
                  <th className={styles.tableCellActions}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {gradeBands.length === 0 ? (
                  <tr>
                    <td colSpan={9} className={styles.muted}>
                      No grade bands yet. Use the form below to add one.
                    </td>
                  </tr>
                ) : (
                  gradeBands.map((row) => {
                    const empInBand = [...new Set(structures.map((s) => s.employee_id))].filter((eid) => {
                      const ss = structures.filter((x) => x.employee_id === eid).sort((a, z) => z.created_at.localeCompare(a.created_at))
                      const ctc = ss[0]?.ctc_annual
                      return ctc != null && ctc >= row.min_annual && ctc <= row.max_annual
                    }).length
                    return (
                      <tr key={row.id}>
                        <td>{row.display_name ?? '—'}</td>
                        <td>{row.min_annual.toLocaleString('en-IN')}</td>
                        <td>{row.max_annual.toLocaleString('en-IN')}</td>
                        <td>{row.currency_code}</td>
                        <td>{row.effective_from}</td>
                        <td>{row.org_position_grade_min ?? '—'}</td>
                        <td style={{ color: empInBand === 0 ? 'var(--muted, #888)' : undefined }}>
                          {empInBand} {empInBand === 1 ? 'employee' : 'employees'}
                        </td>
                        <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.notes ?? ''}>
                          {row.notes ?? '—'}
                        </td>
                        <td className={styles.tableCellActions}>
                          <button
                            type="button"
                            className={styles.linkBtn}
                            disabled={pending}
                            onClick={() => beginEditGradeBand(row)}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {editingBandId && editGradeBand ? (
            <form
              className={styles.card}
              style={{ marginTop: '1rem', padding: '1rem', border: '1px solid var(--border)' }}
              onSubmit={(e) => {
                e.preventDefault()
                void saveEditGradeBand()
              }}
            >
              <p className={styles.hint} style={{ marginTop: 0, fontWeight: 600 }}>
                Edit grade band <code>{editingBandId.slice(0, 8)}…</code>
              </p>
              <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginTop: '0.5rem' }}>
                <label className={styles.hint}>
                  Org grade number
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    step={1}
                    value={editGradeBand.org_position_grade_min}
                    onChange={(e) => setEditGradeBand((p) => (p ? { ...p, org_position_grade_min: e.target.value } : p))}
                    required
                  />
                </label>
                <label className={styles.hint}>
                  Display name
                  <input
                    className={styles.input}
                    value={editGradeBand.display_name}
                    onChange={(e) => setEditGradeBand((p) => (p ? { ...p, display_name: e.target.value } : p))}
                  />
                </label>
                <label className={styles.hint}>
                  Min annual (₹S)
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step={1}
                    value={editGradeBand.min_annual}
                    onChange={(e) => setEditGradeBand((p) => (p ? { ...p, min_annual: e.target.value } : p))}
                    required
                  />
                </label>
                <label className={styles.hint}>
                  Max annual (₹S)
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step={1}
                    value={editGradeBand.max_annual}
                    onChange={(e) => setEditGradeBand((p) => (p ? { ...p, max_annual: e.target.value } : p))}
                    required
                  />
                </label>
                <label className={styles.hint}>
                  Currency
                  <input
                    className={styles.input}
                    value={editGradeBand.currency_code}
                    onChange={(e) => setEditGradeBand((p) => (p ? { ...p, currency_code: e.target.value } : p))}
                  />
                </label>
                <label className={styles.hint}>
                  Effective from
                  <input
                    className={styles.input}
                    value={editGradeBand.effective_from}
                    onChange={(e) => setEditGradeBand((p) => (p ? { ...p, effective_from: e.target.value } : p))}
                    required
                  />
                </label>
              </div>
              <label className={styles.hint} style={{ display: 'block', marginTop: '0.75rem' }}>
                Notes
                <textarea
                  className={styles.input}
                  style={{ minHeight: 72, width: '100%', maxWidth: '48rem' }}
                  value={editGradeBand.notes}
                  onChange={(e) => setEditGradeBand((p) => (p ? { ...p, notes: e.target.value } : p))}
                />
              </label>
              <div className={styles.inline} style={{ marginTop: '0.75rem', gap: '0.5rem' }}>
                <button type="submit" className={styles.btnSm} disabled={pending}>
                  Save changes
                </button>
                <button type="button" className={styles.btnSm} onClick={() => cancelEditGradeBand()} disabled={pending}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {showNewGradeBandForm ? (
            <form
              onSubmit={submitNewGradeBand}
              className={styles.card}
              style={{ marginTop: '1rem', padding: '1rem', border: '1px solid var(--border)' }}
            >
              <p className={styles.hint} style={{ marginTop: 0, fontWeight: 600 }}>New grade band</p>
              <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                <label className={styles.hint} style={{ flex: '0 0 auto' }}>
                  Org grade number
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    step={1}
                    placeholder="e.g. 1, 2, 3"
                    value={newGradeBand.org_position_grade_min}
                    onChange={(e) => setNewGradeBand((p) => ({ ...p, org_position_grade_min: e.target.value }))}
                    required
                    autoFocus
                  />
                </label>
                <label className={styles.hint}>
                  Display name
                  <input
                    className={styles.input}
                    placeholder="e.g. Junior, Senior"
                    value={newGradeBand.display_name}
                    onChange={(e) => setNewGradeBand((p) => ({ ...p, display_name: e.target.value }))}
                  />
                </label>
                <label className={styles.hint}>
                  Min annual (₹S)
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step={1}
                    value={newGradeBand.min_annual}
                    onChange={(e) => setNewGradeBand((p) => ({ ...p, min_annual: e.target.value }))}
                    required
                  />
                </label>
                <label className={styles.hint}>
                  Max annual (₹S)
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step={1}
                    value={newGradeBand.max_annual}
                    onChange={(e) => setNewGradeBand((p) => ({ ...p, max_annual: e.target.value }))}
                    required
                  />
                </label>
                <label className={styles.hint}>
                  Currency
                  <input
                    className={styles.input}
                    value={newGradeBand.currency_code}
                    onChange={(e) => setNewGradeBand((p) => ({ ...p, currency_code: e.target.value }))}
                  />
                </label>
                <label className={styles.hint}>
                  Effective from
                  <input
                    className={styles.input}
                    value={newGradeBand.effective_from}
                    onChange={(e) => setNewGradeBand((p) => ({ ...p, effective_from: e.target.value }))}
                    required
                  />
                </label>
                <label className={styles.hint} style={{ flex: '1 1 100%', minWidth: 'min(100%, 36rem)' }}>
                  Notes (optional)
                  <textarea
                    className={styles.input}
                    style={{ minHeight: 56, width: '100%' }}
                    value={newGradeBand.notes}
                    onChange={(e) => setNewGradeBand((p) => ({ ...p, notes: e.target.value }))}
                  />
                </label>
              </div>
              <div className={styles.inline} style={{ marginTop: '0.75rem', gap: '0.5rem' }}>
                <button type="submit" className={styles.btnSm} disabled={pending}>
                  Save band
                </button>
                <button
                  type="button"
                  className={styles.btnSm}
                  disabled={pending}
                  onClick={() => { setShowNewGradeBandForm(false); setNewGradeBand(emptyNewGradeBandForm()) }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          <h3 className={styles.h3} style={{ marginTop: '1.5rem' }}>
            Grade band change history
          </h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>What changed</th>
                </tr>
              </thead>
              <tbody>
                {gradeBandAudit.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.muted}>
                      No audit entries yet.
                    </td>
                  </tr>
                ) : (
                  gradeBandAudit.map((e) => (
                    <tr key={e.id}>
                      <td>{new Date(e.timestamp).toLocaleString()}</td>
                      <td>
                        {e.user_name ?? '—'}
                        {e.user_email ? <span className={styles.muted}> · {e.user_email}</span> : null}
                      </td>
                      <td>{e.action}</td>
                      <td>{formatGradeBandAuditSummary(e)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {canConfigure && tab === 'merit' ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Merit / increment cycles</h3>
          <p className={styles.flowHint}>
            Set a cycle budget and per–grade-band increase bands as guidance, add employee proposals, then move proposals through <strong>draft → submitted → approved</strong>.
            <strong> Apply approved</strong> creates a new SimCash <code>SalaryStructure</code> for each approved row using the cycle&apos;s effective-from date (required before apply).
          </p>
          {meritLoading ? <p className={styles.muted}>Loading…</p> : null}

          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '1rem',
              marginBottom: '1rem',
              background: 'rgba(0,0,0,0.02)',
            }}
          >
            <h4 className={styles.h3} style={{ marginTop: 0 }}>Create cycle</h4>
            <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
              <label className={styles.hint}>
                Label
                <input
                  className={styles.input}
                  value={meritNewCycle.label}
                  onChange={(e) => setMeritNewCycle((s) => ({ ...s, label: e.target.value }))}
                  placeholder="FY26 merit"
                />
              </label>
              <label className={styles.hint}>
                Fiscal year
                <input
                  className={styles.input}
                  value={meritNewCycle.fiscal_year}
                  onChange={(e) => setMeritNewCycle((s) => ({ ...s, fiscal_year: e.target.value }))}
                  placeholder="FY26"
                />
              </label>
              <label className={styles.hint}>
                Budget (optional)
                <input
                  className={styles.input}
                  value={meritNewCycle.budget_amount}
                  onChange={(e) => setMeritNewCycle((s) => ({ ...s, budget_amount: e.target.value }))}
                  placeholder="e.g. 500000"
                />
              </label>
              <label className={styles.hint}>
                Currency
                <input
                  className={styles.input}
                  value={meritNewCycle.budget_currency}
                  onChange={(e) => setMeritNewCycle((s) => ({ ...s, budget_currency: e.target.value }))}
                />
              </label>
              <label className={styles.hint}>
                Effective from (default for apply)
                <input
                  className={styles.input}
                  type="date"
                  value={meritNewCycle.effective_from_default}
                  onChange={(e) => setMeritNewCycle((s) => ({ ...s, effective_from_default: e.target.value }))}
                />
              </label>
              <label className={styles.hint} style={{ minWidth: 200 }}>
                Notes
                <input
                  className={styles.input}
                  value={meritNewCycle.notes}
                  onChange={(e) => setMeritNewCycle((s) => ({ ...s, notes: e.target.value }))}
                />
              </label>
              <button
                type="button"
                className={styles.btnSm}
                disabled={pending || !companyId || !meritNewCycle.label.trim() || !meritNewCycle.fiscal_year.trim()}
                onClick={() => {
                  if (!companyId) return
                  setPending(true)
                  setError(null)
                  const b = meritNewCycle.budget_amount.trim()
                  void createCompensationReviewCycle(companyId, {
                    label: meritNewCycle.label.trim(),
                    fiscal_year: meritNewCycle.fiscal_year.trim(),
                    budget_amount: b === '' || Number.isNaN(Number(b)) ? null : Number(b),
                    budget_currency: meritNewCycle.budget_currency.trim() || 'SIMCASH',
                    effective_from_default: meritNewCycle.effective_from_default.trim() || null,
                    notes: meritNewCycle.notes.trim() || null,
                  })
                    .then((row) => {
                      showToast('Merit cycle created', `Label: ${row.label} | Year: ${row.fiscal_year}`)
                      setMeritNewCycle({
                        label: '',
                        fiscal_year: '',
                        budget_amount: '',
                        budget_currency: 'SIMCASH',
                        effective_from_default: '',
                        notes: '',
                      })
                      setMeritCycleId(row.id)
                      void loadMeritCycles()
                    })
                    .catch((err) => setError(err instanceof Error ? err.message : 'Failed to create cycle'))
                    .finally(() => setPending(false))
                }}
              >
                Create cycle
              </button>
            </div>
          </div>

          <label className={styles.hint} style={{ display: 'block', marginBottom: '1rem' }}>
            Active cycle
            <select
              className={styles.input}
              style={{ maxWidth: 520 }}
              value={meritCycleId}
              onChange={(e) => setMeritCycleId(e.target.value)}
            >
              <option value="">—</option>
              {meritCycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.fiscal_year}) · {c.state}
                </option>
              ))}
            </select>
          </label>

          {!selectedMeritCycle ? (
            <p className={styles.muted}>Select or create a cycle to manage guidelines and proposals.</p>
          ) : (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ margin: '0 0 0.5rem' }}>
                  <strong>State:</strong> {selectedMeritCycle.state}
                  {selectedMeritCycle.budget_amount != null ? (
                    <span className={styles.muted}>
                      {' '}
                      · Budget {selectedMeritCycle.budget_currency} {selectedMeritCycle.budget_amount}
                    </span>
                  ) : null}
                </p>
                <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className={styles.btnSm}
                    disabled={pending || !companyId || selectedMeritCycle.state === 'open'}
                    onClick={() => {
                      if (!companyId) return
                      setPending(true)
                      setError(null)
                      void updateCompensationReviewCycle(companyId, meritCycleId, { state: 'open' })
                        .then(() => {
                          showToast('Cycle opened', `${selectedMeritCycle.label} is now open for proposals`)
                          void loadMeritCycles()
                          void loadMeritCycleDetails()
                        })
                        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to open cycle'))
                        .finally(() => setPending(false))
                    }}
                  >
                    Mark open
                  </button>
                  <button
                    type="button"
                    className={styles.btnSm}
                    disabled={pending || !companyId || selectedMeritCycle.state === 'draft'}
                    onClick={() => {
                      if (!companyId) return
                      setPending(true)
                      setError(null)
                      void updateCompensationReviewCycle(companyId, meritCycleId, { state: 'draft' })
                        .then(() => {
                          showToast('Cycle returned to draft', selectedMeritCycle.label, 'info')
                          void loadMeritCycles()
                          void loadMeritCycleDetails()
                        })
                        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to set draft'))
                        .finally(() => setPending(false))
                    }}
                  >
                    Return to draft
                  </button>
                  <button
                    type="button"
                    className={styles.btnSm}
                    disabled={pending || !companyId || selectedMeritCycle.state === 'closed'}
                    onClick={() => {
                      if (!companyId) return
                      setPending(true)
                      setError(null)
                      void updateCompensationReviewCycle(companyId, meritCycleId, { state: 'closed' })
                        .then(() => {
                          showToast('Cycle closed', selectedMeritCycle.label, 'info')
                          void loadMeritCycles()
                          void loadMeritCycleDetails()
                        })
                        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to close cycle'))
                        .finally(() => setPending(false))
                    }}
                  >
                    Close cycle
                  </button>
                </div>
              </div>

              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '1rem',
                  marginBottom: '1rem',
                }}
              >
                <h4 className={styles.h3} style={{ marginTop: 0 }}>Cycle settings (budget & effective date)</h4>
                <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                  <label className={styles.hint}>
                    Budget amount
                    <input
                      className={styles.input}
                      value={meritCycleEditBudget}
                      onChange={(e) => setMeritCycleEditBudget(e.target.value)}
                      placeholder="Leave blank for none"
                    />
                  </label>
                  <label className={styles.hint}>
                    Effective from (apply)
                    <input
                      className={styles.input}
                      type="date"
                      value={meritCycleEditEffective}
                      onChange={(e) => setMeritCycleEditEffective(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.btnSm}
                    disabled={pending || !companyId}
                    onClick={() => {
                      if (!companyId) return
                      setPending(true)
                      setError(null)
                      const b = meritCycleEditBudget.trim()
                      void updateCompensationReviewCycle(companyId, meritCycleId, {
                        budget_amount: b === '' || Number.isNaN(Number(b)) ? null : Number(b),
                        effective_from_default: meritCycleEditEffective.trim() || null,
                      })
                        .then(() => {
                          void loadMeritCycles()
                          void loadMeritCycleDetails()
                        })
                        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to save cycle'))
                        .finally(() => setPending(false))
                    }}
                  >
                    Save settings
                  </button>
                </div>
              </div>

              {meritBudget ? (
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '1rem',
                    marginBottom: '1rem',
                    background: 'rgba(0,0,0,0.02)',
                  }}
                >
                  <h4 className={styles.h3} style={{ marginTop: 0 }}>Budget summary</h4>
                  <p style={{ margin: '0.25rem 0' }} className={styles.muted}>
                    Approved increase total: {meritBudget.budget_currency} {meritBudget.approved_increase_total.toFixed(0)} ({meritBudget.approved_count}{' '}
                    employees)
                  </p>
                  <p style={{ margin: '0.25rem 0' }} className={styles.muted}>
                    Submitted (pending) increase total: {meritBudget.budget_currency}{' '}
                    {meritBudget.submitted_increase_total.toFixed(0)} ({meritBudget.submitted_pending_count} proposals)
                  </p>
                  <p style={{ margin: '0.25rem 0' }} className={styles.muted}>
                    Employees hitting band ceiling:{' '}
                    <strong style={{ color: meritBandCeilingCount > 0 ? '#b45309' : undefined }}>
                      {meritBandCeilingCount}
                    </strong>
                    {meritBandCeilingCount > 0 ? ' — may need promotion or band adjustment' : ''}
                  </p>
                  {meritBudget.budget_amount != null ? (
                    <p style={{ margin: '0.25rem 0' }}>
                      Cycle budget cap: {meritBudget.budget_currency} {meritBudget.budget_amount}
                    </p>
                  ) : (
                    <p style={{ margin: '0.25rem 0' }} className={styles.muted}>
                      No cycle budget set — totals are informational only.
                    </p>
                  )}
                </div>
              ) : null}

              <div className={styles.inline} style={{ marginBottom: '1rem' }}>
                <button
                  type="button"
                  className={styles.btnSm}
                  disabled={pending || !companyId}
                  onClick={() => {
                    if (!companyId) return
                    if (!window.confirm('Create new salary structures for all approved proposals that are not yet applied?')) return
                    setPending(true)
                    setError(null)
                    void applyApprovedCompensationReviewProposals(companyId, meritCycleId)
                      .then((res) => {
                        void loadMeritCycleDetails()
                        void refresh()
                        if (res.count === 0) {
                          window.alert(
                            'No new structures were created. Approved proposals may already be applied, or employees may be missing a salary structure / cycle effective-from.',
                          )
                        }
                      })
                      .catch((err) => setError(err instanceof Error ? err.message : 'Apply failed'))
                      .finally(() => setPending(false))
                  }}
                >
                  Apply approved to salary structures
                </button>
              </div>

              <h4 className={styles.h3}>Guidelines by band</h4>
              <p className={styles.muted} style={{ fontSize: '0.875rem', marginTop: 0 }}>
                Min/max are percentages (0–100). Map proposals to a <code>band_code</code> manually when creating the proposal.
              </p>
              <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
                <label className={styles.hint}>
                  Band code
                  <select
                    className={styles.input}
                    value={meritNewGuideline.band_code}
                    onChange={(e) => setMeritNewGuideline((s) => ({ ...s, band_code: e.target.value }))}
                  >
                    <option value="">Select band</option>
                    {meritBandSelectOptions.map((bc) => (
                      <option key={bc} value={bc}>
                        {bc}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.hint}>
                  Min %
                  <input
                    className={styles.input}
                    value={meritNewGuideline.min_increase_pct}
                    onChange={(e) => setMeritNewGuideline((s) => ({ ...s, min_increase_pct: e.target.value }))}
                    placeholder="0"
                  />
                </label>
                <label className={styles.hint}>
                  Max %
                  <input
                    className={styles.input}
                    value={meritNewGuideline.max_increase_pct}
                    onChange={(e) => setMeritNewGuideline((s) => ({ ...s, max_increase_pct: e.target.value }))}
                    placeholder="12"
                  />
                </label>
                <button
                  type="button"
                  className={styles.btnSm}
                  disabled={pending || !companyId || !meritNewGuideline.band_code.trim()}
                  onClick={() => {
                    if (!companyId) return
                    const lo = Number(meritNewGuideline.min_increase_pct)
                    const hi = Number(meritNewGuideline.max_increase_pct)
                    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
                      setError('Enter numeric min and max increase %.')
                      return
                    }
                    setPending(true)
                    setError(null)
                    void createCompensationReviewGuideline(companyId, meritCycleId, {
                      band_code: meritNewGuideline.band_code.trim(),
                      min_increase_pct: lo,
                      max_increase_pct: hi,
                    })
                      .then(() => {
                        showToast('Guideline added', `Band: ${meritNewGuideline.band_code} | Min: ${lo}% – Max: ${hi}%`)
                        setMeritNewGuideline({ band_code: '', min_increase_pct: '', max_increase_pct: '' })
                        void loadMeritCycleDetails()
                      })
                      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to add guideline'))
                      .finally(() => setPending(false))
                  }}
                >
                  Add guideline
                </button>
              </div>
              <div className={styles.tableWrap} style={{ marginBottom: '1.5rem' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Band</th>
                      <th>Min %</th>
                      <th>Max %</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {meritGuidelines.length === 0 ? (
                      <tr>
                        <td colSpan={4} className={styles.muted}>
                          No guidelines yet.
                        </td>
                      </tr>
                    ) : (
                      meritGuidelines.map((g) => {
                        const gbMatch = activeBands(gradeBands).find((b) => b.band_code === g.band_code)
                        return (
                          <tr key={g.id}>
                            <td>
                              {g.band_code}
                              {gbMatch ? (
                                <span className={styles.muted} style={{ display: 'block', fontSize: '0.78rem' }}>
                                  {fmtSC(gbMatch.min_annual)} – {fmtSC(gbMatch.max_annual)}
                                </span>
                              ) : null}
                            </td>
                            <td>{g.min_increase_pct}%</td>
                            <td>{g.max_increase_pct}%</td>
                            <td>
                              <button
                                type="button"
                                className={styles.btnSm}
                                disabled={pending || !companyId}
                                onClick={() => {
                                  if (!companyId) return
                                  if (!window.confirm(`Delete guideline for band ${g.band_code}?`)) return
                                  setPending(true)
                                  setError(null)
                                  void deleteCompensationReviewGuideline(companyId, meritCycleId, g.id)
                                    .then(() => void loadMeritCycleDetails())
                                    .catch((err) => setError(err instanceof Error ? err.message : 'Delete failed'))
                                    .finally(() => setPending(false))
                                }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <h4 className={styles.h3}>Proposals</h4>
              <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
                <label className={styles.hint}>
                  Employee
                  <select
                    className={styles.input}
                    value={meritNewProposal.employee_id}
                    onChange={(e) => setMeritNewProposal((s) => ({ ...s, employee_id: e.target.value }))}
                  >
                    <option value="">Select</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {employeeLabel(emp)} ({emp.employee_code})
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.hint}>
                  Proposed CTC (annual)
                  <input
                    className={styles.input}
                    value={meritNewProposal.proposed_ctc_annual}
                    onChange={(e) => setMeritNewProposal((s) => ({ ...s, proposed_ctc_annual: e.target.value }))}
                  />
                </label>
                <label className={styles.hint}>
                  Band (optional)
                  <select
                    className={styles.input}
                    value={meritNewProposal.band_code}
                    onChange={(e) => setMeritNewProposal((s) => ({ ...s, band_code: e.target.value }))}
                  >
                    <option value="">—</option>
                    {meritBandSelectOptions.map((bc) => (
                      <option key={bc} value={bc}>
                        {bc}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.hint} style={{ minWidth: 200 }}>
                  Justification
                  <input
                    className={styles.input}
                    value={meritNewProposal.justification}
                    onChange={(e) => setMeritNewProposal((s) => ({ ...s, justification: e.target.value }))}
                  />
                </label>
                <button
                  type="button"
                  className={styles.btnSm}
                  disabled={pending || !companyId || !meritNewProposal.employee_id || !meritNewProposal.proposed_ctc_annual.trim()}
                  onClick={() => {
                    if (!companyId) return
                    const n = Math.round(Number(meritNewProposal.proposed_ctc_annual.trim()))
                    if (!Number.isFinite(n) || n < 0) {
                      setError('Enter a valid proposed annual CTC.')
                      return
                    }
                    setPending(true)
                    setError(null)
                    void createCompensationReviewProposal(companyId, meritCycleId, {
                      employee_id: meritNewProposal.employee_id,
                      proposed_ctc_annual: n,
                      band_code: meritNewProposal.band_code.trim() || null,
                      justification: meritNewProposal.justification.trim() || null,
                    })
                      .then(() => {
                        const empLabel = employees.find((e) => e.id === meritNewProposal.employee_id)
                        const eName = empLabel ? employeeLabel(empLabel) : meritNewProposal.employee_id
                        showToast('Proposal added', `Employee: ${eName} | Proposed CTC: ₹S ${n.toLocaleString('en-IN')}${meritNewProposal.band_code ? ` | Band: ${meritNewProposal.band_code}` : ''}`)
                        setMeritNewProposal({ employee_id: '', proposed_ctc_annual: '', band_code: '', justification: '' })
                        void loadMeritCycleDetails()
                      })
                      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to create proposal'))
                      .finally(() => setPending(false))
                  }}
                >
                  Add proposal
                </button>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Current CTC</th>
                      <th>Proposed</th>
                      <th>Grade impact</th>
                      <th>Band</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meritProposals.length === 0 ? (
                      <tr>
                        <td colSpan={7} className={styles.muted}>
                          No proposals yet.
                        </td>
                      </tr>
                    ) : (
                      meritProposals.map((p) => {
                        const emp = employees.find((e) => e.id === p.employee_id)
                        const empLab = emp ? `${employeeLabel(emp)} (${emp.employee_code})` : p.employee_id.slice(0, 8) + '…'
                        const cur = activeBands(gradeBands)
                        const curBand = matchGradeBand(p.current_ctc_annual, cur)
                        const proposed = Number(proposalEditCtc[p.id] ?? p.proposed_ctc_annual)
                        const propBand = Number.isFinite(proposed) ? matchGradeBand(proposed, cur) : null
                        const curPct = curBand ? bandPosPct(p.current_ctc_annual, curBand) : null
                        const propPct = propBand && Number.isFinite(proposed) ? bandPosPct(proposed, propBand) : null
                        const crossBand = curBand && propBand && curBand.id !== propBand.id
                        const exceedsCap = propBand && Number.isFinite(proposed) && proposed > propBand.max_annual
                        return (
                          <tr key={p.id}>
                            <td>{empLab}</td>
                            <td>{p.current_ctc_annual}</td>
                            <td>
                              {p.status === 'draft' || p.status === 'rejected' ? (
                                <input
                                  className={styles.input}
                                  style={{ maxWidth: 120 }}
                                  value={proposalEditCtc[p.id] ?? ''}
                                  onChange={(e) =>
                                    setProposalEditCtc((prev) => ({
                                      ...prev,
                                      [p.id]: e.target.value,
                                    }))
                                  }
                                />
                              ) : (
                                p.proposed_ctc_annual
                              )}
                            </td>
                            <td style={{ fontSize: '0.83rem', minWidth: 130 }}>
                              {curBand ? (
                                <span>{curBand.band_code} at {curPct?.toFixed(0)}%</span>
                              ) : (
                                <span className={styles.muted}>—</span>
                              )}
                              {propBand && curPct !== null && propPct !== null ? (
                                crossBand ? (
                                  <div style={{ color: '#b45309', fontWeight: 600 }}>
                                    → {propBand.band_code} at {propPct.toFixed(0)}% (promotion needed)
                                  </div>
                                ) : exceedsCap ? (
                                  <div style={{ color: '#b45309' }}>
                                    Exceeds {propBand.band_code} max
                                  </div>
                                ) : (
                                  <div className={styles.muted}>→ {propBand.band_code} at {propPct.toFixed(0)}%</div>
                                )
                              ) : null}
                            </td>
                            <td>{p.band_code ?? '—'}</td>
                            <td>
                              {p.status}
                              {p.applied_at ? <span className={styles.muted}> · applied</span> : null}
                            </td>
                            <td>
                              <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
                                {(p.status === 'draft' || p.status === 'rejected') && companyId ? (
                                  <button
                                    type="button"
                                    className={styles.btnSm}
                                    disabled={pending}
                                    onClick={() => {
                                      const raw = (proposalEditCtc[p.id] ?? '').trim()
                                      const n = Math.round(Number(raw))
                                      if (!Number.isFinite(n) || n < 0) {
                                        setError('Enter a valid proposed CTC before saving.')
                                        return
                                      }
                                      setPending(true)
                                      setError(null)
                                      void updateCompensationReviewProposal(companyId, meritCycleId, p.id, {
                                        proposed_ctc_annual: n,
                                      })
                                        .then(() => {
                                          showToast('Proposal updated', `Employee: ${empLab} | Proposed CTC: ₹S ${n.toLocaleString('en-IN')}`)
                                          void loadMeritCycleDetails()
                                        })
                                        .catch((err) => setError(err instanceof Error ? err.message : 'Save failed'))
                                        .finally(() => setPending(false))
                                    }}
                                  >
                                    Save
                                  </button>
                                ) : null}
                                {p.status === 'draft' && selectedMeritCycle.state === 'open' && companyId ? (
                                  <button
                                    type="button"
                                    className={styles.btnSm}
                                    disabled={pending}
                                    onClick={() => {
                                      setPending(true)
                                      setError(null)
                                      void submitCompensationReviewProposal(companyId, meritCycleId, p.id)
                                        .then(() => {
                                          showToast('Proposal submitted', `Employee: ${empLab}`)
                                          void loadMeritCycleDetails()
                                        })
                                        .catch((err) => setError(err instanceof Error ? err.message : 'Submit failed'))
                                        .finally(() => setPending(false))
                                    }}
                                  >
                                    Submit
                                  </button>
                                ) : null}
                                {p.status === 'submitted' && companyId ? (
                                  <>
                                    <button
                                      type="button"
                                      className={styles.btnSm}
                                      disabled={pending}
                                      onClick={() => {
                                        setPending(true)
                                        setError(null)
                                        void approveCompensationReviewProposal(companyId, meritCycleId, p.id)
                                          .then(() => {
                                            showToast('Proposal approved', `Employee: ${empLab}`)
                                            void loadMeritCycleDetails()
                                          })
                                          .catch((err) => setError(err instanceof Error ? err.message : 'Approve failed'))
                                          .finally(() => setPending(false))
                                      }}
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.btnSm}
                                      disabled={pending}
                                      onClick={() => {
                                        const reason = window.prompt('Rejection reason (optional)') ?? undefined
                                        setPending(true)
                                        setError(null)
                                        void rejectCompensationReviewProposal(companyId, meritCycleId, p.id, reason)
                                          .then(() => {
                                            showToast('Proposal rejected', `Employee: ${empLab}${reason ? ` | Reason: ${reason}` : ''}`, 'info')
                                            void loadMeritCycleDetails()
                                          })
                                          .catch((err) => setError(err instanceof Error ? err.message : 'Reject failed'))
                                          .finally(() => setPending(false))
                                      }}
                                    >
                                      Reject
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : null}

      {canConfigure && tab === 'reconciliation' ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Reconciliation (practice)</h3>
          <p className={styles.flowHint}>
            Roll up totals from saved payslips for a department pay run. Enter figures manually, then <strong>Validate</strong> — same tolerance as SimCash. This
            exercise does not affect salary release.
          </p>
          <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
            <label className={styles.hint}>
              Month
              <select className={styles.input} value={recoPeriod} onChange={(e) => setRecoPeriod(e.target.value)}>
                {monthYearDropdownOptions().map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.hint}>
              Department
              <select
                className={styles.input}
                value={recoDeptId}
                onChange={(e) => {
                  setRecoDeptId(e.target.value)
                  setRecoFieldOk({})
                  setRecoAllMatch(null)
                  setRecoShowValidationColors(false)
                }}
              >
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!recoDeptId ? (
            <p className={styles.muted}>Select a month and department.</p>
          ) : !recoMatchingRun ? (
            <p className={styles.muted}>No pay run found for this period and department.</p>
          ) : recoEngineLoading ? (
            <p className={styles.muted}>Loading reconciliation data…</p>
          ) : recoExpected && !recoExpected.eligible ? (
            <p className={styles.muted}>{recoExpected.message ?? 'Reconciliation is not available.'}</p>
          ) : recoExpected?.eligible ? (
            <>
              <ReconciliationWorksheet
                departmentName={recoDepartmentName}
                payPeriodLabel={recoPayPeriodLabel}
                form={recoForm}
                setField={setRecoField}
                fieldOk={recoFieldOk}
                showValidationColors={recoShowValidationColors}
                engineExpected={recoEngineValues}
                showEngineColumn={showReconciliationEngine}
                engineLoading={recoEngineLoading}
                onToggleEngineColumn={persistReconciliationEngine}
                readOnly={payslipViewOnly}
              />
              {!payslipViewOnly ? (
                <div className={styles.inline} style={{ marginTop: '1rem' }}>
                  <button className={styles.btnSm} type="button" disabled={pending} onClick={() => void onRecoValidate()}>
                    Validate (reconciliation)
                  </button>
                  <label className={styles.hint}>
                    <input
                      type="checkbox"
                      checked={recoShowValidationColors}
                      onChange={(e) => setRecoShowValidationColors(e.target.checked)}
                    />{' '}
                    Show green / red
                  </label>
                  {recoAllMatch === true ? <p className={styles.hint}>All fields match within tolerance.</p> : null}
                  {recoAllMatch === false ? <p className={styles.error}>Some fields need correction (see highlights).</p> : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className={styles.muted}>Could not load reconciliation data.</p>
          )}
        </section>
      ) : null}

      {canConfigure && tab === 'reimbursements' ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Reimbursements &amp; supplemental lines</h3>
          <p className={styles.flowHint} style={{ marginBottom: '0.75rem' }}>
            Pick a pay run and employee, then add reimbursement/supplemental rows. These lines are saved under{' '}
            <code>earnings_json.lines</code>. Save the payslip from the <strong>Payslips</strong> tab after updating lines.
          </p>
          <div className={styles.inline} style={{ marginBottom: '0.75rem' }}>
            <select
              className={styles.input}
              value={payRunId}
              onChange={(e) => {
                setPayRunId(e.target.value)
                setPayrollEmpId('')
                setSupplementalLines([])
              }}
            >
              <option value="">Pay run</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatPayRunOptionLabel(r)}
                </option>
              ))}
            </select>
            <select
              className={styles.input}
              value={payrollEmpId}
              onChange={(e) => {
                setPayrollEmpId(e.target.value)
                setSupplementalLines([])
              }}
            >
              <option value="">Employee</option>
              {payslipFilteredEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {employeeLabel(e)} ({e.employee_code})
                </option>
              ))}
            </select>
          </div>
          {payRunId && payslipFilteredEmployees.length === 0 ? (
            <p className={styles.muted}>
              No employees match this pay run (check department assignment on the run and on employees, or pick another run).
            </p>
          ) : null}

          <div style={{ marginTop: '1.25rem' }}>
            <p className={styles.muted} style={{ fontSize: '0.875rem', marginTop: 0 }}>
              Optional rows stored under <code>earnings_json.lines</code>. The sum of line amounts cannot exceed payslip <strong>gross</strong>. Mark reimbursements
              as non-taxable where appropriate (SimCash TDS is simplified; this flag is for future statutory work).
            </p>
            {canEditPayslip ? (
              <div className={styles.inline} style={{ marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  className={styles.btnSm}
                  disabled={pending}
                  onClick={() => setSupplementalLines((rows) => [...rows, newSupplementalLine()])}
                >
                  Add line
                </button>
              </div>
            ) : null}
            {supplementalLines.length === 0 ? (
              <p className={styles.muted}>No supplemental lines.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Code</th>
                      <th>Amount (₹S)</th>
                      <th>Taxable</th>
                      {canEditPayslip ? <th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {supplementalLines.map((row) => (
                      <tr key={row.id}>
                        <td>
                          {canEditPayslip ? (
                            <select
                              className={styles.input}
                              value={row.lineType}
                              onChange={(e) =>
                                setSupplementalLines((prev) =>
                                  prev.map((x) => (x.id === row.id ? { ...x, lineType: e.target.value as SupplementalLineType } : x)),
                                )
                              }
                            >
                              {SUPPLEMENTAL_LINE_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          ) : (
                            row.lineType
                          )}
                        </td>
                        <td>
                          {canEditPayslip ? (
                            <input
                              className={styles.input}
                              value={row.code}
                              onChange={(e) =>
                                setSupplementalLines((prev) => prev.map((x) => (x.id === row.id ? { ...x, code: e.target.value } : x)))
                              }
                              placeholder="TRAVEL"
                            />
                          ) : (
                            row.code || '—'
                          )}
                        </td>
                        <td>
                          {canEditPayslip ? (
                            <input
                              className={styles.input}
                              value={row.amount}
                              onChange={(e) =>
                                setSupplementalLines((prev) => prev.map((x) => (x.id === row.id ? { ...x, amount: e.target.value } : x)))
                              }
                            />
                          ) : (
                            row.amount || '—'
                          )}
                        </td>
                        <td>
                          {canEditPayslip ? (
                            <label className={styles.hint}>
                              <input
                                type="checkbox"
                                checked={row.taxable}
                                onChange={(e) =>
                                  setSupplementalLines((prev) => prev.map((x) => (x.id === row.id ? { ...x, taxable: e.target.checked } : x)))
                                }
                              />
                            </label>
                          ) : row.taxable ? (
                            'Yes'
                          ) : (
                            'No'
                          )}
                        </td>
                        {canEditPayslip ? (
                          <td>
                            <button
                              type="button"
                              className={styles.btnSm}
                              disabled={pending}
                              onClick={() => setSupplementalLines((prev) => prev.filter((x) => x.id !== row.id))}
                            >
                              Remove
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {selectedPayslip && payslipLedger.length > 0 ? (
            <div style={{ marginTop: '1.25rem' }}>
              <h4 className={styles.h3}>Payroll ledger (this payslip)</h4>
              <p className={styles.muted} style={{ fontSize: '0.875rem', marginTop: 0 }}>
                Posted buckets for analytics — salary remainder after supplemental lines plus one row per supplemental entry.
              </p>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Kind</th>
                      <th>Direction</th>
                      <th>Amount</th>
                      <th>Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payslipLedger.map((le) => (
                      <tr key={le.id}>
                        <td>{le.entry_kind}</td>
                        <td>{le.direction}</td>
                        <td>
                          {le.currency_code} {le.amount}
                        </td>
                        <td className={styles.muted} style={{ fontSize: '0.8125rem' }}>
                          {le.metadata_json ? JSON.stringify(le.metadata_json) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {canEditPayslip ? (
            <div className={styles.inline} style={{ marginTop: '1rem' }}>
              <button type="button" className={styles.btnSm} onClick={() => setTab('payslips')}>
                Go to Payslips tab to save
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'payslips' ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Payslips</h3>
          {canConfigure ? (
            <form onSubmit={onSavePayslip}>
              <p className={styles.flowHint} style={{ marginBottom: '0.75rem' }}>
                {payslipViewOnly ? (
                  <>
                    <strong>View only</strong> — select a pay run and employee to see saved payslip figures. HR and compensation roles can enter and save payslips.
                  </>
                ) : (
                  <>
                    Select a <strong>pay run</strong> first.{' '}
                    {!payRunMeta ? (
                      <>Then pick an employee; supplemental lines and ledger entries appear once a payslip exists for that pair.</>
                    ) : (payRunMeta.run_kind || 'regular') !== 'regular' ? (
                      <>
                        This is an <strong>off-cycle or supplemental</strong> batch — the employee list follows the run&apos;s department filter, or everyone in
                        the company when the run has no department.
                      </>
                    ) : payRunMeta.department_id == null ? (
                      <>The employee list includes <strong>all company employees</strong> when the run is not tied to a single department.</>
                    ) : (
                      <>
                        The employee list only includes people in <strong>that pay run&apos;s department</strong> when the run is department-scoped.
                      </>
                    )}
                  </>
                )}
              </p>
              <div className={styles.inline} style={{ marginBottom: '0.75rem' }}>
                <select
                  className={styles.input}
                  value={payRunId}
                  onChange={(e) => {
                    setPayRunId(e.target.value)
                    setPayrollEmpId('')
                    setForm(emptyForm())
                    setFieldOk({})
                    setAllMatch(null)
                    setDebugPanel(null)
                    setSupplementalLines([])
                  }}
                  required
                >
                  <option value="">Pay run</option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {formatPayRunOptionLabel(r)}
                    </option>
                  ))}
                </select>
                <select
                  className={styles.input}
                  value={payrollEmpId}
                  onChange={(e) => {
                    setPayrollEmpId(e.target.value)
                    setForm(emptyForm())
                    setFieldOk({})
                    setAllMatch(null)
                    setDebugPanel(null)
                    setSupplementalLines([])
                  }}
                  required
                >
                  <option value="">Employee</option>
                  {payslipFilteredEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {employeeLabel(e)} ({e.employee_code})
                    </option>
                  ))}
                </select>
              </div>
              {payRunId && payslipFilteredEmployees.length === 0 ? (
                <p className={styles.muted}>
                  No employees match this pay run (check department assignment on the run and on employees, or pick another run).
                </p>
              ) : null}
              {payrollEmpId && payrollEmployee ? (() => {
                const empStr = structures
                  .filter((s) => s.employee_id === payrollEmpId)
                  .sort((a, z) => z.created_at.localeCompare(a.created_at))[0]
                const empCtc = empStr?.ctc_annual
                const empBand = empCtc != null ? matchGradeBand(empCtc, activeBands(gradeBands)) : null
                const deptName = payrollEmployee.department_id
                  ? (employees.find((e) => e.id === payrollEmpId) as typeof payrollEmployee)?.department_id ?? '—'
                  : '—'
                return (
                  <div
                    style={{
                      marginBottom: '0.75rem',
                      padding: '0.4rem 0.75rem',
                      borderRadius: 6,
                      background: 'rgba(27,79,114,0.07)',
                      border: '1px solid rgba(27,79,114,0.2)',
                      fontSize: '0.85rem',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0 1rem',
                    }}
                  >
                    <span><strong>{employeeLabel(payrollEmployee)}</strong></span>
                    {empCtc != null ? <span className={styles.muted}>CTC: {fmtSC(empCtc)}/yr</span> : null}
                    <span className={styles.muted}>Grade: {empBand ? empBand.band_code : '—'}</span>
                    <span className={styles.muted}>Dept: {payRunMeta?.department_name ?? deptName}</span>
                  </div>
                )
              })() : null}
              {!latestStructure ? (
                <p className={styles.flowHint} style={{ marginBottom: '1rem' }}>
                  No salary structure for this employee — add one under <strong>Salary structures</strong> with{' '}
                  <code>ctc_annual</code> (and optional <code>bonus_pct_of_ctc</code>). The engine cannot compute lines until
                  that exists.
                </p>
              ) : null}

              {payslipViewOnly && payRunId && payrollEmpId && !selectedPayslip ? (
                <p className={styles.muted} style={{ marginBottom: '1rem' }}>
                  No payslip has been saved for this employee in this pay run yet.
                </p>
              ) : null}

              <SimCashWorksheet
                employeeName={payrollEmployee ? employeeLabel(payrollEmployee) : '—'}
                employeeCode={payrollEmployee?.employee_code ?? '—'}
                payPeriodLabel={payPeriodLabel}
                ctcAnnual={ctcInfo.ctc}
                bonusPct={ctcInfo.bonusPct}
                form={form}
                setField={setField}
                fieldOk={fieldOk}
                showValidationColors={showValidationColors}
                engineExpected={enginePreview?.expected ?? null}
                employerExpected={enginePreview?.employer_expected ?? null}
                showEngineColumn={showEngineColumn}
                engineLoading={engineLoading}
                onToggleEngineColumn={persistShowEngine}
                readOnly={payslipViewOnly}
                extraEarningLines={
                  reimbursementTotalDisplay > 0
                    ? [{ label: 'Reimbursements (supplemental)', amount: reimbursementTotalDisplay }]
                    : []
                }
                extraDeductionLines={
                  benefitsPremiumDisplay > 0
                    ? [{ label: 'Benefits premium (active enrollments)', amount: benefitsPremiumDisplay }]
                    : []
                }
              />

              {canConfigure ? (
                <p className={styles.muted} style={{ marginTop: '1rem' }}>
                  Reimbursement/supplemental lines moved to the <strong>Reimbursements</strong> tab.
                </p>
              ) : null}

              {canEditPayslip ? (
                <div className={styles.inline} style={{ marginTop: '1.25rem' }}>
                  <button className={styles.btnSm} type="button" disabled={pending || !payrollEmpId} onClick={() => void onValidate()}>
                    Validate (SimCash)
                  </button>
                  <label className={styles.hint}>
                    <input
                      type="checkbox"
                      checked={showValidationColors}
                      onChange={(e) => setShowValidationColors(e.target.checked)}
                    />{' '}
                    Show green / red
                  </label>
                  {import.meta.env.DEV ? (
                    <label className={styles.hint}>
                      <input type="checkbox" checked={devDebugHeader} onChange={(e) => setDevDebugHeader(e.target.checked)} />{' '}
                      Dev: request expected values (needs API debug — SIMCASH_DEBUG=1 or DEBUG=1 + header)
                    </label>
                  ) : null}
                  <button className={styles.btnSm} type="submit" disabled={pending || !payrollEmpId || !payRunId}>
                    Save payslip
                  </button>
                </div>
              ) : null}
              {canEditPayslip && allMatch === true ? <p className={styles.hint}>All fields match the engine within tolerance.</p> : null}
              {canEditPayslip && allMatch === false ? <p className={styles.error}>Some fields need correction (see highlights).</p> : null}

              {canEditPayslip && debugPanel?.expected ? (
                <details style={{ marginTop: '1rem' }}>
                  <summary>Expected values (debug)</summary>
                  <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>{JSON.stringify(debugPanel.expected, null, 2)}</pre>
                  {debugPanel.employer_expected ? (
                    <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>
                      employer: {JSON.stringify(debugPanel.employer_expected, null, 2)}
                    </pre>
                  ) : null}
                </details>
              ) : null}
            </form>
          ) : null}

          <h4 className={styles.h3} style={{ marginTop: '1.25rem' }}>
            Your payslips
          </h4>
          {loading ? (
            <p className={styles.muted}>Loading…</p>
          ) : payslips.length === 0 ? (
            <p className={styles.muted}>No payslips yet.</p>
          ) : (
            payslips.map((p) => (
              <p key={p.id} className={styles.muted}>
                Pay run {p.pay_run_id.slice(0, 8)}… — gross ₹S {p.gross} · net ₹S {p.net}
              </p>
            ))
          )}
        </section>
      ) : null}

      {releaseConfirm ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => {
            if (!pending) setReleaseConfirm(null)
          }}
        >
          <div
            className={styles.modalCritical}
            role="dialog"
            aria-modal="true"
            aria-labelledby="release-salary-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalCriticalHeader}>
              <span className={styles.modalCriticalIcon} aria-hidden>
                !
              </span>
              <h2 id="release-salary-title" className={styles.modalCriticalTitle}>
                Confirm salary release
              </h2>
            </div>
            <p className={styles.modalCriticalBody}>
              You are about to <strong>release salary</strong> for{' '}
              <strong>{releaseConfirm.employeeName}</strong>. Their payroll line will move to{' '}
              <strong>Salary released</strong>. Only confirm after the payslip is final — this is a critical payroll step.
            </p>
            <div className={styles.modalCriticalActions}>
              <button type="button" className={styles.btnGhost} disabled={pending} onClick={() => setReleaseConfirm(null)}>
                Cancel
              </button>
              <button type="button" className={styles.btnDanger} disabled={pending} onClick={() => void executeReleaseSalary()}>
                {pending ? 'Releasing…' : 'Yes, release salary'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
