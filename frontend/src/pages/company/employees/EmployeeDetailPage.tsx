import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../../api/client'
import {
  createLifecycleEvent,
  getEmployee,
  listLifecycleEvents,
  updateEmployee,
  updateOnboardingChecklist,
  type Employee,
  type LifecycleEvent,
} from '../../../api/employeesApi'
import {
  listDepartments,
  listPositions,
  updatePosition,
  type Department,
  type Position,
} from '../../../api/organizationApi'
import { listGradeBands, type CompensationGradeBand } from '../../../api/compensationApi'
import styles from '../CompanyWorkspacePage.module.css'

type JobRow = { id: string; title: string }

type Tab = 'profile' | 'job' | 'lifecycle' | 'onboarding'

/** Standalone route: `/company/:companyId/employees/:employeeId` (e.g. deep links). */
export function EmployeeDetailPage() {
  const { companyId = '', employeeId = '' } = useParams()
  const { myCompanies } = useAuth()
  const navigate = useNavigate()
  const role = myCompanies.find((x) => x.company.id === companyId)?.membership.role ?? ''
  const canEdit = role === 'company_admin' || role === 'hr_ops'
  const [tab, setTab] = useState<Tab>('profile')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [events, setEvents] = useState<LifecycleEvent[]>([])
  const [status, setStatus] = useState('active')
  const [hireDate, setHireDate] = useState('')
  const [eventType, setEventType] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventNotes, setEventNotes] = useState('')
  const [checklistText, setChecklistText] = useState('{}')
  const [departments, setDepartments] = useState<Department[]>([])
  const [jobCatalog, setJobCatalog] = useState<JobRow[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [gradeBands, setGradeBands] = useState<CompensationGradeBand[]>([])
  const [jobDeptId, setJobDeptId] = useState('')
  const [jobCatalogId, setJobCatalogId] = useState('')
  const [jobPositionId, setJobPositionId] = useState('')
  const [jobGradeInput, setJobGradeInput] = useState('')

  async function refresh() {
    if (!companyId || !employeeId) return
    setLoading(true)
    setError(null)
    try {
      const [emp, lifecycle, depts, jobs, bands] = await Promise.all([
        getEmployee(companyId, employeeId),
        listLifecycleEvents(companyId, employeeId),
        listDepartments(companyId),
        apiFetch<JobRow[]>(`/companies/${companyId}/job-catalog`),
        listGradeBands(companyId),
      ])
      setEmployee(emp)
      setStatus(emp.status)
      setHireDate(emp.hire_date ?? '')
      setJobDeptId(emp.department_id ?? '')
      setJobCatalogId(emp.job_id ?? '')
      setJobPositionId(emp.position_id ?? '')
      setChecklistText(JSON.stringify(emp.onboarding_checklist_json ?? {}, null, 2))
      setEvents(lifecycle)
      setDepartments(depts)
      setJobCatalog(jobs)
      setGradeBands(bands)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load employee')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [companyId, employeeId])

  useEffect(() => {
    if (!companyId || !jobDeptId) {
      setPositions([])
      return
    }
    let cancelled = false
    void listPositions(companyId, jobDeptId)
      .then((rows) => {
        if (!cancelled) setPositions(rows)
      })
      .catch(() => {
        if (!cancelled) setPositions([])
      })
    return () => {
      cancelled = true
    }
  }, [companyId, jobDeptId])

  useEffect(() => {
    if (!jobPositionId) {
      setJobGradeInput('')
      return
    }
    const p = positions.find((x) => x.id === jobPositionId)
    if (p) setJobGradeInput(String(p.grade))
  }, [jobPositionId, positions])

  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments])
  const jobTitleById = useMemo(() => new Map(jobCatalog.map((j) => [j.id, j.title])), [jobCatalog])
  const gradeOptions = useMemo(() => {
    if (gradeBands.length === 0) return []
    const nums = gradeBands.map((b) => b.org_position_grade_min).filter((g): g is number => g != null && Number.isFinite(g))
    return [...new Set(nums)].sort((a, b) => a - b)
  }, [gradeBands])

  const currentGradeNum = jobGradeInput ? Number(jobGradeInput) : null
  const gradeHasNoBand =
    currentGradeNum != null &&
    Number.isFinite(currentGradeNum) &&
    gradeBands.length > 0 &&
    !gradeBands.some((b) => b.org_position_grade_min === currentGradeNum)
  const profilePositionLabel = useMemo(() => {
    if (!employee?.position_id) return 'Unassigned'
    return positions.find((p) => p.id === employee.position_id)?.name ?? '—'
  }, [employee?.position_id, positions])

  const profileGradeLabel = useMemo(() => {
    if (!employee?.position_id) return '—'
    const g = positions.find((p) => p.id === employee.position_id)?.grade
    return g != null && !Number.isNaN(g) ? String(g) : '—'
  }, [employee?.position_id, positions])

  async function saveJobInfo() {
    if (!canEdit || !employee) return
    setPending(true)
    setError(null)
    try {
      const next = await updateEmployee(companyId, employee.id, {
        status,
        hire_date: hireDate || null,
        department_id: jobDeptId || null,
        job_id: jobCatalogId || null,
        position_id: jobPositionId || null,
      })
      setEmployee(next)
      setJobDeptId(next.department_id ?? '')
      setJobCatalogId(next.job_id ?? '')
      setJobPositionId(next.position_id ?? '')
      if (jobPositionId) {
        const g = Number(jobGradeInput.trim())
        if (!Number.isNaN(g) && g >= 0 && g <= 999999) {
          await updatePosition(companyId, jobPositionId, { grade: Math.round(g) })
          const rows = await listPositions(companyId, jobDeptId || undefined)
          setPositions(rows)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update employee')
    } finally {
      setPending(false)
    }
  }

  async function addLifecycleEvent() {
    if (!canEdit || !eventType.trim()) return
    setPending(true)
    setError(null)
    try {
      const row = await createLifecycleEvent(companyId, employeeId, {
        event_type: eventType.trim(),
        effective_date: eventDate || null,
        notes: eventNotes || null,
      })
      setEvents((prev) => [row, ...prev])
      setEventType('')
      setEventDate('')
      setEventNotes('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create lifecycle event')
    } finally {
      setPending(false)
    }
  }

  async function saveChecklist() {
    if (!canEdit) return
    setPending(true)
    setError(null)
    try {
      const payload = JSON.parse(checklistText) as Record<string, unknown>
      const next = await updateOnboardingChecklist(companyId, employeeId, payload)
      setEmployee(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid checklist JSON')
    } finally {
      setPending(false)
    }
  }

  if (loading) return <p className={styles.muted}>Loading employee…</p>
  if (error && !employee) return <p className={styles.error}>{error}</p>
  if (!employee) return <p className={styles.muted}>Employee not found.</p>

  return (
    <div className={styles.org}>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabBtn} ${tab === 'profile' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('profile')}
        >
          Profile
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${tab === 'job' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('job')}
        >
          Job info
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${tab === 'lifecycle' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('lifecycle')}
        >
          Lifecycle
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${tab === 'onboarding' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('onboarding')}
        >
          Onboarding
        </button>
      </div>

      <section className={styles.card}>
        {tab === 'profile' ? (
          <>
            <h3 className={styles.h3}>Employee profile</h3>
            <p>Employee code: {employee.employee_code}</p>
            <p>Department: {employee.department_id ? (deptById.get(employee.department_id) ?? '—') : 'Unassigned'}</p>
            <p>Position (designation): {profilePositionLabel}</p>
            <p>Grade (org position): {profileGradeLabel}</p>
            <p>Job (catalog): {employee.job_id ? jobTitleById.get(employee.job_id) ?? '—' : 'Unassigned'}</p>
            <p>Manager: {employee.manager_id ?? 'Unassigned'}</p>
            <p>Location: {employee.location_id ?? 'Unassigned'}</p>
          </>
        ) : null}
        {tab === 'job' ? (
          <>
            <h3 className={styles.h3}>Job info</h3>
            <div className={styles.formRow}>
              <label className={styles.labelBlock}>
                Department
                <select
                  className={styles.input}
                  value={jobDeptId}
                  onChange={(e) => {
                    setJobDeptId(e.target.value)
                    setJobPositionId('')
                  }}
                  disabled={!canEdit}
                >
                  <option value="">Unassigned</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.labelBlock}>
                Position (designation)
                <select
                  className={styles.input}
                  value={jobPositionId}
                  onChange={(e) => setJobPositionId(e.target.value)}
                  disabled={!canEdit || !jobDeptId}
                >
                  <option value="">{jobDeptId ? 'Unassigned' : 'Select department first'}</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.labelBlock}>
                Grade (org position)
                {gradeBands.length === 0 && canEdit ? (
                  <span
                    style={{
                      display: 'block',
                      marginBottom: '0.25rem',
                      padding: '0.35rem 0.6rem',
                      background: '#fff8e1',
                      border: '1px solid #f59e0b',
                      borderRadius: 5,
                      fontSize: '0.8rem',
                      color: '#92400e',
                    }}
                  >
                    No grades configured.{' '}
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: '#2563eb',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontSize: 'inherit',
                      }}
                      onClick={() => navigate(`/company/${companyId}/payroll?tab=grades`)}
                    >
                      Create grades in Grade Structure
                    </button>{' '}
                    first.
                  </span>
                ) : null}
                {gradeHasNoBand ? (
                  <span
                    style={{
                      display: 'block',
                      marginBottom: '0.25rem',
                      padding: '0.35rem 0.6rem',
                      background: '#fff8e1',
                      border: '1px solid #f59e0b',
                      borderRadius: 5,
                      fontSize: '0.8rem',
                      color: '#92400e',
                    }}
                  >
                    Grade {currentGradeNum} has no configured band.{' '}
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: '#2563eb',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontSize: 'inherit',
                      }}
                      onClick={() => navigate(`/company/${companyId}/payroll?tab=grades`)}
                    >
                      Configure it in Grade Structure.
                    </button>
                  </span>
                ) : null}
                <select
                  className={styles.input}
                  value={jobGradeInput}
                  onChange={(e) => setJobGradeInput(e.target.value)}
                  disabled={!canEdit || !jobPositionId || gradeBands.length === 0}
                >
                  <option value="">
                    {gradeBands.length === 0
                      ? 'No grades — configure in Grade Structure'
                      : jobPositionId
                        ? '— Select grade —'
                        : 'Select position first'}
                  </option>
                  {gradeOptions.map((g) => (
                    <option key={g} value={String(g)}>
                      Grade {g}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {jobDeptId && positions.length === 0 && canEdit ? (
              <p className={styles.muted}>No positions for this department — create them under Company → Org / Positions.</p>
            ) : null}
            <div className={styles.formRow}>
              <label className={styles.labelBlock}>
                Job catalog
                <select
                  className={styles.input}
                  value={jobCatalogId}
                  onChange={(e) => setJobCatalogId(e.target.value)}
                  disabled={!canEdit}
                >
                  <option value="">Unassigned</option>
                  {jobCatalog.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.labelBlock}>
                Status
                <input className={styles.input} value={status} onChange={(e) => setStatus(e.target.value)} disabled={!canEdit} />
              </label>
            </div>
            <label className={styles.labelBlock}>
              Hire date
              <input type="date" className={styles.input} value={hireDate} onChange={(e) => setHireDate(e.target.value)} disabled={!canEdit} />
            </label>
            {canEdit ? (
              <button type="button" className={styles.btnSm} disabled={pending} onClick={() => void saveJobInfo()}>
                {pending ? 'Saving…' : 'Save job info'}
              </button>
            ) : null}
          </>
        ) : null}
        {tab === 'lifecycle' ? (
          <>
            <h3 className={styles.h3}>Lifecycle events</h3>
            {canEdit ? (
              <div className={styles.positionForm}>
                <input className={styles.input} placeholder="Event type" value={eventType} onChange={(e) => setEventType(e.target.value)} />
                <input className={styles.input} type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                <input className={styles.input} placeholder="Notes" value={eventNotes} onChange={(e) => setEventNotes(e.target.value)} />
                <button type="button" className={styles.btnSm} disabled={pending} onClick={() => void addLifecycleEvent()}>
                  Add event
                </button>
              </div>
            ) : null}
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 ? (
                    <tr>
                      <td className={styles.muted} colSpan={4}>
                        No lifecycle events yet.
                      </td>
                    </tr>
                  ) : null}
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td>{e.event_type}</td>
                      <td>{e.effective_date ?? '—'}</td>
                      <td>{e.status}</td>
                      <td>{e.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        {tab === 'onboarding' ? (
          <>
            <h3 className={styles.h3}>Onboarding checklist JSON</h3>
            <textarea
              className={styles.input}
              style={{ minHeight: 180 }}
              value={checklistText}
              onChange={(e) => setChecklistText(e.target.value)}
              disabled={!canEdit}
            />
            {canEdit ? (
              <button type="button" className={styles.btnSm} disabled={pending} onClick={() => void saveChecklist()}>
                Save checklist
              </button>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  )
}
