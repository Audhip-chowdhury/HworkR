import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useAuth } from '../../../auth/AuthContext'
import {
  listMyReviewCycleGoals,
  submitMyReviewCycleGoals,
  type EmployeeCycleGoalRow,
  type EmployeeMyCycleGoalsGroup,
  type Goal,
  type ReviewCycleKpiDefinition,
} from '../../../api/performanceLearningApi'
import styles from '../CompanyWorkspacePage.module.css'

type Draft = {
  target: string
  actual_achievement: string
}

/** Locked copy used for display and API submit (employees do not edit description). */
function goalDescriptionText(goal: Goal, kpi: ReviewCycleKpiDefinition): string {
  const g = (goal.description ?? '').trim()
  return g || kpi.goal_description.trim()
}

function goalToDraft(g: Goal): Draft {
  return {
    target: g.target ?? '',
    actual_achievement: g.actual_achievement ?? '',
  }
}

function getDraft(
  drafts: Record<string, Partial<Draft> | undefined>,
  goal: Goal,
): Draft {
  return { ...goalToDraft(goal), ...drafts[goal.id] }
}

function listTitle(goal: Goal, kpi: ReviewCycleKpiDefinition): string {
  const t = (goal.title || `${kpi.goal_key}: ${kpi.goal_description}`).trim()
  if (t.length <= 72) return t
  return `${t.slice(0, 69)}…`
}

function isRowFilled(row: EmployeeCycleGoalRow, drafts: Record<string, Partial<Draft> | undefined>): boolean {
  const d = getDraft(drafts, row.goal)
  return Boolean(d.target.trim() && d.actual_achievement.trim())
}

function draftsCompleteForCycle(g: EmployeeMyCycleGoalsGroup, drafts: Record<string, Partial<Draft> | undefined>): boolean {
  for (const row of g.rows) {
    if (!isRowFilled(row, drafts)) {
      return false
    }
  }
  return g.rows.length > 0
}

type ViewFilter = 'pending' | 'submitted'

