import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import {
  createBenefitsEnrollment,
  createBenefitsPlan,
  getBenefitsEnrollmentSummary,
  listBenefitsEnrollments,
  listBenefitsPlans,
  updateBenefitsEnrollment,
  updateBenefitsPlan,
  type BenefitsEnrollment,
  type BenefitsPlan,
  type BenefitsEnrollmentSummary,
} from '../../../api/compensationApi'
import { getMyEmployee, listEmployees, type Employee } from '../../../api/employeesApi'
import { listDepartments, type Department } from '../../../api/organizationApi'
import { AlertModal } from '../../../components/AlertModal'
import styles from '../CompanyWorkspacePage.module.css'

type MainTab = 'plans' | 'enrollments' | 'myBenefits'

type PlanDetails = {
  monthly_premium_simcash?: number | null
  coverage_pct?: number | null
  eligibility?: string | null
  description?: string | null
  enrollment_start?: string | null
  enrollment_end?: string | null
  mandatory?: boolean
}

type DependentRow = { name: string; relationship: string; dob: string }

function employeeLabel(e: Employee): string {
  const p = e.personal_info_json
  const name =
    p && typeof p === 'object' && 'full_name' in p && typeof (p as { full_name?: unknown }).full_name === 'string'
      ? (p as { full_name: string }).full_name
      : null
  return `${name || e.employee_code} (${e.employee_code})`
}

function parsePlanDetails(plan: BenefitsPlan): PlanDetails {
  const raw = plan.details_json
  if (!raw || typeof raw !== 'object') return {}
  const d = raw as Record<string, unknown>
  return {
    monthly_premium_simcash:
      typeof d.monthly_premium_simcash === 'number'
        ? d.monthly_premium_simcash
        : typeof d.monthly_premium_simcash === 'string'
          ? Number(d.monthly_premium_simcash)
          : null,
    coverage_pct:
      typeof d.coverage_pct === 'number'
        ? d.coverage_pct
        : typeof d.coverage_pct === 'string'
          ? Number(d.coverage_pct)
          : null,
    eligibility: typeof d.eligibility === 'string' ? d.eligibility : null,
    description: typeof d.description === 'string' ? d.description : null,
    enrollment_start: typeof d.enrollment_start === 'string' ? d.enrollment_start : null,
    enrollment_end: typeof d.enrollment_end === 'string' ? d.enrollment_end : null,
    mandatory: d.mandatory === true,
  }
}

function todayDate(): Date {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
}

