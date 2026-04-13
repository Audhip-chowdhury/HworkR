import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { createLeaveRequest, decideLeaveRequest, listAttendance, listHolidays, listLeaveBalances, listLeavePolicies, listLeaveRequests } from '../../../api/hrOpsApi'
import { useAuth } from '../../../auth/AuthContext'
import styles from '../CompanyWorkspacePage.module.css'

type Tab = 'requests' | 'balances' | 'attendance' | 'holidays' | 'policies'

export function HrOpsPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const role = myCompanies.find((x) => x.company.id === companyId)?.membership.role ?? ''
  const canDecide = role === 'company_admin' || role === 'hr_ops'
  const [tab, setTab] = useState<Tab>('requests')
  const [requests, setRequests] = useState<any[]>([])
  const [balances, setBalances] = useState<any[]>([])
  const [attendance, setAttendance] = useState<any[]>([])
  const [holidays, setHolidays] = useState<any[]>([])
  const [policies, setPolicies] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [leaveType, setLeaveType] = useState('annual')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [r, b, a, h, p] = await Promise.all([
        listLeaveRequests(companyId),
        listLeaveBalances(companyId),
        listAttendance(companyId),
        listHolidays(companyId),
        listLeavePolicies(companyId),
      ])
      setRequests(r)
      setBalances(b)
      setAttendance(a)
      setHolidays(h)
      setPolicies(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load HR operations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [companyId])

  async function createRequest() {
    if (!companyId || !startDate || !endDate) return
    setPending(true)
    setError(null)
    try {
      await createLeaveRequest(companyId, { type: leaveType, start_date: startDate, end_date: endDate, reason: reason || null })
      setReason('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create request')
    } finally {
      setPending(false)
    }
  }

  async function decide(requestId: string, status: 'approved' | 'rejected') {
    if (!canDecide) return
    if (!confirm(`Mark request as ${status}?`)) return
    setPending(true)
    try {
      await decideLeaveRequest(companyId, requestId, { status })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update request')
    } finally {
      setPending(false)
    }
  }

  const requestRows = requests.filter((r) => (statusFilter ? r.status === statusFilter : true))

  return (
    <div className={styles.org}>
      <div className={styles.tabBar}>
        <button className={`${styles.tabBtn} ${tab === 'requests' ? styles.tabBtnActive : ''}`} onClick={() => setTab('requests')}>Leave requests</button>
        <button className={`${styles.tabBtn} ${tab === 'balances' ? styles.tabBtnActive : ''}`} onClick={() => setTab('balances')}>Balances</button>
        <button className={`${styles.tabBtn} ${tab === 'attendance' ? styles.tabBtnActive : ''}`} onClick={() => setTab('attendance')}>Attendance</button>
        <button className={`${styles.tabBtn} ${tab === 'holidays' ? styles.tabBtnActive : ''}`} onClick={() => setTab('holidays')}>Holidays</button>
        <button className={`${styles.tabBtn} ${tab === 'policies' ? styles.tabBtnActive : ''}`} onClick={() => setTab('policies')}>Policies</button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}

      {tab === 'requests' ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Leave requests</h3>
          <div className={styles.inline}>
            <input className={styles.input} value={leaveType} onChange={(e) => setLeaveType(e.target.value)} placeholder="Type" />
            <input className={styles.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input className={styles.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <input className={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
            <button className={styles.btnSm} disabled={pending} onClick={() => void createRequest()}>Create request</button>
          </div>
          <div className={styles.inline}>
            <select className={styles.input} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Type</th><th>Dates</th><th>Status</th>{canDecide ? <th /> : null}</tr></thead>
              <tbody>
                {loading ? <tr><td className={styles.muted} colSpan={canDecide ? 4 : 3}>Loading leave requests…</td></tr> : null}
                {!loading && requestRows.length === 0 ? <tr><td className={styles.muted} colSpan={canDecide ? 4 : 3}>No leave requests.</td></tr> : null}
                {requestRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.type}</td>
                    <td>{r.start_date} - {r.end_date}</td>
                    <td>{r.status}</td>
                    {canDecide ? (
                      <td>
                        {r.status === 'pending' ? (
                          <>
                            <button className={styles.linkBtn} onClick={() => void decide(r.id, 'approved')}>Approve</button>
                            <button className={styles.linkDanger} onClick={() => void decide(r.id, 'rejected')}>Reject</button>
                          </>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {tab === 'balances' ? <section className={styles.card}><h3 className={styles.h3}>Leave balances</h3>{balances.length === 0 ? <p className={styles.muted}>No balances found.</p> : balances.map((b) => <p key={b.id} className={styles.muted}>{b.type}: {b.balance} ({b.year})</p>)}</section> : null}
      {tab === 'attendance' ? <section className={styles.card}><h3 className={styles.h3}>Attendance</h3>{attendance.length === 0 ? <p className={styles.muted}>No attendance records.</p> : attendance.map((a) => <p key={a.id} className={styles.muted}>{a.date} {a.status ?? '—'}</p>)}</section> : null}
      {tab === 'holidays' ? <section className={styles.card}><h3 className={styles.h3}>Holiday calendar</h3>{holidays.length === 0 ? <p className={styles.muted}>No holidays configured.</p> : holidays.map((h) => <p key={h.id} className={styles.muted}>{h.date}: {h.name}</p>)}</section> : null}
      {tab === 'policies' ? <section className={styles.card}><h3 className={styles.h3}>Leave policies</h3>{policies.length === 0 ? <p className={styles.muted}>No leave policies.</p> : policies.map((p) => <p key={p.id} className={styles.muted}>{p.type}</p>)}</section> : null}
    </div>
  )
}
