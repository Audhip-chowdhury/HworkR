import { useCallback, useEffect, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import { createAssessment, createReviewCycle, listAssessments, listPips, listReviewCycles } from '../../../api/performanceLearningApi'
import styles from '../CompanyWorkspacePage.module.css'
import { GoalCycleHrTracking } from './GoalCycleHrTracking'
import { PipsHrPanel } from './PipsHrPanel'

type Tab = 'cycles' | 'goals' | 'assessments' | 'pips'

function parseTabParam(v: string | null): Tab {
  if (v === 'goals' || v === 'assessments' || v === 'pips' || v === 'cycles') return v
  return 'cycles'
}

type PeriodType = 'quarterly' | 'biannual' | 'annual'

type KpiFormRow = {
  localId: string
  goal_description: string
  category: string
  weight: string
}

const DEFAULT_KPI_ROWS: Omit<KpiFormRow, 'localId'>[] = [
  { goal_description: 'Improve project delivery timelines', category: 'Productivity', weight: '25' },
  { goal_description: 'Enhance technical skills (e.g. frameworks, messaging)', category: 'Learning & Development', weight: '20' },
  { goal_description: 'Reduce production defects', category: 'Quality', weight: '20' },
  { goal_description: 'Stakeholder communication improvement', category: 'Behavioral', weight: '15' },
  { goal_description: 'Contribution to team initiatives', category: 'Teamwork', weight: '20' },
]

function newLocalId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`
}

function makeInitialKpiRows(): KpiFormRow[] {
  return DEFAULT_KPI_ROWS.map((r) => ({ ...r, localId: newLocalId() }))
}

function parseWeight(w: string): number | null {
  const t = w.trim()
  if (!t) return null
  const n = Number(t)
  if (Number.isNaN(n)) return null
  return Math.min(100, Math.max(0, Math.round(n)))
}

export function PerformancePage() {
  const { companyId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { myCompanies } = useAuth()
  const entry = myCompanies.find((x) => x.company.id === companyId)
  const [tab, setTabState] = useState<Tab>(() => parseTabParam(searchParams.get('tab')))

  useEffect(() => {
    setTabState(parseTabParam(searchParams.get('tab')))
  }, [searchParams])

  function selectTab(next: Tab) {
    setTabState(next)
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        if (next === 'cycles') n.delete('tab')
        else n.set('tab', next)
        return n
      },
      { replace: true },
    )
  }
  const [cycles, setCycles] = useState<any[]>([])
  const [assessments, setAssessments] = useState<any[]>([])
  const [pips, setPips] = useState<any[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [cycleName, setCycleName] = useState('')
  const [goalsDeadline, setGoalsDeadline] = useState('')
  const [periodType, setPeriodType] = useState<PeriodType>('quarterly')
  const [kpiRows, setKpiRows] = useState<KpiFormRow[]>(() => makeInitialKpiRows())
  const [cycleModalOpen, setCycleModalOpen] = useState(false)
  const [cycleFormError, setCycleFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const closeCycleModal = useCallback(() => {
    setCycleModalOpen(false)
    setCycleFormError(null)
    setCycleName('')
    setGoalsDeadline('')
    setPeriodType('quarterly')
    setKpiRows(makeInitialKpiRows())
  }, [])

  const openCycleModal = useCallback(() => {
    setCycleFormError(null)
    setCycleName('')
    setGoalsDeadline('')
    setPeriodType('quarterly')
    setKpiRows(makeInitialKpiRows())
    setCycleModalOpen(true)
  }, [])

  const refresh = useCallback(async () => {
    if (!companyId || entry?.membership.role !== 'hr_ops') return
    setLoading(true)
    setError(null)
    try {
      const [c, a, p] = await Promise.all([listReviewCycles(companyId), listAssessments(companyId), listPips(companyId)])
      setCycles(c)
      setAssessments(a)
      setPips(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load performance data')
    } finally {
      setLoading(false)
    }
  }, [companyId, entry?.membership.role])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!cycleModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCycleModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycleModalOpen, closeCycleModal])

  function updateKpiRow(localId: string, patch: Partial<Pick<KpiFormRow, 'goal_description' | 'category' | 'weight'>>) {
    setKpiRows((rows) => rows.map((r) => (r.localId === localId ? { ...r, ...patch } : r)))
  }

  function addKpiRow() {
    setKpiRows((rows) => [
      ...rows,
      { localId: newLocalId(), goal_description: '', category: '', weight: '' },
    ])
  }

  function removeKpiRow(localId: string) {
    setKpiRows((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.localId !== localId)))
  }

  async function submitReviewCycle() {
    if (!companyId) return
    const missing = kpiRows.some((r) => !r.goal_description.trim())
    if (missing) {
      setCycleFormError('Each goal needs a description.')
      return
    }
    if (!goalsDeadline.trim()) {
      setCycleFormError('Choose a deadline for employees to complete their goals.')
      return
    }
    setPending(true)
    setCycleFormError(null)
    try {
      const name = cycleName.trim() || `Review cycle · ${new Date().toLocaleDateString()}`
      await createReviewCycle(companyId, {
        name,
        type: periodType,
        goals_deadline: goalsDeadline.trim(),
        status: 'draft',
        kpi_definitions: kpiRows.map((r, i) => ({
          goal_key: `G${i + 1}`,
          goal_description: r.goal_description.trim(),
          category: r.category.trim() || null,
          weight_percent: parseWeight(r.weight),
        })),
      })
      closeCycleModal()
      await refresh()
    } catch (e) {
      setCycleFormError(e instanceof Error ? e.message : 'Failed to create review cycle')
    } finally {
      setPending(false)
    }
  }

  if (!entry) {
    return (
      <div className={styles.fallback}>
        <p>You do not have access to this company.</p>
      </div>
    )
  }
  if (entry.membership.role !== 'hr_ops') {
    return <Navigate to={`/company/${companyId}`} replace />
  }

  return (
    <div className={styles.org}>
      <div className={styles.tabBar}>
        <button type="button" className={`${styles.tabBtn} ${tab === 'cycles' ? styles.tabBtnActive : ''}`} onClick={() => selectTab('cycles')}>Review cycles</button>
        <button type="button" className={`${styles.tabBtn} ${tab === 'goals' ? styles.tabBtnActive : ''}`} onClick={() => selectTab('goals')}>Goals</button>
        <button type="button" className={`${styles.tabBtn} ${tab === 'assessments' ? styles.tabBtnActive : ''}`} onClick={() => selectTab('assessments')}>Assessments</button>
        <button type="button" className={`${styles.tabBtn} ${tab === 'pips' ? styles.tabBtnActive : ''}`} onClick={() => selectTab('pips')}>PIPs</button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}

      {tab === 'cycles' ? (
        <section className={styles.card}>
          <div className={styles.cyclesToolbar}>
            <h3 className={styles.h3} style={{ margin: 0 }}>Review cycles</h3>
            <button type="button" className={styles.btnSm} onClick={openCycleModal}>
              Create new cycle
            </button>
          </div>
          <p className={styles.muted} style={{ marginBottom: '1rem' }}>
            Performance review periods with KPI templates. Use the button above to add a cycle.
          </p>

          {loading ? <p className={styles.muted}>Loading cycles…</p> : null}
          {!loading && cycles.length === 0 ? (
            <p className={styles.muted}>No review cycles yet. Create one to get started.</p>
          ) : null}
          {!loading && cycles.length > 0 ? (
            <ul className={styles.cycleList}>
              {cycles.map((c) => (
                <li key={c.id}>
                  <strong>{c.name}</strong>
                  {' '}
                  <span className={styles.muted} style={{ fontWeight: 400 }}>
                    ({c.type ?? '—'} · {c.status}
                    {c.goals_deadline ? ` · deadline ${c.goals_deadline}` : ''})
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {cycleModalOpen ? (
            <div
              className={styles.modalBackdrop}
              role="presentation"
              onClick={closeCycleModal}
            >
              <div
                className={styles.modalPanel}
                role="dialog"
                aria-modal="true"
                aria-labelledby="cycle-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.modalHeader}>
                  <h4 id="cycle-modal-title">Create review cycle</h4>
                  <button
                    type="button"
                    className={styles.modalClose}
                    aria-label="Close"
                    onClick={closeCycleModal}
                  >
                    ×
                  </button>
                </div>
                <div className={styles.modalBody}>
                  {cycleFormError ? <p className={styles.error} style={{ marginTop: 0 }}>{cycleFormError}</p> : null}
                  <div className={styles.positionForm} style={{ maxWidth: '100%' }}>
                    <label className={styles.labelBlock}>
                      Cycle name
                      <input
                        className={styles.input}
                        placeholder="e.g. Q1 2026 performance"
                        value={cycleName}
                        onChange={(e) => setCycleName(e.target.value)}
                      />
                    </label>
                    <label className={styles.labelBlock}>
                      Cadence
                      <select
                        className={styles.input}
                        value={periodType}
                        onChange={(e) => setPeriodType(e.target.value as PeriodType)}
                      >
                        <option value="quarterly">Quarterly</option>
                        <option value="biannual">Biannual</option>
                        <option value="annual">Annual</option>
                      </select>
                    </label>
                    <label className={styles.labelBlock}>
                      Goals deadline (for employees)
                      <input
                        className={styles.input}
                        type="date"
                        value={goalsDeadline}
                        onChange={(e) => setGoalsDeadline(e.target.value)}
                      />
                    </label>
                    <p className={styles.muted} style={{ fontSize: '0.8rem', margin: '-0.25rem 0 0' }}>
                      All active employees get an in-app notification to complete their goals by this date.
                    </p>

                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.5rem' }}>Goal templates</div>
                    {kpiRows.map((row, idx) => (
                      <div
                        key={row.localId}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '0.75rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                        }}
                      >
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Goal {idx + 1}</div>
                        <label className={styles.labelBlock}>
                          Description
                          <textarea
                            className={styles.input}
                            style={{ minHeight: 64, resize: 'vertical' }}
                            value={row.goal_description}
                            onChange={(e) => updateKpiRow(row.localId, { goal_description: e.target.value })}
                          />
                        </label>
                        <div className={styles.formRow} style={{ alignItems: 'flex-end' }}>
                          <label className={styles.labelBlock} style={{ flex: 1, minWidth: 120 }}>
                            Category
                            <input
                              className={styles.input}
                              value={row.category}
                              onChange={(e) => updateKpiRow(row.localId, { category: e.target.value })}
                            />
                          </label>
                          <label className={styles.labelBlock} style={{ width: 100 }}>
                            Weight %
                            <input
                              className={styles.input}
                              type="number"
                              min={0}
                              max={100}
                              value={row.weight}
                              onChange={(e) => updateKpiRow(row.localId, { weight: e.target.value })}
                            />
                          </label>
                          <button
                            type="button"
                            className={styles.btnGhost}
                            disabled={kpiRows.length <= 1 || pending}
                            onClick={() => removeKpiRow(row.localId)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className={styles.formActions}>
                      <button type="button" className={styles.btnSm} disabled={pending} onClick={addKpiRow}>
                        Add goal
                      </button>
                    </div>
                  </div>
                </div>
                <div className={styles.modalFooter}>
                  <button type="button" className={styles.btnGhost} disabled={pending} onClick={closeCycleModal}>
                    Cancel
                  </button>
                  <button type="button" className={styles.btnSm} disabled={pending} onClick={() => void submitReviewCycle()}>
                    {pending ? 'Creating…' : 'Create cycle'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'goals' ? (
        <section className={styles.card}>
          <h3 className={styles.h3} style={{ marginTop: 0 }}>
            Goal cycle tracking
          </h3>
          <GoalCycleHrTracking companyId={companyId} cycles={cycles} parentLoading={loading} />
        </section>
      ) : null}
      {tab === 'assessments' ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Assessments</h3>
          <div className={styles.inline} style={{ marginBottom: '0.75rem' }}>
            <input
              className={styles.input}
              placeholder="Employee id"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={styles.btnSm}
            disabled={pending || !employeeId}
            onClick={() => void createAssessment(companyId, { employee_id: employeeId || '', type: 'manager' }).then(() => refresh())}
          >
            Create assessment
          </button>
          {assessments.map((a) => (
            <p key={a.id} className={styles.muted}>
              {a.type} · {a.submitted_at ?? 'draft'}
            </p>
          ))}
          {!loading && assessments.length === 0 ? <p className={styles.muted}>No assessments.</p> : null}
        </section>
      ) : null}
      {tab === 'pips' ? (
        <section className={styles.card}>
          <h3 className={styles.h3} style={{ marginTop: 0 }}>
            Performance improvement plans (PIP)
          </h3>
          <PipsHrPanel companyId={companyId} cycles={cycles} pips={pips} onRefresh={() => void refresh()} />
        </section>
      ) : null}
    </div>
  )
}
