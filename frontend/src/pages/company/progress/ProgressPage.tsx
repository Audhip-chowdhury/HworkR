import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getMyProgressDashboard } from '../../../api/certificationApi'
import type { CertificationProgressDashboard } from '../../../api/types'
import styles from '../CompanyWorkspacePage.module.css'

function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}%`
}

export function ProgressPage() {
  const { companyId = '' } = useParams()
  const [data, setData] = useState<CertificationProgressDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    void getMyProgressDashboard(companyId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load progress'))
      .finally(() => setLoading(false))
  }, [companyId])

  const progressPct = useMemo(() => {
    if (!data || data.required_actions_total <= 0) return 0
    return Math.round((data.required_actions_completed / data.required_actions_total) * 100)
  }, [data])

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>My progress dashboard</h3>
        <p className={styles.hint}>
          Tracks Employee, Audit, and Leave actions. Composite score is based on logged quality factors.
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}
        {loading ? <p className={styles.muted}>Loading…</p> : null}

        {!loading && data ? (
          <>
            <div className={styles.inline} style={{ gap: '1.25rem', alignItems: 'flex-start' }}>
              <div>
                <div className={styles.muted}>Overall score</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>
                  {data.overall_score == null ? '—' : `${Math.round(data.overall_score)}/100`}
                </div>
              </div>
              <div>
                <div className={styles.muted}>Status</div>
                <div style={{ fontWeight: 600 }}>{data.status.replaceAll('_', ' ')}</div>
              </div>
              <div>
                <div className={styles.muted}>Actions scored</div>
                <div style={{ fontWeight: 600 }}>{data.action_count}</div>
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <div className={styles.muted}>
                Required actions: {data.required_actions_completed}/{data.required_actions_total}
              </div>
              <div
                style={{
                  marginTop: '0.35rem',
                  height: '10px',
                  borderRadius: '999px',
                  background: 'var(--border)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progressPct}%`,
                    height: '100%',
                    background: 'var(--color-primary)',
                  }}
                />
              </div>
            </div>
          </>
        ) : null}
      </section>

      {!loading && data ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Dimension scores</h3>
          <div className={styles.inline} style={{ gap: '1rem 1.5rem' }}>
            <div><strong>Completeness:</strong> {pct(data.dimension_averages.completeness)}</div>
            <div><strong>Accuracy:</strong> {pct(data.dimension_averages.accuracy)}</div>
            <div><strong>Timeliness:</strong> {pct(data.dimension_averages.timeliness)}</div>
            <div><strong>Process adherence:</strong> {pct(data.dimension_averages.process_adherence)}</div>
          </div>
        </section>
      ) : null}

      {!loading && data ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Module breakdown</h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Module</th>
                  <th>Actions</th>
                  <th>Average score</th>
                </tr>
              </thead>
              <tbody>
                {data.module_breakdown.map((m) => (
                  <tr key={m.module}>
                    <td>{m.label}</td>
                    <td>{m.action_count}</td>
                    <td>{m.avg_score == null ? '—' : `${Math.round(m.avg_score)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!loading && data ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Gaps and recent actions</h3>
          {data.critical_failure_count > 0 ? (
            <p className={styles.error}>Critical failures on record: {data.critical_failure_count}</p>
          ) : null}
          <div className={styles.inline} style={{ alignItems: 'flex-start' }}>
            <div style={{ minWidth: '260px' }}>
              <h4 className={styles.h4}>Missing required actions</h4>
              {data.missing_required_actions.length === 0 ? (
                <p className={styles.muted}>No missing required actions.</p>
              ) : (
                <ul className={styles.ul}>
                  {data.missing_required_actions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
            <div style={{ flex: 1, minWidth: '300px' }}>
              <h4 className={styles.h4}>Recent actions</h4>
              <ul className={styles.ul}>
                {data.recent_actions.map((a) => (
                  <li key={a.id}>
                    <strong>{a.module}</strong> · {a.action_type}
                    {a.action_detail ? ` (${a.action_detail})` : ''} —{' '}
                    {a.score == null ? 'unscored' : `${Math.round(a.score)}%`}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}
