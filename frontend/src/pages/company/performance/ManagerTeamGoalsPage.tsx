import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useAuth } from '../../../auth/AuthContext'
import { listMyDirectReports, type Employee } from '../../../api/employeesApi'
import { listGoals, updateGoal, type Goal } from '../../../api/performanceLearningApi'
import styles from '../CompanyWorkspacePage.module.css'

function displayName(emp: Employee): string {
  const d = emp.personal_info_json?.display_name
  if (typeof d === 'string' && d.trim()) return d.trim()
  return emp.employee_code
}

type Draft = { rating: string; comment: string }

function goalDraft(g: Goal): Draft {
  return {
    rating: g.manager_rating != null ? String(g.manager_rating) : '',
    comment: g.manager_comment ?? '',
  }
}

/** Rating 1–5 and non-empty comment — required before submit. */
function isReviewComplete(dr: Draft): boolean {
  const r = dr.rating.trim()
  if (r === '') return false
  const n = Number(r)
  if (!Number.isInteger(n) || n < 1 || n > 5) return false
  return dr.comment.trim().length > 0
}

function listTitle(g: Goal): string {
  const t = g.title.trim()
  if (t.length <= 72) return t
  return `${t.slice(0, 69)}…`
}

export function ManagerTeamGoalsPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const entry = myCompanies.find((x) => x.company.id === companyId)
  const canManageTeamGoals = entry?.membership.role === 'employee' || entry?.membership.role === 'hr_ops'

  const [reports, setReports] = useState<Employee[]>([])
  const [selectedReportId, setSelectedReportId] = useState('')
  const [goals, setGoals] = useState<Goal[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [activeGoalId, setActiveGoalId] = useState('')
  const [loadingReports, setLoadingReports] = useState(true)
  const [loadingGoals, setLoadingGoals] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadReports = useCallback(async () => {
    if (!companyId || !canManageTeamGoals) return
    setLoadingReports(true)
    setError(null)
    try {
      const list = await listMyDirectReports(companyId)
      setReports(list)
      setSelectedReportId((prev) => {
        if (prev && list.some((r) => r.id === prev)) return prev
        return list[0]?.id ?? ''
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load team')
    } finally {
      setLoadingReports(false)
    }
  }, [companyId, canManageTeamGoals])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  const refreshGoals = useCallback(async () => {
    if (!companyId || !selectedReportId) {
      setGoals([])
      setDrafts({})
      setActiveGoalId('')
      return
    }
    setLoadingGoals(true)
    setError(null)
    try {
      const data = await listGoals(companyId, selectedReportId)
      const byId = new Map<string, Goal>()
      for (const g of data) {
        if (!byId.has(g.id)) byId.set(g.id, g)
      }
      const unique = [...byId.values()]
      setGoals(unique)
      const d: Record<string, Draft> = {}
      for (const g of unique) {
        d[g.id] = goalDraft(g)
      }
      setDrafts(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load goals')
      setGoals([])
      setDrafts({})
      setActiveGoalId('')
    } finally {
      setLoadingGoals(false)
    }
  }, [companyId, selectedReportId])

  useEffect(() => {
    void refreshGoals()
  }, [refreshGoals])

  useEffect(() => {
    if (goals.length === 0) {
      setActiveGoalId('')
      return
    }
    setActiveGoalId((prev) => (prev && goals.some((g) => g.id === prev) ? prev : goals[0].id))
  }, [goals])

  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedReportId),
    [reports, selectedReportId],
  )

  const activeGoal = useMemo(
    () => goals.find((g) => g.id === activeGoalId) ?? null,
    [goals, activeGoalId],
  )

  const hasUnsavedChanges = useMemo(() => {
    for (const g of goals) {
      const dr = drafts[g.id] ?? goalDraft(g)
      const ratingMatch = dr.rating === (g.manager_rating != null ? String(g.manager_rating) : '')
      const commentMatch = (dr.comment ?? '') === (g.manager_comment ?? '')
      if (!ratingMatch || !commentMatch) return true
    }
    return false
  }, [goals, drafts])

  const completedCount = useMemo(() => {
    let n = 0
    for (const g of goals) {
      const dr = drafts[g.id] ?? goalDraft(g)
      if (isReviewComplete(dr)) n += 1
    }
    return n
  }, [goals, drafts])

  const allGoalsReady = goals.length > 0 && completedCount === goals.length

  async function submitAllReviews() {
    if (!companyId || goals.length === 0) return
    for (const g of goals) {
      const dr = drafts[g.id] ?? goalDraft(g)
      if (!isReviewComplete(dr)) {
        toast.error('Add a rating (1–5) and a comment for every goal before submitting.')
        return
      }
    }
    const payloads: Array<{ goalId: string; manager_rating: number | null; manager_comment: string | null }> = []
    for (const g of goals) {
      const dr = drafts[g.id] ?? goalDraft(g)
      const ratingRaw = dr.rating.trim()
      const n = Number(ratingRaw)
      payloads.push({
        goalId: g.id,
        manager_rating: n,
        manager_comment: dr.comment.trim(),
      })
    }
    setSaving(true)
    try {
      const results = await Promise.all(
        payloads.map((p) =>
          updateGoal(companyId, p.goalId, {
            manager_rating: p.manager_rating,
            manager_comment: p.manager_comment,
          }),
        ),
      )
      setGoals((prev) => {
        const byId = new Map(results.map((r) => [r.id, r]))
        return prev.map((g) => byId.get(g.id) ?? g)
      })
      setDrafts((prev) => {
        const next = { ...prev }
        for (const r of results) {
          next[r.id] = goalDraft(r)
        }
        return next
      })
      toast.success('Review submitted.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSaving(false)
    }
  }

  function setDraft(goalId: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [goalId]: { ...(prev[goalId] ?? { rating: '', comment: '' }), ...patch },
    }))
  }

  if (!entry) {
    return (
      <div className={styles.fallback}>
        <p>You do not have access to this company.</p>
      </div>
    )
  }

  if (!canManageTeamGoals) {
    return <Navigate to={`/company/${companyId}`} replace />
  }

  if (!loadingReports && reports.length === 0) {
    return <Navigate to={`/company/${companyId}`} replace />
  }

  const activeDr = activeGoal ? (drafts[activeGoal.id] ?? goalDraft(activeGoal)) : null

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>Team goals review</h3>
        <p className={styles.muted}>
          Pick a team member, then select each goal on the left to add a rating and comment on the right. When every goal
          has a rating and comment, click <strong>Submit review</strong> to save all at once.
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.inline} style={{ marginBottom: '1rem' }}>
          <label className={styles.labelBlock} style={{ marginBottom: 0 }}>
            Team member
            <select
              className={styles.input}
              style={{ minWidth: 220 }}
              value={selectedReportId}
              disabled={loadingReports || reports.length === 0}
              onChange={(e) => setSelectedReportId(e.target.value)}
            >
              {!loadingReports && reports.length === 0 ? (
                <option value="">No direct reports</option>
              ) : (
                reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {displayName(r)} ({r.employee_code})
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        {loadingReports ? <p className={styles.muted}>Loading team…</p> : null}

        {selectedReport && !loadingGoals && !loadingReports ? (
          <p className={styles.muted} style={{ marginBottom: '0.75rem' }}>
            Reviewing goals for <strong>{displayName(selectedReport)}</strong>
            {goals.length > 0 ? (
              <>
                {' '}
                · {completedCount}/{goals.length} goals reviewed
              </>
            ) : null}
          </p>
        ) : null}

        {loadingGoals ? <p className={styles.muted}>Loading goals…</p> : null}

        {!loadingGoals && selectedReportId && goals.length > 0 ? (
          <div className={styles.teamGoalsSplit}>
            <div className={styles.teamGoalsMobilePicker}>
              <label className={styles.labelBlock} style={{ marginBottom: 0 }}>
                Goal
                <select
                  className={styles.teamGoalsMobilePickerSelect}
                  value={activeGoalId}
                  onChange={(e) => setActiveGoalId(e.target.value)}
                  aria-label="Select goal to review"
                >
                  {goals.map((g) => {
                    const dr = drafts[g.id] ?? goalDraft(g)
                    const complete = isReviewComplete(dr)
                    return (
                      <option key={g.id} value={g.id}>
                        {listTitle(g)}
                        {complete ? ' ✓' : ''}
                      </option>
                    )
                  })}
                </select>
              </label>
            </div>
            <nav className={styles.teamGoalsList} aria-label="Goals for this employee">
              {goals.map((g) => {
                const dr = drafts[g.id] ?? goalDraft(g)
                const complete = isReviewComplete(dr)
                const isActive = g.id === activeGoalId
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`${styles.teamGoalsListBtn} ${isActive ? styles.teamGoalsListBtnActive : ''} ${complete ? styles.teamGoalsListBtnComplete : ''}`}
                    onClick={() => setActiveGoalId(g.id)}
                  >
                    {listTitle(g)}
                    <span className={styles.teamGoalsListMeta}>
                      {complete ? 'Ready' : 'Needs review'}
                      {g.cycle_id ? ` · cycle ${g.cycle_id.slice(0, 8)}` : ''}
                    </span>
                  </button>
                )
              })}
            </nav>

            <div className={styles.teamGoalsDetail}>
              {activeGoal && activeDr ? (
                <div className={styles.teamGoalsDetailCard}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    {activeGoal.cycle_id ? `Cycle ${activeGoal.cycle_id.slice(0, 8)}… · ` : ''}
                    Status {activeGoal.status} · Progress {activeGoal.progress}%
                  </div>
                  <h4 className={styles.h4} style={{ marginTop: 0 }}>
                    {activeGoal.title}
                  </h4>
                  <label className={styles.labelBlock}>
                    Description (read-only)
                    <textarea
                      className={styles.input}
                      style={{ minHeight: 72 }}
                      readOnly
                      value={activeGoal.description ?? ''}
                    />
                  </label>
                  <label className={styles.labelBlock}>
                    Target (read-only)
                    <input className={styles.input} readOnly value={activeGoal.target ?? ''} />
                  </label>
                  <label className={styles.labelBlock}>
                    Actual achievement (read-only)
                    <textarea
                      className={styles.input}
                      style={{ minHeight: 72 }}
                      readOnly
                      value={activeGoal.actual_achievement ?? ''}
                    />
                  </label>
                  <label className={styles.labelBlock}>
                    Your rating (1–5)
                    <select
                      className={styles.input}
                      value={activeDr.rating}
                      onChange={(e) => setDraft(activeGoal.id, { rating: e.target.value })}
                    >
                      <option value="">Select…</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={String(n)}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.labelBlock}>
                    Manager comment
                    <textarea
                      className={styles.input}
                      style={{ minHeight: 88 }}
                      value={activeDr.comment}
                      onChange={(e) => setDraft(activeGoal.id, { comment: e.target.value })}
                      placeholder="Feedback for this goal…"
                    />
                  </label>
                </div>
              ) : null}

              <div
                className={styles.formActions}
                style={{
                  marginTop: '1rem',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                }}
              >
                {!allGoalsReady ? (
                  <p className={styles.muted} style={{ margin: 0, fontSize: '0.85rem' }}>
                    Complete a rating and comment for each goal in the list, then submit.
                  </p>
                ) : !hasUnsavedChanges ? (
                  <p className={styles.muted} style={{ margin: 0, fontSize: '0.85rem' }}>
                    All goals reviewed and saved.
                  </p>
                ) : null}
                <button
                  type="button"
                  className={styles.btnSm}
                  disabled={!allGoalsReady || !hasUnsavedChanges || saving}
                  onClick={() => void submitAllReviews()}
                >
                  {saving ? 'Submitting…' : 'Submit review'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!loadingGoals && selectedReportId && goals.length === 0 && reports.length > 0 ? (
          <p className={styles.muted}>No goals on file for this employee yet.</p>
        ) : null}
      </section>
    </div>
  )
}