export function EmployeeMyGoalsPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const entry = myCompanies.find((x) => x.company.id === companyId)
  const canUseMyGoals = entry?.membership.role === 'employee' || entry?.membership.role === 'hr_ops'

  const [groups, setGroups] = useState<EmployeeMyCycleGoalsGroup[]>([])
  const [drafts, setDrafts] = useState<Record<string, Partial<Draft>>>({})
  const [loading, setLoading] = useState(true)
  const [submittingCycleId, setSubmittingCycleId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [viewFilter, setViewFilter] = useState<ViewFilter>('pending')
  const [selectedCycleId, setSelectedCycleId] = useState('')
  const [activeGoalId, setActiveGoalId] = useState('')

  const refresh = useCallback(async () => {
    if (!companyId || !canUseMyGoals) return
    setLoading(true)
    setError(null)
    try {
      const data = await listMyReviewCycleGoals(companyId)
      setGroups(data)
      setDrafts({})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load goals')
    } finally {
      setLoading(false)
    }
  }, [companyId, canUseMyGoals])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const pendingGroups = useMemo(() => groups.filter((g) => !g.submitted_at), [groups])
  const submittedGroups = useMemo(() => groups.filter((g) => Boolean(g.submitted_at)), [groups])

  const filteredGroups = viewFilter === 'pending' ? pendingGroups : submittedGroups
  const isSubmittedView = viewFilter === 'submitted'

  const selectedGroup = useMemo(() => {
    if (filteredGroups.length === 0) return null
    const found = filteredGroups.find((g) => g.cycle.id === selectedCycleId)
    return found ?? filteredGroups[0]
  }, [filteredGroups, selectedCycleId])

  useEffect(() => {
    if (filteredGroups.length === 0) {
      setSelectedCycleId('')
      setActiveGoalId('')
      return
    }
    setSelectedCycleId((prev) => {
      if (prev && filteredGroups.some((g) => g.cycle.id === prev)) return prev
      return filteredGroups[0].cycle.id
    })
  }, [filteredGroups, viewFilter])

  useEffect(() => {
    if (!selectedGroup || selectedGroup.rows.length === 0) {
      setActiveGoalId('')
      return
    }
    setActiveGoalId((prev) => {
      if (prev && selectedGroup.rows.some((r) => r.goal.id === prev)) return prev
      return selectedGroup.rows[0].goal.id
    })
  }, [selectedGroup])

  const activeRow: EmployeeCycleGoalRow | null = useMemo(() => {
    if (!selectedGroup || !activeGoalId) return null
    return selectedGroup.rows.find((r) => r.goal.id === activeGoalId) ?? null
  }, [selectedGroup, activeGoalId])

  const filledCountForSelectedCycle = useMemo(() => {
    if (!selectedGroup || selectedGroup.rows.length === 0) return 0
    if (selectedGroup.submitted_at || isSubmittedView) {
      return selectedGroup.rows.length
    }
    return selectedGroup.rows.filter((row) => isRowFilled(row, drafts)).length
  }, [selectedGroup, drafts, isSubmittedView])

  const totalGoalsInCycle = selectedGroup?.rows.length ?? 0

  function setDraft(goalId: string, patch: Partial<Draft>) {
    setDrafts((d) => ({
      ...d,
      [goalId]: { ...d[goalId], ...patch },
    }))
  }

  async function submitCycle(g: EmployeeMyCycleGoalsGroup) {
    if (!companyId) return
    if (!draftsCompleteForCycle(g, drafts)) {
      const msg = 'Please fill in target and actual achievement for every goal in this cycle, then submit.'
      setError(msg)
      toast.error(msg)
      return
    }
    setSubmittingCycleId(g.cycle.id)
    setError(null)
    try {
      const payload = {
        goals: g.rows.map((row) => {
          const d = getDraft(drafts, row.goal)
          return {
            goal_id: row.goal.id,
            description: goalDescriptionText(row.goal, row.kpi_definition),
            target: d.target.trim(),
            actual_achievement: d.actual_achievement.trim(),
          }
        }),
      }
      const res = await submitMyReviewCycleGoals(companyId, g.cycle.id, payload)
      toast.success(res.message || 'Your response has been recorded.')
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Submit failed'
      setError(msg)
      if (msg.includes('already submitted')) {
        toast.info('You have already submitted your goals for this review cycle.')
        await refresh()
      } else {
        toast.error(msg)
      }
    } finally {
      setSubmittingCycleId(null)
    }
  }

  if (!entry) {
    return (
      <div className={styles.fallback}>
        <p>You do not have access to this company.</p>
      </div>
    )
  }

  if (!canUseMyGoals) {
    return <Navigate to={`/company/${companyId}`} replace />
  }

  const canSubmit = Boolean(
    selectedGroup && !selectedGroup.submitted_at && draftsCompleteForCycle(selectedGroup, drafts),
  )

  return (
    <section className={styles.card}>
        <h3 className={styles.h3}>My review goals</h3>
        <p className={styles.muted}>
          Use the filter to switch between cycles you still need to submit and cycles you have already submitted. Pick a
          goal on the left, then enter your <strong>target</strong> and <strong>actual achievement</strong> on the right.
          Goal wording comes from the review template and cannot be edited.
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}
        {loading ? <p className={styles.muted}>Loading…</p> : null}

        {!loading && groups.length === 0 ? (
          <p className={styles.muted}>
            No assigned goals yet. When HR creates a review cycle and sends you a notification, your goals will appear
            here.
          </p>
        ) : null}

        {!loading && groups.length > 0 ? (
          <>
            <div className={styles.inline} style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <span className={styles.muted} style={{ fontSize: '0.9rem' }}>
                Show:
              </span>
              <div className={styles.inline} style={{ gap: '0.35rem' }}>
                <button
                  type="button"
                  className={viewFilter === 'pending' ? styles.btnSm : styles.btnGhost}
                  onClick={() => setViewFilter('pending')}
                >
                  Not yet submitted ({pendingGroups.length})
                </button>
                <button
                  type="button"
                  className={viewFilter === 'submitted' ? styles.btnSm : styles.btnGhost}
                  onClick={() => setViewFilter('submitted')}
                >
                  Submitted ({submittedGroups.length})
                </button>
              </div>
            </div>

            {filteredGroups.length === 0 ? (
              <p className={styles.muted}>
                {viewFilter === 'pending'
                  ? 'You have no open review cycles left to submit.'
                  : 'You have not submitted goals for any cycle yet.'}
              </p>
            ) : null}

            {selectedGroup ? (
              <>
                <div className={styles.inline} style={{ marginBottom: '0.75rem' }}>
                  <label className={styles.labelBlock} style={{ marginBottom: 0, minWidth: 200 }}>
                    Review cycle
                    <select
                      className={styles.input}
                      value={selectedGroup.cycle.id}
                      onChange={(e) => setSelectedCycleId(e.target.value)}
                    >
                      {filteredGroups.map((g) => (
                        <option key={g.cycle.id} value={g.cycle.id}>
                          {g.cycle.name}
                          {g.submitted_at ? ' (submitted)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className={styles.muted} style={{ marginBottom: '0.75rem' }}>
                  {selectedGroup.cycle.type ? `${selectedGroup.cycle.type} · ` : ''}
                  {selectedGroup.cycle.goals_deadline ? `Deadline ${selectedGroup.cycle.goals_deadline}` : ''}
                  {totalGoalsInCycle > 0 ? (
                    <>
                      {' '}
                      · {filledCountForSelectedCycle}/{totalGoalsInCycle} goals complete
                    </>
                  ) : null}
                  {selectedGroup.submitted_at ? (
                    <>
                      {' '}
                      · Submitted{' '}
                      {new Date(selectedGroup.submitted_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </>
                  ) : null}
                </p>

                {selectedGroup.submitted_at ? (
                  <div className={styles.goalsSubmittedBanner} style={{ marginBottom: '1rem' }}>
                    <strong>Your response has been recorded for this cycle.</strong>
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>You can review your entries below; they are read-only.</p>
                  </div>
                ) : null}

                {activeRow ? (
                  <div className={styles.teamGoalsSplit}>
                    <div className={styles.teamGoalsMobilePicker}>
                      <label className={styles.labelBlock} style={{ marginBottom: 0 }}>
                        Goal
                        <select
                          className={styles.teamGoalsMobilePickerSelect}
                          value={activeGoalId}
                          onChange={(e) => setActiveGoalId(e.target.value)}
                          aria-label="Select goal"
                        >
                          {selectedGroup.rows.map((r) => {
                            const done =
                              Boolean(selectedGroup.submitted_at) ||
                              isSubmittedView ||
                              isRowFilled(r, drafts)
                            return (
                              <option key={r.goal.id} value={r.goal.id}>
                                {listTitle(r.goal, r.kpi_definition)}
                                {done ? ' ✓' : ''}
                              </option>
                            )
                          })}
                        </select>
                      </label>
                    </div>
                    <nav className={styles.teamGoalsList} aria-label="Goals in this cycle">
                      {selectedGroup.rows.map(({ kpi_definition: kpi, goal }) => {
                        const isActive = goal.id === activeGoalId
                        const row: EmployeeCycleGoalRow = { kpi_definition: kpi, goal }
                        const complete =
                          Boolean(selectedGroup.submitted_at) ||
                          isSubmittedView ||
                          isRowFilled(row, drafts)
                        return (
                          <button
                            key={goal.id}
                            type="button"
                            className={`${styles.teamGoalsListBtn} ${isActive ? styles.teamGoalsListBtnActive : ''} ${complete ? styles.teamGoalsListBtnComplete : ''}`}
                            onClick={() => setActiveGoalId(goal.id)}
                          >
                            {listTitle(goal, kpi)}
                            <span className={styles.teamGoalsListMeta}>
                              {complete ? 'Ready' : 'Needs target & achievement'}
                              {kpi.weight_percent != null ? ` · ${kpi.weight_percent}%` : ''}
                            </span>
                          </button>
                        )
                      })}
                    </nav>

                    <div className={styles.teamGoalsDetail}>
                      <GoalDetailPanel
                        row={activeRow}
                        draft={getDraft(drafts, activeRow.goal)}
                        readOnly={isSubmittedView || Boolean(selectedGroup.submitted_at)}
                        onChange={
                          isSubmittedView || selectedGroup.submitted_at
                            ? undefined
                            : (patch) => setDraft(activeRow.goal.id, patch)
                        }
                      />

                      {!selectedGroup.submitted_at && !isSubmittedView ? (
                        <div
                          className={styles.formActions}
                          style={{
                            marginTop: '1rem',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: '0.5rem',
                          }}
                        >
                          {!canSubmit ? (
                            <p className={styles.muted} style={{ margin: 0, fontSize: '0.85rem' }}>
                              Complete target and actual achievement for every goal ({filledCountForSelectedCycle}/
                              {totalGoalsInCycle} done), then submit.
                            </p>
                          ) : null}
                          <button
                            type="button"
                            className={styles.btnSm}
                            disabled={submittingCycleId === selectedGroup.cycle.id}
                            onClick={() => void submitCycle(selectedGroup)}
                          >
                            {submittingCycleId === selectedGroup.cycle.id ? 'Submitting…' : 'Submit my goals'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
    </section>
  )
}

type GoalDetailPanelProps = {
  row: EmployeeCycleGoalRow
  draft: Draft
  readOnly: boolean
  onChange?: (patch: Partial<Draft>) => void
}

function GoalDetailPanel({ row, draft, readOnly, onChange }: GoalDetailPanelProps) {
  const { kpi_definition: kpi, goal } = row
  const descText = goalDescriptionText(goal, kpi)

  return (
    <div className={styles.teamGoalsDetailCard}>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
        {kpi.goal_key}
        {kpi.category ? ` · ${kpi.category}` : ''}
        {kpi.weight_percent != null ? ` · ${kpi.weight_percent}% weight` : ''}
      </div>
      <h4 className={styles.h4} style={{ marginTop: 0 }}>
        {goal.title || `${kpi.goal_key}`}
      </h4>
      <label className={styles.labelBlock}>
        Goal wording (read-only)
        <div className={styles.goalsReadOnlyBlock}>
          <textarea className={styles.input} style={{ minHeight: 88 }} readOnly value={descText} />
        </div>
      </label>
      <label className={styles.labelBlock}>
        Target
        <input
          className={styles.input}
          readOnly={readOnly}
          value={draft.target}
          onChange={onChange ? (e) => onChange({ target: e.target.value }) : undefined}
        />
      </label>
      <label className={styles.labelBlock}>
        Actual achievement
        <textarea
          className={styles.input}
          style={{ minHeight: 88 }}
          readOnly={readOnly}
          value={draft.actual_achievement}
          onChange={onChange ? (e) => onChange({ actual_achievement: e.target.value }) : undefined}
        />
      </label>
    </div>
  )
}
