import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { createEmployee, listEmployees, type Employee } from '../../../api/employeesApi'
import { apiFetch } from '../../../api/client'
import { useAuth } from '../../../auth/AuthContext'
import { listPositions, type Department, type Position } from '../../../api/organizationApi'
import styles from '../CompanyWorkspacePage.module.css'

type Job = { id: string; title: string }
type SortField = 'employee_code' | 'status' | 'hire_date'

export function EmployeesPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const role = myCompanies.find((x) => x.company.id === companyId)?.membership.role ?? ''
  const canCreate = role === 'company_admin' || role === 'hr_ops'
  const [rows, setRows] = useState<Employee[]>([])
  const [depts, setDepts] = useState<Department[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('employee_code')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [code, setCode] = useState('EMP-')
  const [status, setStatus] = useState('active')
  const [hireDate, setHireDate] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [jobId, setJobId] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [employees, departments, jobCatalog] = await Promise.all([
        listEmployees(companyId),
        apiFetch<Department[]>(`/companies/${companyId}/departments`),
        apiFetch<Job[]>(`/companies/${companyId}/job-catalog`),
      ])
      setRows(employees)
      setDepts(departments)
      setJobs(jobCatalog)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load employees')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [companyId])

  useEffect(() => {
    if (!companyId || !departmentId) {
      setPositions([])
      setPositionId('')
      return
    }
    let cancelled = false
    void listPositions(companyId, departmentId)
      .then((rows) => {
        if (!cancelled) setPositions(rows)
      })
      .catch(() => {
        if (!cancelled) setPositions([])
      })
    return () => {
      cancelled = true
    }
  }, [companyId, departmentId])

  function onSort(next: SortField) {
    if (next === sortField) {
      setSortDir((v) => (v === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(next)
    setSortDir('asc')
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!companyId || !canCreate) return
    setPending(true)
    setError(null)
    try {
      if (departmentId) {
        if (positions.length > 0 && !positionId) {
          setError('Select a position (designation) for this department, or add positions under Company → Org.')
          setPending(false)
          return
        }
      }
      await createEmployee(companyId, {
        employee_code: code,
        status,
        hire_date: hireDate || null,
        department_id: departmentId || null,
        position_id: positionId || null,
        job_id: jobId || null,
      })
      setCode('EMP-')
      setStatus('active')
      setHireDate('')
      setDepartmentId('')
      setPositionId('')
      setJobId('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create employee')
    } finally {
      setPending(false)
    }
  }

  const filtered = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const sign = sortDir === 'asc' ? 1 : -1
      const av = String(a[sortField] ?? '')
      const bv = String(b[sortField] ?? '')
      return av.localeCompare(bv) * sign
    })
    return sorted.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false
      return `${r.employee_code} ${r.status}`.toLowerCase().includes(q.toLowerCase())
    })
  }, [q, rows, sortDir, sortField, statusFilter])

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>Employees</h3>
        {error ? <p className={styles.error}>{error}</p> : null}
        <div className={styles.inline}>
          <input
            className={styles.input}
            placeholder="Search by code/status"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className={styles.input}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="on_leave">On leave</option>
          </select>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th><button type="button" className={styles.linkBtn} onClick={() => onSort('employee_code')}>Code</button></th>
                <th><button type="button" className={styles.linkBtn} onClick={() => onSort('status')}>Status</button></th>
                <th><button type="button" className={styles.linkBtn} onClick={() => onSort('hire_date')}>Hire date</button></th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className={styles.muted}>Loading employees…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className={styles.muted}>No employees match your filters.</td></tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.id}>
                    <td>{e.employee_code}</td>
                    <td>{e.status}</td>
                    <td>{e.hire_date ?? '—'}</td>
                    <td><Link to={`/company/${companyId}/employees/${e.id}`}>Detail</Link></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      {canCreate ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Create employee</h3>
          <form className={styles.positionForm} onSubmit={onCreate}>
            <label className={styles.labelBlock}>
              Employee code
              <input className={styles.input} value={code} onChange={(e) => setCode(e.target.value)} required />
            </label>
            <div className={styles.formRow}>
              <label className={styles.labelBlock}>
                Status
                <select className={styles.input} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_leave">On leave</option>
                </select>
              </label>
              <label className={styles.labelBlock}>
                Hire date
                <input type="date" className={styles.input} value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.labelBlock}>
                Department
                <select
                  className={styles.input}
                  value={departmentId}
                  onChange={(e) => {
                    setDepartmentId(e.target.value)
                    setPositionId('')
                  }}
                >
                  <option value="">Unassigned</option>
                  {depts.map((d) => (
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
                  value={positionId}
                  onChange={(e) => setPositionId(e.target.value)}
                  disabled={!departmentId}
                >
                  <option value="">{departmentId ? 'Select position' : 'Select a department first'}</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {departmentId && positions.length === 0 ? (
              <p className={styles.muted}>
                No positions for this department yet. Create them under Company → Org chart / Positions.
              </p>
            ) : null}
            <div className={styles.formRow}>
              <label className={styles.labelBlock}>
                Job catalog
                <select className={styles.input} value={jobId} onChange={(e) => setJobId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className={styles.btnSm} disabled={pending}>{pending ? 'Creating…' : 'Create employee'}</button>
          </form>
        </section>
      ) : null}
    </div>
  )
}
