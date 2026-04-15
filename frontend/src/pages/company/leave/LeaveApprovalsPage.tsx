import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import { decideLeaveRequest, listLeaveRequests, type LeaveRequestRow } from '../../../api/leaveApi'
import styles from '../CompanyWorkspacePage.module.css'

const HR_ROLES = new Set([
  'company_admin',
  'hr_ops',
  'talent_acquisition',
  'ld_performance',
  'compensation_analytics',
])

export function LeaveApprovalsPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const role = myCompanies.find((x) => x.company.id === companyId)?.membership.role ?? ''
  const allowed = HR_ROLES.has(role)

  const [rows, setRows] = useState<LeaveRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEmp, setSelectedEmp] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!companyId || !allowed) return
    setLoading(true)
    void listLeaveRequests(companyId)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [companyId, allowed])

  useEffect(() => {
    refresh()
  }, [refresh])

  const pending = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows])

  const byEmployee = useMemo(() => {
    const m = new Map<string, LeaveRequestRow[]>()
    for (const r of pending) {
      const k = r.employee_id
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(r)
    }
    return m
  }, [pending])

  const empList = useMemo(() => {
    return [...byEmployee.entries()].map(([id, list]) => ({
      id,
      name: list[0]?.employee_display_name ?? '—',
      code: list[0]?.employee_code ?? '',
      count: list.length,
    }))
  }, [byEmployee])

  async function onDecide(id: string, status: 'approved' | 'rejected') {
    if (!companyId) return
    setBusyId(id)
    setError(null)
    try {
      await decideLeaveRequest(companyId, id, { status })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  if (!allowed) {
    return (
      <div className={styles.org}>
        <section className={styles.card}>
          <p className={styles.muted}>This page is only available for HR and leadership roles.</p>
        </section>
      </div>
    )
  }

  const detail = selectedEmp ? byEmployee.get(selectedEmp) ?? [] : []

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>Leave approvals</h3>
        <p className={styles.hint}>Employees with at least one pending request. Select a name to review and approve or reject.</p>
        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.employeesSplit}>
          <div className={styles.employeesListPane}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={2} className={styles.muted}>
                        Loading…
                      </td>
                    </tr>
                  ) : empList.length === 0 ? (
                    <tr>
                      <td colSpan={2} className={styles.muted}>
                        No pending leave requests.
                      </td>
                    </tr>
                  ) : (
                    empList.map((e) => (
                      <tr
                        key={e.id}
                        className={selectedEmp === e.id ? styles.rowSelected : undefined}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedEmp(e.id)}
                      >
                        <td>
                          {e.name}
                          {e.code ? <span className={styles.muted}> ({e.code})</span> : null}
                        </td>
                        <td>{e.count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className={styles.employeesDetailPane}>
            {!selectedEmp ? (
              <p className={styles.muted}>Select an employee from the list.</p>
            ) : (
              <>
                <h4 className={styles.employeesDetailTitle}>
                  {detail[0]?.employee_display_name ?? '—'}
                  {detail[0]?.employee_code ? (
                    <span className={styles.hint} style={{ fontWeight: 400 }}>
                      {' '}
                      ({detail[0].employee_code})
                    </span>
                  ) : null}
                </h4>
                {detail.map((r) => (
                  <div key={r.id} className={styles.employeesSection} style={{ marginBottom: '1rem' }}>
                    <div className={styles.hint}>
                      {r.type} · {r.start_date} → {r.end_date}
                    </div>
                    {r.reason ? <p style={{ marginTop: '0.35rem' }}>{r.reason}</p> : <p className={styles.muted}>No comments</p>}
                    <div className={styles.inline} style={{ marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        className={styles.btnSm}
                        disabled={busyId === r.id}
                        onClick={() => void onDecide(r.id, 'approved')}
                      >
                        {busyId === r.id ? '…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        className={styles.btnSm}
                        disabled={busyId === r.id}
                        onClick={() => void onDecide(r.id, 'rejected')}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
