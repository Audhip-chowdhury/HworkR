import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { createAssessment, createGoal, createPip, createReviewCycle, listAssessments, listGoals, listPips, listReviewCycles, updateGoal } from '../../../api/performanceLearningApi'
import styles from '../CompanyWorkspacePage.module.css'

type Tab = 'cycles' | 'goals' | 'assessments' | 'pips'

export function PerformancePage() {
  const { companyId = '' } = useParams()
  const [tab, setTab] = useState<Tab>('cycles')
  const [cycles, setCycles] = useState<any[]>([])
  const [goals, setGoals] = useState<any[]>([])
  const [assessments, setAssessments] = useState<any[]>([])
  const [pips, setPips] = useState<any[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [cycleId, setCycleId] = useState('')
  const [goalTitle, setGoalTitle] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [cycleName, setCycleName] = useState('')
  const [goalStatusFilter, setGoalStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [c, g, a, p] = await Promise.all([listReviewCycles(companyId), listGoals(companyId), listAssessments(companyId), listPips(companyId)])
      setCycles(c)
      setGoals(g)
      setAssessments(a)
      setPips(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load performance data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [companyId])

  async function addGoal() {
    if (!employeeId || !goalTitle.trim()) return
    setPending(true)
    try {
      await createGoal(companyId, { employee_id: employeeId, cycle_id: cycleId || null, title: goalTitle.trim(), target: goalTarget || null })
      setGoalTitle('')
      setGoalTarget('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create goal')
    } finally {
      setPending(false)
    }
  }

  const filteredGoals = goals.filter((g) => (goalStatusFilter ? g.status === goalStatusFilter : true))

  return (
    <div className={styles.org}>
      <div className={styles.tabBar}>
        <button className={`${styles.tabBtn} ${tab === 'cycles' ? styles.tabBtnActive : ''}`} onClick={() => setTab('cycles')}>Review cycles</button>
        <button className={`${styles.tabBtn} ${tab === 'goals' ? styles.tabBtnActive : ''}`} onClick={() => setTab('goals')}>Goals</button>
        <button className={`${styles.tabBtn} ${tab === 'assessments' ? styles.tabBtnActive : ''}`} onClick={() => setTab('assessments')}>Assessments</button>
        <button className={`${styles.tabBtn} ${tab === 'pips' ? styles.tabBtnActive : ''}`} onClick={() => setTab('pips')}>PIPs</button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}

      {tab === 'cycles' ? <section className={styles.card}><h3 className={styles.h3}>Review cycles</h3><div className={styles.inline}><input className={styles.input} placeholder="Cycle name" value={cycleName} onChange={(e) => setCycleName(e.target.value)} /><button className={styles.btnSm} disabled={pending} onClick={() => void createReviewCycle(companyId, { name: cycleName || `Cycle ${Date.now()}` }).then(() => refresh())}>Create cycle</button></div>{loading ? <p className={styles.muted}>Loading cycles…</p> : cycles.map((c) => <p key={c.id} className={styles.muted}>{c.name} ({c.status})</p>)}</section> : null}
      {tab === 'goals' ? <section className={styles.card}><h3 className={styles.h3}>Goals</h3><div className={styles.inline}><input className={styles.input} placeholder="Employee id" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} /><select className={styles.input} value={cycleId} onChange={(e) => setCycleId(e.target.value)}><option value="">No cycle</option>{cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input className={styles.input} placeholder="Goal title" value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} /><input className={styles.input} placeholder="Target" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} /><button className={styles.btnSm} disabled={pending} onClick={() => void addGoal()}>Create goal</button></div><div className={styles.inline}><select className={styles.input} value={goalStatusFilter} onChange={(e) => setGoalStatusFilter(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="completed">Completed</option></select></div>{filteredGoals.map((g) => <p key={g.id} className={styles.muted}>{g.title} <span className={`${styles.badge} ${g.progress >= 80 ? styles.badgeGreen : styles.badgeAmber}`}>{g.progress}%</span> <button className={styles.linkBtn} onClick={() => void updateGoal(companyId, g.id, { progress: Math.min(100, g.progress + 10) }).then(() => refresh())}>+10%</button></p>)}{!loading && filteredGoals.length === 0 ? <p className={styles.muted}>No goals.</p> : null}</section> : null}
      {tab === 'assessments' ? <section className={styles.card}><h3 className={styles.h3}>Assessments</h3><button className={styles.btnSm} disabled={pending || !employeeId} onClick={() => void createAssessment(companyId, { employee_id: employeeId || '', type: 'manager' }).then(() => refresh())}>Create assessment</button>{assessments.map((a) => <p key={a.id} className={styles.muted}>{a.type} · {a.submitted_at ?? 'draft'}</p>)}{!loading && assessments.length === 0 ? <p className={styles.muted}>No assessments.</p> : null}</section> : null}
      {tab === 'pips' ? <section className={styles.card}><h3 className={styles.h3}>PIPs</h3><button className={styles.btnSm} disabled={pending || !employeeId} onClick={() => void createPip(companyId, { employee_id: employeeId || '', reason: 'Performance improvement' }).then(() => refresh())}>Create PIP</button>{pips.map((p) => <p key={p.id} className={styles.muted}>{p.status} · {p.reason ?? '—'}</p>)}{!loading && pips.length === 0 ? <p className={styles.muted}>No PIPs.</p> : null}</section> : null}
    </div>
  )
}
