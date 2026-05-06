import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  createPip,
  listPipAtRiskEmployees,
  type Pip,
  type PipAtRiskEmployee,
  type ReviewCycle,
} from '../../../api/performanceLearningApi'
import shell from '../CompanyWorkspacePage.module.css'

type PipsHrPanelProps = {
  companyId: string
  cycles: ReviewCycle[]
  pips: Pip[]
  onRefresh: () => void
}

export function PipsHrPanel({ companyId, cycles, pips, onRefresh }: PipsHrPanelProps) {
  const [cycleId, setCycleId] = useState('')
  const [ratingBelow, setRatingBelow] = useState(3)
  const [atRisk, setAtRisk] = useState<PipAtRiskEmployee[]>([])
  const [loading, setLoading] = useState(false)
  const [placingId, setPlacingId] = useState<string | null>(null)

  useEffect(() => {
    if (cycles.length === 0) {
      setCycleId('')
      return
    }
    setCycleId((prev) => (prev && cycles.some((c) => c.id === prev) ? prev : cycles[0].id))
  }, [cycles])

  const loadAtRisk = useCallback(async () => {
    if (!companyId || !cycleId) {
      setAtRisk([])
      return
    }
    setLoading(true)
    try {
      const rows = await listPipAtRiskEmployees(companyId, {
        review_cycle_id: cycleId,
        rating_below: ratingBelow,
      })
      setAtRisk(rows)
    } catch (e) {
      setAtRisk([])
      toast.error(e instanceof Error ? e.message : 'Failed to load at-risk list')
    } finally {
      setLoading(false)
    }
  }, [companyId, cycleId, ratingBelow])

  useEffect(() => {
    void loadAtRisk()
  }, [loadAtRisk])

  async function placeInPip(row: PipAtRiskEmployee) {
    if (!companyId) return
    setPlacingId(row.employee_id)
    try {
      await createPip(companyId, {
        employee_id: row.employee_id,
        reason: `Manager KPI goal ratings averaged ${row.avg_manager_rating} (below ${ratingBelow}) for the selected review cycle.`,
        notify_employee: true,
      })
      toast.success('PIP created and employee was notified.')
      await loadAtRisk()
      onRefresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create PIP')
    } finally {
      setPlacingId(null)
    }
  }

  return (
    <div>
      <p className={shell.muted} style={{ marginBottom: '1rem', maxWidth: '48rem' }}>
        Employees whose <strong>average manager rating</strong> on KPI goals for the selected cycle is{' '}
        <strong>strictly below</strong> your threshold are listed here. Use <strong>Place in PIP</strong> to open a PIP
        and send them an in-app notice.
      </p>

      <div className={shell.inline} style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <label className={shell.labelBlock} style={{ marginBottom: 0, minWidth: '12rem' }}>
          Review cycle (ratings context)
          <select className={shell.input} value={cycleId} onChange={(e) => setCycleId(e.target.value)} disabled={!cycles.length}>
            {!cycles.length ? <option value="">No cycles</option> : null}
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={shell.labelBlock} style={{ marginBottom: 0, width: '8rem' }}>
          Below rating
          <input
            className={shell.input}
            type="number"
            min={0.01}
            step={0.1}
            value={ratingBelow}
            onChange={(e) => setRatingBelow(Number(e.target.value) || 3)}
            title="Include employees whose average manager KPI rating is strictly below this value"
          />
        </label>
        <div style={{ alignSelf: 'flex-end' }}>
          <button type="button" className={shell.btnSm} disabled={loading || !cycleId} onClick={() => void loadAtRisk()}>
            {loading ? 'Loading…' : 'Refresh list'}
          </button>
        </div>
      </div>

      <h4 className={shell.h4} style={{ marginBottom: '0.5rem' }}>
        At-risk employees
      </h4>
      {!cycleId ? (
        <p className={shell.muted}>Create a review cycle first.</p>
      ) : loading ? (
        <p className={shell.muted}>Loading…</p>
      ) : atRisk.length === 0 ? (
        <p className={shell.muted}>No employees match this threshold and cycle (with at least one manager-rated KPI goal). Active PIPs are excluded.</p>
      ) : (
        <div className={shell.tableWrap} style={{ marginBottom: '1.75rem' }}>
          <table className={shell.table}>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Avg rating</th>
                <th>Rated goals</th>
                <th style={{ width: 140 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {atRisk.map((r) => (
                <tr key={r.employee_id}>
                  <td>
                    <strong>{r.employee_display_name}</strong>
                    <div className={shell.muted} style={{ fontSize: '0.85rem' }}>
                      {r.employee_display_email}
                    </div>
                    <div className={shell.muted} style={{ fontSize: '0.78rem' }}>
                      {r.employee_code}
                    </div>
                  </td>
                  <td>{r.avg_manager_rating}</td>
                  <td>{r.manager_rated_goal_count}</td>
                  <td>
                    <button
                      type="button"
                      className={shell.btnSm}
                      disabled={Boolean(placingId)}
                      onClick={() => void placeInPip(r)}
                    >
                      {placingId === r.employee_id ? 'Placing…' : 'Place in PIP'}
                    </button>
                    <div style={{ marginTop: '0.35rem' }}>
                      <Link
                        to={`/company/${companyId}/employees/${r.employee_id}`}
                        style={{ fontSize: '0.8rem', color: 'var(--color-primary)' }}
                      >
                        Profile
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4 className={shell.h4} style={{ marginBottom: '0.5rem' }}>
        Active &amp; recent PIPs
      </h4>
      {pips.length === 0 ? (
        <p className={shell.muted}>No PIPs recorded yet.</p>
      ) : (
        <div className={shell.tableWrap}>
          <table className={shell.table}>
            <thead>
              <tr>
                <th>Employee id</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {pips.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/company/${companyId}/employees/${p.employee_id}`} style={{ color: 'var(--color-primary)' }}>
                      {p.employee_id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td>{p.status}</td>
                  <td>{p.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
