import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { createPayRun, createPayslip, createSalaryStructure, listPayRuns, listPayslips, listSalaryStructures, updatePayRun } from '../../../api/compensationApi'
import styles from '../CompanyWorkspacePage.module.css'

type Tab = 'salary' | 'runs' | 'payslips'

export function PayrollPage() {
  const { companyId = '' } = useParams()
  const [tab, setTab] = useState<Tab>('salary')
  const [structures, setStructures] = useState<any[]>([])
  const [runs, setRuns] = useState<any[]>([])
  const [payslips, setPayslips] = useState<any[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [month, setMonth] = useState(String(new Date().getMonth() + 1))
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const status = 'draft'
  const [payRunId, setPayRunId] = useState('')
  const [gross, setGross] = useState('0')
  const [net, setNet] = useState('0')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [s, r, p] = await Promise.all([listSalaryStructures(companyId), listPayRuns(companyId), listPayslips(companyId)])
      setStructures(s)
      setRuns(r)
      setPayslips(p)
      if (!payRunId && r[0]) setPayRunId(r[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payroll')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [companyId])

  const filteredRuns = runs.filter((r) => (statusFilter ? r.status === statusFilter : true))

  return (
    <div className={styles.org}>
      <div className={styles.tabBar}>
        <button className={`${styles.tabBtn} ${tab === 'salary' ? styles.tabBtnActive : ''}`} onClick={() => setTab('salary')}>Salary structures</button>
        <button className={`${styles.tabBtn} ${tab === 'runs' ? styles.tabBtnActive : ''}`} onClick={() => setTab('runs')}>Pay runs</button>
        <button className={`${styles.tabBtn} ${tab === 'payslips' ? styles.tabBtnActive : ''}`} onClick={() => setTab('payslips')}>Payslips</button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}

      {tab === 'salary' ? <section className={styles.card}><h3 className={styles.h3}>Salary structures</h3><div className={styles.inline}><input className={styles.input} placeholder="Employee id" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} /><button className={styles.btnSm} disabled={pending || !employeeId} onClick={() => void createSalaryStructure(companyId, { employee_id: employeeId, components_json: { base: 0 } }).then(() => refresh())}>Create structure</button></div>{loading ? <p className={styles.muted}>Loading structures…</p> : structures.map((s) => <p key={s.id} className={styles.muted}>{s.employee_id.slice(0, 8)}… effective {s.effective_from ?? '—'}</p>)}</section> : null}
      {tab === 'runs' ? <section className={styles.card}><h3 className={styles.h3}>Pay runs</h3><div className={styles.inline}><input className={styles.input} type="number" min={1} max={12} value={month} onChange={(e) => setMonth(e.target.value)} /><input className={styles.input} type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(e.target.value)} /><button className={styles.btnSm} disabled={pending} onClick={() => void createPayRun(companyId, { month: Number(month), year: Number(year), status }).then(() => refresh())}>Create pay run</button><select className={styles.input} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option><option value="draft">Draft</option><option value="processing">Processing</option><option value="completed">Completed</option></select></div>{filteredRuns.map((r) => <p key={r.id} className={styles.muted}>{r.month}/{r.year} {r.status} <button className={styles.linkBtn} onClick={() => void updatePayRun(companyId, r.id, { status: 'completed' }).then(() => refresh())}>Mark completed</button></p>)}{!loading && filteredRuns.length === 0 ? <p className={styles.muted}>No pay runs.</p> : null}</section> : null}
      {tab === 'payslips' ? <section className={styles.card}><h3 className={styles.h3}>Payslips</h3><div className={styles.inline}><input className={styles.input} placeholder="Employee id" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} /><select className={styles.input} value={payRunId} onChange={(e) => setPayRunId(e.target.value)}><option value="">Pay run</option>{runs.map((r) => <option key={r.id} value={r.id}>{r.month}/{r.year}</option>)}</select><input className={styles.input} type="number" value={gross} onChange={(e) => setGross(e.target.value)} placeholder="Gross" /><input className={styles.input} type="number" value={net} onChange={(e) => setNet(e.target.value)} placeholder="Net" /><button className={styles.btnSm} disabled={pending || !employeeId || !payRunId} onClick={() => void createPayslip(companyId, { employee_id: employeeId, pay_run_id: payRunId, gross: Number(gross), net: Number(net) }).then(() => refresh())}>Create payslip</button></div>{payslips.map((p) => <p key={p.id} className={styles.muted}>{p.employee_id.slice(0,8)}… gross {p.gross} net {p.net}</p>)}{!loading && payslips.length === 0 ? <p className={styles.muted}>No payslips.</p> : null}</section> : null}
    </div>
  )
}
