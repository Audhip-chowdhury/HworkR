import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listGoalCycleTracking,
  type GoalCycleEmployeeTracking,
  type GoalCycleTracking,
  type ReviewCycle,
} from '../../../api/performanceLearningApi'
import shell from '../CompanyWorkspacePage.module.css'
import styles from './GoalCycleHrTracking.module.css'

type GoalsSubmittedFilter = 'all' | 'yes' | 'no'
type ManagerFilter = 'all' | GoalCycleEmployeeTracking['manager_review_status']
type PeerFilter = 'all' | 'no_nominations' | 'none_received' | 'partial' | 'complete'

const MANAGER_STATUS_HELP: Record<string, string> = {
  no_kpis: 'No KPI template for this cycle',
  awaiting_goals: 'Employee has not submitted goals yet',
  pending_review: 'Goals submitted — manager has not rated KPI rows',
  partial: 'Some KPI rows rated, not all',
  complete: 'All KPI rows have a manager rating',
}

function managerStatusLabel(s: string): string {
  switch (s) {
    case 'no_kpis':
      return 'No KPIs'
    case 'awaiting_goals':
      return 'Awaiting goals'
    case 'pending_review':
      return 'Pending review'
    case 'partial':
      return 'Partial review'
    case 'complete':
      return 'Review complete'
    default:
      return s
  }
}

function managerBadgeClass(s: string): string {
  switch (s) {
    case 'complete':
      return styles.badgeSuccess
    case 'partial':
    case 'pending_review':
      return styles.badgeWarn
    case 'awaiting_goals':
      return styles.badgeInfo
    case 'no_kpis':
      return styles.badgeMuted
    default:
      return styles.badgeNeutral
  }
}

function peerBucket(row: GoalCycleEmployeeTracking): PeerFilter {
  const n = row.nominated_peer_count
  const r = row.peer_reviews_received_count
  if (n === 0) return 'no_nominations'
  if (r === 0) return 'none_received'
  if (r >= n) return 'complete'
  return 'partial'
}

const DONUT_R = 9
const DONUT_C = 2 * Math.PI * DONUT_R

