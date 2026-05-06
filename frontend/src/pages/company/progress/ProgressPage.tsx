import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getMyProgressDashboard } from '../../../api/certificationApi'
import type { CertificationProgressDashboard } from '../../../api/types'
import baseStyles from '../CompanyWorkspacePage.module.css'
import styles from './ProgressPage.module.css'

function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}%`
}

function dimWidth(v: number | null): string {
  if (v == null || Number.isNaN(v)) return '0%'
  return `${Math.max(0, Math.min(100, v))}%`
}

function statusPillClass(status: string): string {
  if (status === 'failed') return `${styles.statusPill} ${styles.statusPillBad}`
  if (status === 'eligible_for_assessment') return `${styles.statusPill} ${styles.statusPillWarn}`
  if (status === 'not_started') return styles.statusPill
  return styles.statusPill
}

export function ProgressPage() {
  const { companyId = '' } = useParams()
  const [data, setData] = useState<CertificationProgressDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!companyId) return Promise.resolve()
    setLoading(true)
    setError(null)
    return getMyProgressDashboard(companyId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load progress'))
      .finally(() => setLoading(false))
  }, [companyId])

  useEffect(() => {
    void load()
  }, [load])

  const progressPct = useMemo(() => {
    if (!data || data.required_actions_total <= 0) return 0
    return Math.round((data.required_actions_completed / data.required_actions_total) * 100)
  }, [data])

  const dims = useMemo(() => {
    if (!data) return []
    return [
      { key: 'completeness', label: 'Completeness', v: data.dimension_averages.completeness },
      { key: 'accuracy', label: 'Accuracy', v: data.dimension_averages.accuracy },
      { key: 'timeliness', label: 'Timeliness', v: data.dimension_averages.timeliness },
      { key: 'process_adherence', label: 'Process adherence', v: data.dimension_averages.process_adherence },
    ] as const
  }, [data])

  return (
    <div className={baseStyles.org}>
      <div className={styles.page}>
        <header className={styles.hero}>
          <h1 className={styles.title}>Progress and quality</h1>
          <p className={styles.subtitle}>
            Your certification readiness and average quality scores from HR actions logged for this
            company.
          </p>

          <div className={styles.explain} role="note">
            <strong>You do not need to define SLAs first.</strong> Each scored action already carries four
            numbers (0–100): <strong>completeness</strong>, <strong>accuracy</strong>,{' '}
            <strong>timeliness</strong>, and <strong>process adherence</strong>. The app fills them using
            rules (for example: missing fields, pay vs band, policy timing) and sensible defaults.
            <ul>
              <li>
                <strong>Timeliness</strong> for some actions also uses <em>built-in</em> target times (for
                example leave approval within a day). Those live in server config, not on this screen.
              </li>
              <li>
                Optional <strong>company scoring rules</strong> (custom SLAs and weights) live under{' '}
                <Link to="../tracking">Tracking and scoring</Link> for admins — they refine timeliness
                further when you add them.
              </li>
            </ul>
          </div>

          <p className={styles.quickLinks}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Try actions →</span>
            <Link to="../recruitment">Recruitment</Link>
            <span style={{ color: 'var(--border)' }}>|</span>
            <Link to="../learning/assignments">Training</Link>
            <span style={{ color: 'var(--border)' }}>|</span>
            <Link to="../employees">Employees</Link>
            <span style={{ color: 'var(--border)' }}>|</span>
            <Link to="../leave/requests">Leave</Link>
            <span style={{ color: 'var(--border)' }}>|</span>
            <Link to="../audits/policies">Policies</Link>
            <span style={{ color: 'var(--border)' }}>|</span>
            <Link to="../tracking">Scoring rules</Link>
            <span style={{ color: 'var(--border)' }}>|</span>
            <Link to="../certification">Certificates</Link>
          </p>

          {error ? <p className={styles.error}>{error}</p> : null}
          {loading ? (
            <div className={styles.loading}>
              <span className={styles.spinner} aria-hidden />
              Loading your dashboard…
            </div>
          ) : null}

          {!loading && data ? (
            <>
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Overall quality</div>
                  <div className={styles.statValue}>
                    {data.overall_score == null ? '—' : `${Math.round(data.overall_score)}`}
                    {data.overall_score != null ? (
                      <span style={{ fontSize: '0.95rem', fontWeight: 600, opacity: 0.75 }}>/100</span>
                    ) : null}
                  </div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Certification status</div>
                  <div className={styles.statValueMuted}>
                    <span className={statusPillClass(data.status)}>
                      {data.status.replaceAll('_', ' ')}
                    </span>
                  </div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statLabel}>Actions scored</div>
                  <div className={styles.statValue}>{data.action_count}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    Logged activity with quality factors
                  </div>
                </div>
              </div>

              <div className={styles.requiredBlock}>
                <div className={styles.requiredLabel}>
                  Core required actions for “eligible for assessment” (
                  {data.required_actions_completed}/{data.required_actions_total})
                </div>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
                </div>
              </div>

              <button type="button" className={styles.refreshBtn} onClick={() => void load()}>
                Refresh data
              </button>
            </>
          ) : null}
        </header>

        {!loading && data ? (
          <section className={styles.section} aria-labelledby="dims-heading">
            <h2 id="dims-heading" className={styles.sectionTitle}>
              Quality dimensions
            </h2>
            <p className={baseStyles.hint} style={{ marginTop: '-0.35rem', marginBottom: '1rem' }}>
              Averages across your scored actions. Bars reflect the same 0–100 scale.
            </p>
            <div className={styles.dimGrid}>
              {dims.map((d) => (
                <div key={d.key} className={styles.dimCard}>
                  <div className={styles.dimName}>{d.label}</div>
                  <div className={styles.dimValue}>{pct(d.v)}</div>
                  <div className={styles.dimBar}>
                    <div className={styles.dimBarFill} style={{ width: dimWidth(d.v) }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && data ? (
          <section className={styles.section} aria-labelledby="modules-heading">
            <h2 id="modules-heading" className={styles.sectionTitle}>
              By module
            </h2>
            <p className={baseStyles.hint} style={{ marginTop: '-0.35rem', marginBottom: '1rem' }}>
              Rows appear for every tracked area; counts stay at zero until you perform work in that
              module.
            </p>
            <div className={styles.modulesGrid}>
              {data.module_breakdown.map((m) => (
                <div key={m.module} className={styles.moduleCard}>
                  <div className={styles.moduleName}>{m.label}</div>
                  <div className={styles.moduleMeta}>
                    <span>{m.action_count} action{m.action_count === 1 ? '' : 's'}</span>
                    <span className={styles.moduleScore}>
                      {m.avg_score == null ? '—' : `${Math.round(m.avg_score)}`}
                      {m.avg_score != null ? <span style={{ fontWeight: 600, opacity: 0.65 }}>/100</span> : null}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!loading && data ? (
          <section className={styles.section} aria-labelledby="gaps-heading">
            <h2 id="gaps-heading" className={styles.sectionTitle}>
              Gaps and recent activity
            </h2>
            {data.critical_failure_count > 0 ? (
              <p className={baseStyles.error} style={{ marginBottom: '1rem' }}>
                Critical failures on record: {data.critical_failure_count}
              </p>
            ) : null}
            <div className={styles.twoCol}>
              <div>
                <h3 className={styles.subheading}>Missing required actions</h3>
                {data.missing_required_actions.length === 0 ? (
                  <p className={baseStyles.muted}>All required action types are present in your history.</p>
                ) : (
                  <ul className={styles.missingList}>
                    {data.missing_required_actions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className={styles.subheading}>Recent scored actions</h3>
                {data.recent_actions.length === 0 ? (
                  <p className={baseStyles.muted}>No recent activity yet. Use the links above to generate some.</p>
                ) : (
                  <ul className={styles.feedList}>
                    {data.recent_actions.map((a) => (
                      <li key={a.id}>
                        <span className={styles.feedModule}>{a.module}</span>
                        {' · '}
                        {a.action_type}
                        {a.action_detail ? ` (${a.action_detail})` : ''}
                        {' — '}
                        <span className={styles.feedScore}>
                          {a.score == null ? 'unscored' : `${Math.round(a.score)}%`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
