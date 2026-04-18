import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import { getLeaveSummary } from '../../../api/leaveApi'
import { listEmployeeSummaries, type EmployeeSummary } from '../../../api/employeesApi'
import styles from '../CompanyWorkspacePage.module.css'

const HR_ROLES = new Set([
  'company_admin',
  'hr_ops',
  'talent_acquisition',
  'ld_performance',
  'compensation_analytics',
])

export function LeaveBalancesPage() {
  const { companyId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('id') ?? ''
  const { myCompanies } = useAuth()
  const role = myCompanies.find((x) => x.company.id === companyId)?.membership.role ?? ''
  const allowed = HR_ROLES.has(role)

  const year = new Date().getFullYear()

  const [summaries, setSummaries] = useState<EmployeeSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [balance, setBalance] = useState<Awaited<ReturnType<typeof getLeaveSummary>> | null>(null)

  useEffect(() => {
    if (!companyId || !allowed) return
    setListLoading(true)
    void listEmployeeSummaries(companyId)
      .then(setSummaries)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setListLoading(false))
  }, [companyId, allowed])

  const loadDetail = useCallback(
    async (id: string) => {
      if (!companyId || !id) {
        setBalance(null)
        return
      }
      setDetailLoading(true)
      setError(null)
      try {
        const b = await getLeaveSummary(companyId, year, id)
        setBalance(b)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load balances')
        setBalance(null)
      } finally {
        setDetailLoading(false)
      }
    },
    [companyId, year],
  )

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId)
    else setBalance(null)
  }, [selectedId, loadDetail])

  const filtered = useMemo(() => {
    const qq = q.toLowerCase()
    return summaries.filter(
      (s) =>
        !qq ||
        s.employee_code.toLowerCase().includes(qq) ||
        s.display_name.toLowerCase().includes(qq) ||
        s.display_email.toLowerCase().includes(qq),
    )
  }, [q, summaries])

  if (!allowed) {
    return (
      <div className={styles.org}>
        <section className={styles.card}>
          <p className={styles.muted}>This page is only available for HR and leadership roles.</p>
        </section>
      </div>
    )
  }

  function selectEmployee(id: string) {
    setSearchParams(id ? { id } : {})
  }

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>Leave balance tracker</h3>
        <p className={styles.hint}>
          Select an employee to see allocated, used, pending, and remaining days per leave type for {year}.
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.employeesSplit}>
          <div className={styles.employeesListPane}>
            <input
              className={styles.input}
              placeholder="Search by ID, name, or email"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ marginBottom: '0.75rem' }}
            />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {listLoading ? (
                    <tr>
                      <td colSpan={2} className={styles.muted}>
                        Loading…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={2} className={styles.muted}>
                        No employees found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((s) => (
                      <tr
                        key={s.id}
                        className={selectedId === s.id ? styles.rowSelected : undefined}
                        style={{ cursor: 'pointer' }}
                        onClick={() => selectEmployee(s.id)}
                      >
                        <td>{s.employee_code}</td>
                        <td>{s.display_name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className={styles.employeesDetailPane}>
            {!selectedId ? (
              <p className={styles.muted}>Select an employee from the list.</p>
            ) : detailLoading ? (
              <p className={styles.muted}>Loading balances…</p>
            ) : !balance ? (
              <p className={styles.muted}>Could not load balances.</p>
            ) : (
              <>
                <h4 className={styles.employeesDetailTitle}>
                  {summaries.find((x) => x.id === selectedId)?.display_name ?? 'Employee'}
                </h4>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Allocated</th>
                        <th>Taken</th>
                        <th>Pending</th>
                        <th>Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {balance.types.map((t) => (
                        <tr key={t.type}>
                          <td>{t.type}</td>
                          <td>{t.allocated}</td>
                          <td>{t.used}</td>
                          <td>{t.pending}</td>
                          <td>{t.remaining}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
