import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getAnalyticsDashboard, type AnalyticsDashboard } from '../../../api/analyticsApi'
import { downloadExport } from '../../../api/exportsApi'
import styles from '../CompanyWorkspacePage.module.css'

export function AnalyticsPage() {
  const { companyId = '' } = useParams()
  const [data, setData] = useState<AnalyticsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    void getAnalyticsDashboard(companyId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [companyId])

  return (
    <div className={styles.orgLayout}>
      <div className={styles.orgMain}>
        {error ? <p className={styles.error}>{error}</p> : null}
        <section className={styles.card}>
          <h3 className={styles.h3}>Analytics overview</h3>
          {loading ? <p className={styles.muted}>Loading analytics…</p> : null}
          {data ? (
            <div className={styles.statGrid}>
              <div className={styles.statCard}><p className={styles.statNumber}>{data.headcount.total}</p><p className={styles.statLabel}>Total headcount</p></div>
              <div className={styles.statCard}><p className={styles.statNumber}>{data.headcount.active}</p><p className={styles.statLabel}>Active headcount</p></div>
              <div className={styles.statCard}><p className={styles.statNumber}>{data.recruitment.open_postings}</p><p className={styles.statLabel}>Open postings</p></div>
              <div className={styles.statCard}><p className={styles.statNumber}>{data.recruitment.applications}</p><p className={styles.statLabel}>Applications</p></div>
              <div className={styles.statCard}><p className={styles.statNumber}>{data.leave.pending_requests}</p><p className={styles.statLabel}>Pending leave requests</p></div>
              <div className={styles.statCard}><p className={styles.statNumber}>{data.learning.completion_rate_percent ?? 0}%</p><p className={styles.statLabel}>Training completion</p><div className={styles.progressWrap}><div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${data.learning.completion_rate_percent ?? 0}%` }} /></div></div></div>
            </div>
          ) : null}
          <button className={styles.btnSm} onClick={() => void downloadExport(companyId, '/analytics/export/employees.csv', 'employees.csv')}>Download employees CSV</button>
        </section>
      </div>
      <aside className={styles.orgAside}>
        <section className={styles.card}>
          <h3 className={styles.h3}>Headcount by department</h3>
          {data?.headcount.by_department?.length ? data.headcount.by_department.map((d) => <p key={d.department_id || d.department} className={styles.muted}>{d.department}: {d.count}</p>) : <p className={styles.muted}>No department data.</p>}
        </section>
      </aside>
    </div>
  )
}