function parseISODate(s: string | null | undefined): Date | null {
  if (!s || !String(s).trim()) return null
  const d = new Date(String(s).slice(0, 10) + 'T12:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

/** Upcoming / Open / Closed — window from details_json; missing window treated as Open. */
function planEnrollmentPhase(details: PlanDetails): 'upcoming' | 'open' | 'closed' {
  const start = parseISODate(details.enrollment_start ?? undefined)
  const end = parseISODate(details.enrollment_end ?? undefined)
  const today = todayDate()
  if (!start && !end) return 'open'
  if (end && today > end) return 'closed'
  if (start && today < start) return 'upcoming'
  return 'open'
}

function isEnrollmentWindowOpen(details: PlanDetails): boolean {
  return planEnrollmentPhase(details) === 'open'
}

function formatEnrollmentPeriod(start: string, end: string): string | null {
  if (!start && !end) return null
  if (start && end) return `${start} – ${end}`
  return start || end || null
}

function detailsToForm(plan: BenefitsPlan): {
  name: string
  type: string
  monthlyPremium: string
  coveragePct: string
  eligibility: string
  enrollmentStart: string
  enrollmentEnd: string
  description: string
  mandatory: boolean
} {
  const d = parsePlanDetails(plan)
  return {
    name: plan.name,
    type: plan.type ?? '',
    monthlyPremium: d.monthly_premium_simcash != null && !Number.isNaN(Number(d.monthly_premium_simcash)) ? String(d.monthly_premium_simcash) : '',
    coveragePct: d.coverage_pct != null && !Number.isNaN(Number(d.coverage_pct)) ? String(d.coverage_pct) : '',
    eligibility: d.eligibility ?? '',
    enrollmentStart: (d.enrollment_start ?? '').slice(0, 10),
    enrollmentEnd: (d.enrollment_end ?? '').slice(0, 10),
    description: d.description ?? '',
    mandatory: d.mandatory === true,
  }
}

function buildDetailsPayload(f: {
  monthlyPremium: string
  coveragePct: string
  eligibility: string
  description: string
  enrollmentStart: string
  enrollmentEnd: string
  mandatory: boolean
}): Record<string, unknown> {
  const monthly =
    f.monthlyPremium.trim() === '' ? null : Number(f.monthlyPremium)
  const cov = f.coveragePct.trim() === '' ? null : Number(f.coveragePct)
  return {
    monthly_premium_simcash: monthly != null && !Number.isNaN(monthly) ? monthly : null,
    coverage_pct: cov != null && !Number.isNaN(cov) ? cov : null,
    eligibility: f.eligibility.trim() || null,
    description: f.description.trim() || null,
    enrollment_start: f.enrollmentStart.trim() || null,
    enrollment_end: f.enrollmentEnd.trim() || null,
    mandatory: f.mandatory === true,
  }
}

function dependentCount(json: Record<string, unknown> | null): number {
  if (!json || typeof json !== 'object') return 0
  const d = json as { dependents?: unknown }
  return Array.isArray(d.dependents) ? d.dependents.length : 0
}

function dependentsToPayload(rows: DependentRow[]): Record<string, unknown> | null {
  const cleaned = rows
    .map((r) => ({
      name: r.name.trim(),
      relationship: r.relationship.trim(),
      dob: r.dob.trim(),
    }))
    .filter((r) => r.name || r.relationship || r.dob)
  if (cleaned.length === 0) return null
  return { dependents: cleaned }
}

const PHASE_BADGE: Record<'upcoming' | 'open' | 'closed', { className: string; label: string }> = {
  upcoming: { className: styles.badgeAmber, label: 'Upcoming' },
  open: { className: styles.badgeGreen, label: 'Open' },
  closed: { className: styles.badgeRed, label: 'Closed' },
}

export function BenefitsPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const role = myCompanies.find((c) => c.company.id === companyId)?.membership.role ?? ''
  const canManageBenefits = role === 'company_admin' || role === 'compensation_analytics'
  const isEmployee = role === 'employee'
  const isUnsupportedRole = !canManageBenefits && !isEmployee

  const tabParam = searchParams.get('tab') as MainTab | null
  const validTabForUser = (t: MainTab): boolean => {
    if (canManageBenefits) return t === 'plans' || t === 'enrollments'
    if (isEmployee) return t === 'myBenefits'
    return false
  }

  const initialTab: MainTab = canManageBenefits
    ? 'plans'
    : isEmployee
      ? 'myBenefits'
      : 'plans'
  const mainTab: MainTab =
    tabParam && validTabForUser(tabParam) ? tabParam : initialTab

  const setMainTab = useCallback(
    (t: MainTab) => {
      setSearchParams((prev) => {
        const n = new URLSearchParams(prev)
        n.set('tab', t)
        return n
      })
    },
    [setSearchParams],
  )

  useEffect(() => {
    if (!tabParam || !validTabForUser(tabParam)) {
      setSearchParams((prev) => {
        const n = new URLSearchParams(prev)
        n.set('tab', initialTab)
        return n
      }, { replace: true })
    }
  }, [companyId, tabParam, initialTab, setSearchParams, canManageBenefits, isEmployee])

  const [plans, setPlans] = useState<BenefitsPlan[]>([])
  const [enrollments, setEnrollments] = useState<BenefitsEnrollment[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [summary, setSummary] = useState<BenefitsEnrollmentSummary | null>(null)
  const [myEmployee, setMyEmployee] = useState<Employee | null>(null)

  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Plans form (create) */
  const [planForm, setPlanForm] = useState({
    name: '',
    type: '',
    monthlyPremium: '',
    coveragePct: '',
    eligibility: '',
    enrollmentStart: '',
    enrollmentEnd: '',
    description: '',
    mandatory: false,
  })

  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(planForm)

  /* Enrollments — enroll flow */
  const [deptFilter, setDeptFilter] = useState<string>('')
  const [enrollEmployeeId, setEnrollEmployeeId] = useState('')
  const [enrollPlanId, setEnrollPlanId] = useState('')
  const [forceEnrollOutsideWindow, setForceEnrollOutsideWindow] = useState(false)
  const [expandedEnrollmentPlanId, setExpandedEnrollmentPlanId] = useState<string | null>(null)
  const [tableStatusFilter, setTableStatusFilter] = useState('')
  const [tableQuery, setTableQuery] = useState('')

  /* My benefits — per-plan enroll dependents */
  const [myEnrollPlanId, setMyEnrollPlanId] = useState<string | null>(null)
  const [myDependents, setMyDependents] = useState<DependentRow[]>([{ name: '', relationship: '', dob: '' }])

  const refresh = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const p = await listBenefitsPlans(companyId)
      setPlans(p)

      if (canManageBenefits) {
        const [e, em, dep, sum] = await Promise.all([
          listBenefitsEnrollments(companyId),
          listEmployees(companyId),
          listDepartments(companyId),
          getBenefitsEnrollmentSummary(companyId),
        ])
        setEnrollments(e)
        setEmployees(em)
        setDepartments(dep)
        setSummary(sum)
        setMyEmployee(null)
      } else if (isEmployee) {
        const [e, me] = await Promise.all([listBenefitsEnrollments(companyId), getMyEmployee(companyId).catch(() => null)])
        setEnrollments(e)
        setEmployees([])
        setDepartments([])
        setSummary(null)
        setMyEmployee(me)
      } else {
        setEnrollments([])
        setEmployees([])
        setDepartments([])
        setSummary(null)
        setMyEmployee(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load benefits')
    } finally {
      setLoading(false)
    }
  }, [companyId, canManageBenefits, isEmployee])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const employeesInDept = useMemo(() => {
    if (!deptFilter) return employees
    return employees.filter((e) => e.department_id === deptFilter)
  }, [employees, deptFilter])

  const selectedPlanForEnroll = useMemo(
    () => plans.find((x) => x.id === enrollPlanId),
    [plans, enrollPlanId],
  )
  const enrollPlanDetails = useMemo(
    () => (selectedPlanForEnroll ? parsePlanDetails(selectedPlanForEnroll) : {}),
    [selectedPlanForEnroll],
  )
  const enrollWindowOk = useMemo(() => isEnrollmentWindowOpen(enrollPlanDetails), [enrollPlanDetails])
  const showEnrollWindowWarning = Boolean(enrollPlanId) && !enrollWindowOk && !forceEnrollOutsideWindow

  const openPlansCount = useMemo(() => plans.filter((p) => planEnrollmentPhase(parsePlanDetails(p)) === 'open').length, [plans])

  const activeEnrollmentRows = useMemo(() => enrollments.filter((e) => e.status === 'active'), [enrollments])

  const notEnrolledEmployeesCount = useMemo(() => {
    if (!summary) return 0
    return Math.max(0, summary.company_employee_count - summary.employees_with_active_enrollment)
  }, [summary])

  const filteredEnrollmentTable = useMemo(() => {
    let rows = enrollments
    if (tableStatusFilter) rows = rows.filter((r) => r.status === tableStatusFilter)
    if (tableQuery.trim()) {
      const q = tableQuery.trim().toLowerCase()
      rows = rows.filter((r) => {
        const emp = employees.find((e) => e.id === r.employee_id)
        const label = emp ? employeeLabel(emp).toLowerCase() : r.employee_id
        const pl = plans.find((p) => p.id === r.plan_id)
        const planText = (pl?.name ?? '').toLowerCase()
        return label.includes(q) || planText.includes(q)
      })
    }
    return rows
  }, [enrollments, tableStatusFilter, tableQuery, employees, plans])

  const enrollmentsGroupedByPlan = useMemo(() => {
    const m = new Map<string, BenefitsEnrollment[]>()
    for (const row of filteredEnrollmentTable) {
      const list = m.get(row.plan_id) ?? []
      list.push(row)
      m.set(row.plan_id, list)
    }
    return m
  }, [filteredEnrollmentTable])

  const plansWithEnrollmentRows = useMemo(
    () => plans.filter((p) => (enrollmentsGroupedByPlan.get(p.id)?.length ?? 0) > 0),
    [plans, enrollmentsGroupedByPlan],
  )

  async function onCreatePlan(e: FormEvent) {
    e.preventDefault()
    if (!companyId || !canManageBenefits || !planForm.name.trim()) return
    setPending(true)
    setError(null)
    try {
      const details = buildDetailsPayload(planForm)
      await createBenefitsPlan(companyId, {
        name: planForm.name.trim(),
        type: planForm.type.trim() || null,
        details_json: details,
        enrollment_period: formatEnrollmentPeriod(planForm.enrollmentStart, planForm.enrollmentEnd),
        mandatory: planForm.mandatory,
      })
      setPlanForm({
        name: '',
        type: '',
        monthlyPremium: '',
        coveragePct: '',
        eligibility: '',
        enrollmentStart: '',
        enrollmentEnd: '',
        description: '',
        mandatory: false,
      })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create plan')
    } finally {
      setPending(false)
    }
  }

  function beginEditPlan(plan: BenefitsPlan) {
    setEditingPlanId(plan.id)
    setEditForm(detailsToForm(plan))
  }

  async function saveEditPlan(e: FormEvent) {
    e.preventDefault()
    if (!companyId || !canManageBenefits || !editingPlanId || !editForm.name.trim()) return
    setPending(true)
    setError(null)
    try {
      const details = buildDetailsPayload(editForm)
      await updateBenefitsPlan(companyId, editingPlanId, {
        name: editForm.name.trim(),
        type: editForm.type.trim() || null,
        details_json: details,
        enrollment_period: formatEnrollmentPeriod(editForm.enrollmentStart, editForm.enrollmentEnd),
        mandatory: editForm.mandatory,
      })
      setEditingPlanId(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update plan')
    } finally {
      setPending(false)
    }
  }

  async function onAdminEnroll(e: FormEvent) {
    e.preventDefault()
    if (!companyId || !canManageBenefits || !enrollEmployeeId || !enrollPlanId) return
    if (showEnrollWindowWarning) return
    setPending(true)
    setError(null)
    try {
      await createBenefitsEnrollment(companyId, {
        plan_id: enrollPlanId,
        employee_id: enrollEmployeeId,
        dependents_json: null,
        status: 'active',
      })
      setForceEnrollOutsideWindow(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enroll')
    } finally {
      setPending(false)
    }
  }

  async function cancelEnrollment(id: string) {
    if (!companyId || !canManageBenefits) return
    setPending(true)
    setError(null)
    try {
      await updateBenefitsEnrollment(companyId, id, { status: 'cancelled' })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel')
    } finally {
      setPending(false)
    }
  }

  async function onEmployeeEnroll(planId: string) {
    if (!companyId || !isEmployee || !myEmployee) return
    const plan = plans.find((p) => p.id === planId)
    if (!plan) return
    const d = parsePlanDetails(plan)
    if (!isEnrollmentWindowOpen(d)) {
      setError('This plan is not open for enrollment right now.')
      return
    }
    setPending(true)
    setError(null)
    try {
      const depPayload = dependentsToPayload(myDependents)
      await createBenefitsEnrollment(companyId, {
        plan_id: planId,
        employee_id: myEmployee.id,
        dependents_json: depPayload,
        status: 'active',
      })
      setMyEnrollPlanId(null)
      setMyDependents([{ name: '', relationship: '', dob: '' }])
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enroll')
    } finally {
      setPending(false)
    }
  }

  const myActiveByPlanId = useMemo(() => {
    if (!myEmployee) return new Set<string>()
    const s = new Set<string>()
    for (const e of enrollments) {
      if (e.employee_id === myEmployee.id && e.status === 'active') s.add(e.plan_id)
    }
    return s
  }, [enrollments, myEmployee])

  if (isUnsupportedRole) {
    return (
      <div className={styles.org}>
        <p className={styles.flowHint}>
          <strong>Benefits</strong> — this area is available to company administrators, compensation analytics users, and
          employees. Your current role does not include benefits management or employee self-service here.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.org}>
      <p className={styles.flowHint}>
        <strong>Benefits</strong> — SimCash-aligned premiums, coverage, and enrollment windows. Plans and enrollments are
        managed by admins; employees use <strong>My Benefits</strong> to view and self-enroll.
      </p>

      <AlertModal open={Boolean(error)} message={error ?? ''} onClose={() => setError(null)} />

      {loading ? <p className={styles.muted}>Loading…</p> : null}

      {mainTab === 'plans' && canManageBenefits ? (
        <>
          <section className={styles.card}>
            <h3 className={styles.h3}>Create benefit plan</h3>
            <p className={styles.flowHint}>
              Name and type are stored on the plan record; premium, coverage, eligibility, window, and description live in{' '}
              <strong>details_json</strong> for flexibility.
            </p>
            <form onSubmit={onCreatePlan} className={styles.positionForm} style={{ maxWidth: 560 }}>
              <label className={styles.hint}>
                Plan name *
                <input
                  className={styles.input}
                  value={planForm.name}
                  onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </label>
              <label className={styles.hint}>
                Type
                <input
                  className={styles.input}
                  value={planForm.type}
                  onChange={(e) => setPlanForm((p) => ({ ...p, type: e.target.value }))}
                  placeholder="e.g. Health, Dental"
                />
              </label>
              <label className={styles.hint}>
                Monthly premium (SimCash)
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  step="0.01"
                  value={planForm.monthlyPremium}
                  onChange={(e) => setPlanForm((p) => ({ ...p, monthlyPremium: e.target.value }))}
                />
              </label>
              <label className={styles.hint}>
                Coverage by employees %
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  max={100}
                  value={planForm.coveragePct}
                  onChange={(e) => setPlanForm((p) => ({ ...p, coveragePct: e.target.value }))}
                />
              </label>
              <label className={styles.radio} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={planForm.mandatory}
                  onChange={(e) => setPlanForm((p) => ({ ...p, mandatory: e.target.checked }))}
                />
                Mandatory enrollment
              </label>
              <label className={styles.hint}>
                Eligibility
                <input
                  className={styles.input}
                  value={planForm.eligibility}
                  onChange={(e) => setPlanForm((p) => ({ ...p, eligibility: e.target.value }))}
                  placeholder="e.g. All full-time employees"
                />
              </label>
              <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                <label className={styles.hint}>
                  Enrollment window start
                  <input
                    className={styles.input}
                    type="date"
                    value={planForm.enrollmentStart}
                    onChange={(e) => setPlanForm((p) => ({ ...p, enrollmentStart: e.target.value }))}
                  />
                </label>
                <label className={styles.hint}>
                  Enrollment window end
                  <input
                    className={styles.input}
                    type="date"
                    value={planForm.enrollmentEnd}
                    onChange={(e) => setPlanForm((p) => ({ ...p, enrollmentEnd: e.target.value }))}
                  />
                </label>
              </div>
              <label className={styles.hint}>
                Description
                <textarea
                  className={styles.input}
                  style={{ minHeight: 88 }}
                  value={planForm.description}
                  onChange={(e) => setPlanForm((p) => ({ ...p, description: e.target.value }))}
                />
              </label>
              <button type="submit" className={styles.btnSm} disabled={pending}>
                {pending ? 'Saving…' : 'Create plan'}
              </button>
            </form>
          </section>

          <section className={styles.card}>
            <h3 className={styles.h3}>All plans</h3>
            {plans.length === 0 ? (
              <p className={styles.muted}>No plans yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Window</th>
                      <th>Status</th>
                      <th>Mandatory</th>
                      <th className={styles.tableCellActions}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((plan) => {
                      const d = parsePlanDetails(plan)
                      const phase = planEnrollmentPhase(d)
                      const badge = PHASE_BADGE[phase]
                      const windowLabel =
                        d.enrollment_start || d.enrollment_end
                          ? `${d.enrollment_start ?? '—'} → ${d.enrollment_end ?? '—'}`
                          : '—'
                      return (
                        <tr key={plan.id}>
                          <td>{plan.name}</td>
                          <td>{plan.type ?? '—'}</td>
                          <td style={{ fontSize: '0.8rem' }}>{windowLabel}</td>
                          <td>
                            <span className={`${styles.badge} ${badge.className}`}>{badge.label}</span>
                          </td>
                          <td>
                            {d.mandatory ? (
                              <span className={`${styles.badge} ${styles.badgeAmber}`}>Mandatory</span>
                            ) : (
                              <span className={styles.muted}>—</span>
                            )}
                          </td>
                          <td className={styles.tableCellActions}>
                            <button type="button" className={styles.linkBtn} onClick={() => beginEditPlan(plan)}>
                              Edit
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {editingPlanId ? (
            <section className={styles.card}>
              <h3 className={styles.h3}>Edit plan</h3>
              <form onSubmit={saveEditPlan} className={styles.positionForm} style={{ maxWidth: 560 }}>
                <label className={styles.hint}>
                  Plan name *
                  <input
                    className={styles.input}
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </label>
                <label className={styles.hint}>
                  Type
                  <input
                    className={styles.input}
                    value={editForm.type}
                    onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value }))}
                  />
                </label>
                <label className={styles.hint}>
                  Monthly premium (SimCash)
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.monthlyPremium}
                    onChange={(e) => setEditForm((p) => ({ ...p, monthlyPremium: e.target.value }))}
                  />
                </label>
                <label className={styles.hint}>
                  Coverage by employees %
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    max={100}
                    value={editForm.coveragePct}
                    onChange={(e) => setEditForm((p) => ({ ...p, coveragePct: e.target.value }))}
                  />
                </label>
                <label className={styles.radio} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={editForm.mandatory}
                    onChange={(e) => setEditForm((p) => ({ ...p, mandatory: e.target.checked }))}
                  />
                  Mandatory enrollment
                </label>
                <label className={styles.hint}>
                  Eligibility
                  <input
                    className={styles.input}
                    value={editForm.eligibility}
                    onChange={(e) => setEditForm((p) => ({ ...p, eligibility: e.target.value }))}
                  />
                </label>
                <div className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                  <label className={styles.hint}>
                    Enrollment window start
                    <input
                      className={styles.input}
                      type="date"
                      value={editForm.enrollmentStart}
                      onChange={(e) => setEditForm((p) => ({ ...p, enrollmentStart: e.target.value }))}
                    />
                  </label>
                  <label className={styles.hint}>
                    Enrollment window end
                    <input
                      className={styles.input}
                      type="date"
                      value={editForm.enrollmentEnd}
                      onChange={(e) => setEditForm((p) => ({ ...p, enrollmentEnd: e.target.value }))}
                    />
                  </label>
                </div>
                <label className={styles.hint}>
                  Description
                  <textarea
                    className={styles.input}
                    style={{ minHeight: 88 }}
                    value={editForm.description}
                    onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </label>
                <div className={styles.inline} style={{ gap: '0.5rem' }}>
                  <button type="submit" className={styles.btnSm} disabled={pending}>
                    {pending ? 'Saving…' : 'Save changes'}
                  </button>
                  <button type="button" className={styles.btnSm} onClick={() => setEditingPlanId(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          ) : null}
        </>
      ) : null}

      {mainTab === 'enrollments' && canManageBenefits ? (
        <>
          {summary ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(11rem, 1fr))',
                gap: '1rem',
                marginBottom: '1rem',
              }}
            >
              <div
                style={{
                  padding: '1rem',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.03)',
                }}
              >
                <div className={styles.muted} style={{ fontSize: '0.75rem' }}>
                  Active enrollments
                </div>
                <strong style={{ fontSize: '1.35rem' }}>{activeEnrollmentRows.length}</strong>
              </div>
              <div
                style={{
                  padding: '1rem',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.03)',
                }}
              >
                <div className={styles.muted} style={{ fontSize: '0.75rem' }}>
                  Open plans
                </div>
                <strong style={{ fontSize: '1.35rem' }}>{openPlansCount}</strong>
              </div>
              <div
                style={{
                  padding: '1rem',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.03)',
                }}
              >
                <div className={styles.muted} style={{ fontSize: '0.75rem' }}>
                  Employees not enrolled
                </div>
                <strong style={{ fontSize: '1.35rem' }}>{notEnrolledEmployeesCount}</strong>
              </div>
            </div>
          ) : null}

          <section className={styles.card}>
            <h3 className={styles.h3}>Enroll an employee</h3>
            <p className={styles.flowHint}>
              Choose department to narrow the list, then select employee and plan. Employees add dependents themselves under{' '}
              <strong>My Benefits</strong> after enrollment. Enrollment outside the plan window requires confirmation.
            </p>
            <form onSubmit={onAdminEnroll} className={styles.positionForm} style={{ maxWidth: 640 }}>
              <label className={styles.hint}>
                Department filter
                <select
                  className={styles.input}
                  value={deptFilter}
                  onChange={(e) => {
                    setDeptFilter(e.target.value)
                    setEnrollEmployeeId('')
                  }}
                >
                  <option value="">All departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.hint}>
                Employee *
                <select
                  className={styles.input}
                  value={enrollEmployeeId}
                  onChange={(e) => setEnrollEmployeeId(e.target.value)}
                  required
                >
                  <option value="">Select employee</option>
                  {employeesInDept.map((e) => (
                    <option key={e.id} value={e.id}>
                      {employeeLabel(e)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.hint}>
                Plan *
                <select className={styles.input} value={enrollPlanId} onChange={(e) => setEnrollPlanId(e.target.value)} required>
                  <option value="">Select plan</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              {showEnrollWindowWarning ? (
                <div
                  style={{
                    padding: '0.75rem',
                    borderRadius: 8,
                    border: '1px solid rgba(243, 156, 18, 0.5)',
                    background: 'rgba(243, 156, 18, 0.1)',
                  }}
                >
                  <p className={styles.hint} style={{ marginBottom: '0.5rem' }}>
                    <strong>Outside enrollment window.</strong> The selected plan is not currently open for enrollment. You can
                    still proceed after confirming below.
                  </p>
                  <label className={styles.radio}>
                    <input
                      type="checkbox"
                      checked={forceEnrollOutsideWindow}
                      onChange={(e) => setForceEnrollOutsideWindow(e.target.checked)}
                    />
                    I understand — allow enrollment anyway
                  </label>
                </div>
              ) : null}

              {enrollPlanId && !enrollWindowOk && forceEnrollOutsideWindow ? (
                <p className={styles.muted} style={{ fontSize: '0.8125rem' }}>
                  Override enabled: submit will create an active enrollment despite the window.
                </p>
              ) : null}

              <div style={{ marginTop: '0.75rem' }}>
                <button
                  type="submit"
                  className={styles.btnSm}
                  disabled={pending || showEnrollWindowWarning || !enrollEmployeeId || !enrollPlanId}
                >
                  {pending ? 'Enrolling…' : 'Enroll'}
                </button>
              </div>
            </form>
          </section>

          <section className={styles.card}>
            <h3 className={styles.h3}>Enrollment by plan</h3>
            <p className={styles.flowHint}>
              Open a plan card to see who is enrolled, enrollment date, and status. Use filters to narrow the list.
            </p>
            <div className={styles.inline} style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
              <label className={styles.hint}>
                Status
                <select
                  className={styles.input}
                  value={tableStatusFilter}
                  onChange={(e) => setTableStatusFilter(e.target.value)}
                  style={{ minWidth: '10rem' }}
                >
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <label className={styles.hint}>
                Search
                <input
                  className={styles.input}
                  placeholder="Name or plan"
                  value={tableQuery}
                  onChange={(e) => setTableQuery(e.target.value)}
                  style={{ minWidth: '12rem' }}
                />
              </label>
            </div>
            {plansWithEnrollmentRows.length === 0 ? (
              <p className={styles.muted}>No matching enrollments.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {plansWithEnrollmentRows.map((plan) => {
                  const rows = enrollmentsGroupedByPlan.get(plan.id) ?? []
                  const expanded = expandedEnrollmentPlanId === plan.id
                  const pd = parsePlanDetails(plan)
                  return (
                    <div
                      key={plan.id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        overflow: 'hidden',
                        background: 'var(--bg-card)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedEnrollmentPlanId(expanded ? null : plan.id)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '1rem 1.25rem',
                          border: 'none',
                          background: expanded ? 'rgba(0,0,0,0.04)' : 'transparent',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '1rem',
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: '1.05rem' }}>{plan.name}</strong>
                          {plan.type ? (
                            <span className={styles.muted} style={{ marginLeft: '0.5rem' }}>
                              {plan.type}
                            </span>
                          ) : null}
                          <div className={styles.muted} style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
                            {rows.length} enrollment{rows.length === 1 ? '' : 's'}
                            {pd.monthly_premium_simcash != null && !Number.isNaN(Number(pd.monthly_premium_simcash))
                              ? ` · ${pd.monthly_premium_simcash} SimCash / mo`
                              : ''}
                          </div>
                        </div>
                        <span aria-hidden style={{ fontSize: '0.75rem' }}>
                          {expanded ? '▾' : '▸'}
                        </span>
                      </button>
                      {expanded ? (
                        <div style={{ padding: '0 1.25rem 1rem', borderTop: '1px solid var(--border)' }}>
                          <div className={styles.tableWrap} style={{ marginTop: '0.75rem' }}>
                            <table className={styles.table}>
                              <thead>
                                <tr>
                                  <th>Employee</th>
                                  <th>Code</th>
                                  <th>Enrolled</th>
                                  <th>Status</th>
                                  <th className={styles.tableCellActions}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row) => {
                                  const emp = employees.find((e) => e.id === row.employee_id)
                                  const enrolled = row.created_at ? String(row.created_at).slice(0, 10) : '—'
                                  return (
                                    <tr key={row.id}>
                                      <td>{emp ? employeeLabel(emp) : row.employee_id.slice(0, 8) + '…'}</td>
                                      <td>{emp?.employee_code ?? '—'}</td>
                                      <td style={{ fontSize: '0.85rem' }}>{enrolled}</td>
                                      <td>{row.status}</td>
                                      <td className={styles.tableCellActions}>
                                        {row.status === 'active' ? (
                                          <button
                                            type="button"
                                            className={styles.linkBtn}
                                            disabled={pending}
                                            onClick={() => void cancelEnrollment(row.id)}
                                          >
                                            Cancel
                                          </button>
                                        ) : (
                                          '—'
                                        )}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      ) : null}

      {mainTab === 'myBenefits' && isEmployee ? (
        <>
          {!myEmployee ? (
            <p className={styles.flowHint}>
              No employee profile is linked to your account. Ask an administrator to link your user to an employee record.
            </p>
          ) : (
            <>
              <section className={styles.card}>
                <h3 className={styles.h3}>Available plans</h3>
                {plans.length === 0 ? (
                  <p className={styles.muted}>No benefit plans configured yet.</p>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))',
                      gap: '1rem',
                    }}
                  >
                    {plans.map((plan) => {
                      const d = parsePlanDetails(plan)
                      const phase = planEnrollmentPhase(d)
                      const enrolled = myActiveByPlanId.has(plan.id)
                      let cardBadge: { cls: string; label: string }
                      if (phase === 'closed') {
                        cardBadge = { cls: styles.badgeRed, label: 'Closed' }
                      } else if (enrolled) {
                        cardBadge = { cls: styles.badgeGreen, label: 'Enrolled' }
                      } else if (phase === 'upcoming') {
                        cardBadge = { cls: styles.badgeAmber, label: 'Upcoming' }
                      } else {
                        cardBadge = { cls: styles.badgeAmber, label: 'Available' }
                      }
                      const canSelfEnroll = !enrolled && phase === 'open'
                      const premium = d.monthly_premium_simcash
                      const cov = d.coverage_pct
                      return (
                        <div
                          key={plan.id}
                          style={{
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            padding: '1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                          }}
                        >
                          <div className={styles.inline} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong>{plan.name}</strong>
                            <span className={`${styles.badge} ${cardBadge.cls}`}>{cardBadge.label}</span>
                          </div>
                          {plan.type ? <span className={styles.muted}>{plan.type}</span> : null}
                          <p style={{ margin: 0, fontSize: '0.875rem' }}>
                            <strong>Premium:</strong>{' '}
                            {premium != null && !Number.isNaN(Number(premium)) ? `${premium} SimCash / mo` : '—'}
                          </p>
                          <p style={{ margin: 0, fontSize: '0.875rem' }}>
                            <strong>Coverage by employees:</strong>{' '}
                            {cov != null && !Number.isNaN(Number(cov)) ? `${cov}%` : '—'}
                          </p>
                          {d.description ? (
                            <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.45 }}>{d.description}</p>
                          ) : null}
                          {d.enrollment_start || d.enrollment_end ? (
                            <p className={styles.muted} style={{ fontSize: '0.75rem', margin: 0 }}>
                              Window: {d.enrollment_start ?? '—'} → {d.enrollment_end ?? '—'}
                            </p>
                          ) : null}

                          {canSelfEnroll ? (
                            <>
                              {myEnrollPlanId === plan.id ? (
                                <div style={{ marginTop: '0.5rem' }}>
                                  <p className={styles.hint} style={{ fontWeight: 600 }}>
                                    Dependents (optional)
                                  </p>
                                  {myDependents.map((row, idx) => (
                                    <div
                                      key={idx}
                                      className={styles.inline}
                                      style={{ alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '0.35rem' }}
                                    >
                                      <input
                                        className={styles.input}
                                        placeholder="Name"
                                        value={row.name}
                                        onChange={(e) =>
                                          setMyDependents((prev) =>
                                            prev.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)),
                                          )
                                        }
                                      />
                                      <input
                                        className={styles.input}
                                        placeholder="Relationship"
                                        value={row.relationship}
                                        onChange={(e) =>
                                          setMyDependents((prev) =>
                                            prev.map((r, i) => (i === idx ? { ...r, relationship: e.target.value } : r)),
                                          )
                                        }
                                      />
                                      <input
                                        className={styles.input}
                                        type="date"
                                        value={row.dob}
                                        onChange={(e) =>
                                          setMyDependents((prev) =>
                                            prev.map((r, i) => (i === idx ? { ...r, dob: e.target.value } : r)),
                                          )
                                        }
                                      />
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    className={styles.btnSm}
                                    style={{ marginTop: '0.35rem' }}
                                    onClick={() => setMyDependents((prev) => [...prev, { name: '', relationship: '', dob: '' }])}
                                  >
                                    Add dependent
                                  </button>
                                  <div className={styles.inline} style={{ marginTop: '0.5rem', gap: '0.5rem' }}>
                                    <button
                                      type="button"
                                      className={styles.btnSm}
                                      disabled={pending}
                                      onClick={() => void onEmployeeEnroll(plan.id)}
                                    >
                                      {pending ? 'Submitting…' : 'Confirm enrollment'}
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.btnSm}
                                      onClick={() => {
                                        setMyEnrollPlanId(null)
                                        setMyDependents([{ name: '', relationship: '', dob: '' }])
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className={styles.btnSm}
                                  style={{ marginTop: '0.5rem', alignSelf: 'flex-start' }}
                                  disabled={pending}
                                  onClick={() => {
                                    setMyEnrollPlanId(plan.id)
                                    setMyDependents([{ name: '', relationship: '', dob: '' }])
                                  }}
                                >
                                  Enroll
                                </button>
                              )}
                            </>
                          ) : !enrolled && phase === 'upcoming' ? (
                            <p className={styles.muted} style={{ fontSize: '0.8125rem', margin: '0.5rem 0 0' }}>
                              Enrollment opens {d.enrollment_start ? `on ${d.enrollment_start}` : 'soon'}.
                            </p>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className={styles.card}>
                <h3 className={styles.h3}>My enrollments</h3>
                {enrollments.filter((e) => e.employee_id === myEmployee.id).length === 0 ? (
                  <p className={styles.muted}>You have no enrollment records yet.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                    {enrollments
                      .filter((e) => e.employee_id === myEmployee.id)
                      .map((e) => {
                        const pl = plans.find((p) => p.id === e.plan_id)
                        return (
                          <li key={e.id} style={{ marginBottom: '0.5rem' }}>
                            <strong>{pl?.name ?? 'Plan'}</strong>
                            <span className={styles.muted}> — {e.status}</span>
                            {dependentCount(e.dependents_json as Record<string, unknown> | null) > 0 ? (
                              <span className={styles.muted}>
                                {' '}
                                · {dependentCount(e.dependents_json as Record<string, unknown> | null)} dependent(s)
                              </span>
                            ) : null}
                          </li>
                        )
                      })}
                  </ul>
                )}
              </section>
            </>
          )}
        </>
      ) : null}
    </div>
  )
}
