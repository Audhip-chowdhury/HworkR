import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { createBenefitsEnrollment, createBenefitsPlan, listBenefitsEnrollments, listBenefitsPlans } from '../../../api/compensationApi'
import styles from '../CompanyWorkspacePage.module.css'

type Tab = 'plans' | 'enrollments'

export function BenefitsPage() {
  const { companyId = '' } = useParams()
  const [tab, setTab] = useState<Tab>('plans')
  const [plans, setPlans] = useState<any[]>([])
  const [enrollments, setEnrollments] = useState<any[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [planId, setPlanId] = useState('')
  const [planName, setPlanName] = useState('')
  const [planType, setPlanType] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [p, e] = await Promise.all([listBenefitsPlans(companyId), listBenefitsEnrollments(companyId)])
      setPlans(p)
      setEnrollments(e)
      if (!planId && p[0]) setPlanId(p[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load benefits')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [companyId])

  const filtered = enrollments.filter((e) => (statusFilter ? e.status === statusFilter : true))

  return (
    <div className={styles.org}>
      <div className={styles.tabBar}>
        <button className={`${styles.tabBtn} ${tab === 'plans' ? styles.tabBtnActive : ''}`} onClick={() => setTab('plans')}>Plans</button>
        <button className={`${styles.tabBtn} ${tab === 'enrollments' ? styles.tabBtnActive : ''}`} onClick={() => setTab('enrollments')}>Enrollments</button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {tab === 'plans' ? <section className={styles.card}><h3 className={styles.h3}>Benefit plans</h3><div className={styles.inline}><input className={styles.input} placeholder="Plan name" value={planName} onChange={(e) => setPlanName(e.target.value)} /><input className={styles.input} placeholder="Type" value={planType} onChange={(e) => setPlanType(e.target.value)} /><button className={styles.btnSm} disabled={pending} onClick={() => void createBenefitsPlan(companyId, { name: planName || `Plan ${Date.now()}`, type: planType || null }).then(() => refresh())}>Create plan</button></div>{loading ? <p className={styles.muted}>Loading plans…</p> : plans.map((p) => <p key={p.id} className={styles.muted}>{p.name} ({p.type ?? 'general'})</p>)}</section> : null}
      {tab === 'enrollments' ? <section className={styles.card}><h3 className={styles.h3}>Enrollments</h3><div className={styles.inline}><input className={styles.input} placeholder="Employee id" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} /><select className={styles.input} value={planId} onChange={(e) => setPlanId(e.target.value)}><option value="">Select plan</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className={styles.btnSm} disabled={pending || !employeeId || !planId} onClick={() => void createBenefitsEnrollment(companyId, { employee_id: employeeId, plan_id: planId }).then(() => refresh())}>Enroll</button><select className={styles.input} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="cancelled">Cancelled</option></select></div>{filtered.map((e) => <p key={e.id} className={styles.muted}>{e.employee_id.slice(0, 8)}… {e.status}</p>)}{!loading && filtered.length === 0 ? <p className={styles.muted}>No enrollments.</p> : null}</section> : null}
    </div>
  )
}