function MiniDonut({
  pct,
  label,
  hint,
  stroke,
}: {
  pct: number | null
  label: string
  hint?: string
  stroke: string
}) {
  const has = pct != null && !Number.isNaN(pct)
  const p = has ? Math.min(100, Math.max(0, pct)) : 0
  const dash = has ? (p / 100) * DONUT_C : 0
  const title = hint ?? (has ? `${Math.round(p)}%` : undefined)
  return (
    <div className={styles.miniDonut} title={title}>
      <svg className={styles.miniDonutSvg} width={28} height={28} viewBox="0 0 28 28" aria-hidden>
        <circle cx={14} cy={14} r={DONUT_R} fill="none" stroke="var(--border)" strokeWidth={3.25} />
        {has && p > 0 ? (
          <circle
            cx={14}
            cy={14}
            r={DONUT_R}
            fill="none"
            stroke={stroke}
            strokeWidth={3.25}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${DONUT_C}`}
            transform="rotate(-90 14 14)"
          />
        ) : null}
      </svg>
      <div className={styles.miniDonutText}>
        <span className={styles.miniDonutPct}>{has ? `${Math.round(p)}%` : '—'}</span>
        <span className={styles.miniDonutLab}>{label}</span>
        {hint ? <span className={styles.miniDonutHint}>{hint}</span> : null}
      </div>
    </div>
  )
}

type GoalCycleHrTrackingProps = {
  companyId: string
  cycles: ReviewCycle[]
  parentLoading: boolean
}

export function GoalCycleHrTracking({ companyId, cycles, parentLoading }: GoalCycleHrTrackingProps) {
  const [cycleId, setCycleId] = useState('')
  const [data, setData] = useState<GoalCycleTracking | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [goalsFilter, setGoalsFilter] = useState<GoalsSubmittedFilter>('all')
  const [managerFilter, setManagerFilter] = useState<ManagerFilter>('all')
  const [peerFilter, setPeerFilter] = useState<PeerFilter>('all')

  useEffect(() => {
    if (cycles.length === 0) {
      setCycleId('')
      return
    }
    setCycleId((prev) => (prev && cycles.some((c) => c.id === prev) ? prev : cycles[0].id))
  }, [cycles])

  const load = useCallback(async () => {
    if (!companyId || !cycleId) return
    setLoading(true)
    setError(null)
    try {
      const t = await listGoalCycleTracking(companyId, cycleId)
      setData(t)
    } catch (e) {
      setData(null)
      setError(e instanceof Error ? e.message : 'Failed to load tracking')
    } finally {
      setLoading(false)
    }
  }, [companyId, cycleId])

  useEffect(() => {
    void load()
  }, [load])

  const rows = data?.rows ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (q) {
        const blob = `${r.employee_display_name} ${r.employee_display_email} ${r.employee_code} ${r.manager_display_name ?? ''}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      if (goalsFilter === 'yes' && !r.goals_submitted) return false
      if (goalsFilter === 'no' && r.goals_submitted) return false
      if (managerFilter !== 'all' && r.manager_review_status !== managerFilter) return false
      if (peerFilter !== 'all' && peerBucket(r) !== peerFilter) return false
      return true
    })
  }, [rows, search, goalsFilter, managerFilter, peerFilter])

  const stats = useMemo(() => {
    const total = rows.length
    const submitted = rows.filter((r) => r.goals_submitted).length
    const mgrDone = rows.filter((r) => r.manager_review_status === 'complete').length
    const peersDone = rows.filter((r) => r.nominated_peer_count > 0 && r.peer_reviews_received_count >= r.nominated_peer_count).length
    return { total, submitted, mgrDone, peersDone }
  }, [rows])

  /** Pulse metrics aligned with design doc; derived from this cycle’s tracking rows. */
  const activityPulse = useMemo(() => {
    const cycle = data?.review_cycle
    const r = rows
    if (!cycle || r.length === 0) {
      return {
        completionPct: null as number | null,
        onTimePct: null as number | null,
        feedbackQualityPct: null as number | null,
        calibrationPct: null as number | null,
      }
    }
    const withKpi = r.filter((x) => x.kpi_goal_count > 0)
    const denom = withKpi.length > 0 ? withKpi.length : r.length
    const completeCount =
      withKpi.length > 0
        ? withKpi.filter((x) => x.manager_review_status === 'complete').length
        : r.filter((x) => x.goals_submitted).length
    const completionPct = denom > 0 ? (completeCount / denom) * 100 : null

    const deadline = cycle.goals_deadline?.trim().slice(0, 10)
    const submittedRows = r.filter((x) => x.goals_submitted && x.goals_submitted_at)
    let onTimePct: number | null = null
    if (deadline && submittedRows.length > 0) {
      let onTime = 0
      for (const row of submittedRows) {
        const subDay = row.goals_submitted_at!.slice(0, 10)
        if (subDay <= deadline) onTime++
      }
      onTimePct = (onTime / submittedRows.length) * 100
    }

    const nomSlots = r.reduce((s, x) => s + x.nominated_peer_count, 0)
    const rec = r.reduce((s, x) => s + x.peer_reviews_received_count, 0)
    const feedbackQualityPct = nomSlots > 0 ? Math.min(100, (rec / nomSlots) * 100) : null

    return {
      completionPct,
      onTimePct,
      feedbackQualityPct,
      calibrationPct: null as number | null,
    }
  }, [data, rows])

  const selectedCycle = cycles.find((c) => c.id === cycleId)

  const busy = parentLoading || loading

  return (
    <div>
      <p className={`${shell.muted} ${styles.trackIntro}`}>
        Track each employee in the goals program for a review cycle: goal submission, manager ratings on KPI goals
        (1–5), nominated peers, and completed peer reviews. Use filters to focus on who still needs action.
      </p>

      {cycleId && !error ? (
        <div className={styles.activityPulse} aria-label="Activity tracked for this review cycle">
          <p className={styles.activityPulseTitle}>Activity tracked · this cycle</p>
          {busy && !data ? (
            <span className={shell.muted} style={{ fontSize: '0.75rem' }}>
              Loading indicators…
            </span>
          ) : (
            <>
              <MiniDonut
                pct={activityPulse.completionPct}
                label="Completion"
                hint="Mgr review done vs team"
                stroke="#16a34a"
              />
              <MiniDonut
                pct={activityPulse.onTimePct}
                label="On-time"
                hint={data?.review_cycle.goals_deadline ? 'Goals by deadline' : 'Set cycle deadline'}
                stroke="#2563eb"
              />
              <MiniDonut
                pct={activityPulse.feedbackQualityPct}
                label="Feedback"
                hint="Peer slots filled"
                stroke="#ca8a04"
              />
              <MiniDonut
                pct={activityPulse.calibrationPct}
                label="Calibration"
                hint="Not in app yet"
                stroke="#64748b"
              />
            </>
          )}
        </div>
      ) : null}

      <div className={styles.toolbar}>
        <div className={styles.toolbarFieldWide}>
          <span className={styles.toolbarLabel}>Review cycle</span>
          <select
            className={shell.input}
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            disabled={cycles.length === 0}
            aria-label="Review cycle"
          >
            {cycles.length === 0 ? <option value="">No cycles yet</option> : null}
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.goals_deadline ? ` · deadline ${c.goals_deadline}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.toolbarFieldWide}>
          <span className={styles.toolbarLabel}>Search</span>
          <input
            className={shell.input}
            type="search"
            placeholder="Name, email, code, or manager"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Filter table by text"
          />
        </div>
        <div className={styles.toolbarField}>
          <span className={styles.toolbarLabel}>Goals submitted</span>
          <select
            className={shell.input}
            value={goalsFilter}
            onChange={(e) => setGoalsFilter(e.target.value as GoalsSubmittedFilter)}
          >
            <option value="all">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div className={styles.toolbarField}>
          <span className={styles.toolbarLabel}>Manager review</span>
          <select
            className={shell.input}
            value={managerFilter}
            onChange={(e) => setManagerFilter(e.target.value as ManagerFilter)}
          >
            <option value="all">All statuses</option>
            <option value="awaiting_goals">Awaiting goals</option>
            <option value="pending_review">Pending review</option>
            <option value="partial">Partial review</option>
            <option value="complete">Review complete</option>
            <option value="no_kpis">No KPIs</option>
          </select>
        </div>
        <div className={styles.toolbarField}>
          <span className={styles.toolbarLabel}>Peer reviews</span>
          <select
            className={shell.input}
            value={peerFilter}
            onChange={(e) => setPeerFilter(e.target.value as PeerFilter)}
          >
            <option value="all">All</option>
            <option value="no_nominations">No nominations</option>
            <option value="none_received">Nominations, none received</option>
            <option value="partial">Partially received</option>
            <option value="complete">All nominated done</option>
          </select>
        </div>
        <div className={styles.toolbarField}>
          <span className={styles.toolbarLabel}>&nbsp;</span>
          <button type="button" className={shell.btnSm} disabled={busy || !cycleId} onClick={() => void load()}>
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error ? <p className={shell.error}>{error}</p> : null}

      {cycles.length === 0 && !parentLoading ? (
        <div className={styles.emptyState}>Create a review cycle first (Review cycles tab), then return here to track progress.</div>
      ) : null}

      {selectedCycle?.goals_deadline ? (
        <p className={styles.filterMeta}>
          Cycle goals deadline: <strong>{selectedCycle.goals_deadline}</strong>
          {selectedCycle.status ? ` · status: ${selectedCycle.status}` : null}
        </p>
      ) : null}

      {!error && cycleId && data ? (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{stats.total}</div>
              <div className={styles.statLabel}>Employees in scope</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>
                {stats.submitted}
                <span className={shell.muted} style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                  {' '}
                  / {stats.total}
                </span>
              </div>
              <div className={styles.statLabel}>Submitted goals</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>
                {stats.mgrDone}
                <span className={shell.muted} style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                  {' '}
                  / {stats.total}
                </span>
              </div>
              <div className={styles.statLabel}>Manager review complete</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue}>{stats.peersDone}</div>
              <div className={styles.statLabel}>All peer reviews in (where peers were nominated)</div>
            </div>
          </div>

          <p className={styles.filterMeta}>
            Showing <strong>{filtered.length}</strong> of <strong>{rows.length}</strong> rows
            {search.trim() ? ' (text filter applied)' : ''}
          </p>

          {rows.length === 0 && !busy ? (
            <div className={styles.emptyState}>
              No active employees with a manager and linked account, or data is still loading.
            </div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Manager</th>
                    <th>Goals</th>
                    <th>Manager review</th>
                    <th>Avg rating</th>
                    <th>Peer reviews</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.employee_id}>
                      <td className={styles.nameCell}>
                        <strong>{r.employee_display_name}</strong>
                        <span>{r.employee_display_email}</span>
                        <div className={styles.codeMuted}>{r.employee_code}</div>
                      </td>
                      <td>{r.manager_display_name ?? '—'}</td>
                      <td>
                        {r.goals_submitted ? (
                          <span className={styles.badgeSuccess}>Submitted</span>
                        ) : (
                          <span className={styles.badgeWarn}>Not submitted</span>
                        )}
                        {r.goals_submitted_at ? (
                          <div className={styles.peerNames}>
                            {new Date(r.goals_submitted_at).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className={managerBadgeClass(r.manager_review_status)} title={MANAGER_STATUS_HELP[r.manager_review_status] ?? ''}>
                          {managerStatusLabel(r.manager_review_status)}
                        </span>
                        {r.kpi_goal_count > 0 ? (
                          <div className={styles.peerNames}>
                            {r.manager_rated_goal_count} / {r.kpi_goal_count} KPI rows rated
                          </div>
                        ) : (
                          <div className={styles.peerNames}>No KPI template</div>
                        )}
                      </td>
                      <td>
                        {r.avg_manager_rating != null ? (
                          <span className={styles.peerSummary} title="Average of manager ratings on KPI goals (1–5)">
                            {r.avg_manager_rating}
                          </span>
                        ) : (
                          <span className={shell.muted}>—</span>
                        )}
                      </td>
                      <td>
                        {r.nominated_peer_count > 0 ? (
                          <>
                            <span className={styles.peerSummary} title="Received / nominated peer written reviews">
                              {r.peer_reviews_received_count} / {r.nominated_peer_count}
                            </span>
                            {r.peer_reviewer_display_names.length > 0 ? (
                              <div className={styles.peerNames} title={r.peer_reviewer_display_names.join(', ')}>
                                Done: {r.peer_reviewer_display_names.join(', ')}
                              </div>
                            ) : (
                              <div className={styles.peerNames}>No peer feedback filed yet</div>
                            )}
                          </>
                        ) : (
                          <span className={shell.muted}>No nominations</span>
                        )}
                        {r.nominated_peer_display_names.length > 0 ? (
                          <div className={styles.peerNames} title={r.nominated_peer_display_names.join(', ')}>
                            Asked: {r.nominated_peer_display_names.join(', ')}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <Link className={styles.profileLink} to={`/company/${companyId}/employees/${r.employee_id}`}>
                          Profile
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
