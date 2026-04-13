import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAnalyticsDashboard } from '../../../api/analyticsApi'
import { listInboxTasks } from '../../../api/inboxApi'
import { getRecentActivity, getScoreDashboard } from '../../../api/trackingApi'
import { useAuth } from '../../../auth/AuthContext'
import styles from '../CompanyWorkspacePage.module.css'

export function WorkspaceDashboardPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const role = myCompanies.find((x) => x.company.id === companyId)?.membership.role ?? ''
  const [inboxCount, setInboxCount] = useState(0)
  const [upcoming, setUpcoming] = useState<Array<{ id: string; title: string; due_at: string | null; priority: string }>>([])
  const [score, setScore] = useState<number | null>(null)
  const [scoreActionCount, setScoreActionCount] = useState<number>(0)
  const [training, setTraining] = useState<number | null>(null)
  const [recent, setRecent] = useState<Array<{ id: string; module: string; action_type: string; created_at: string }>>([])
  const [loadingDash, setLoadingDash] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const quickLinks = role === 'employee'
    ? [
        { to: `/company/${companyId}/hr-ops`, label: 'My leave' },
        { to: `/company/${companyId}/performance`, label: 'My goals' },
        { to: `/company/${companyId}/learning`, label: 'My learning' },
      ]
    : role === 'talent_acquisition'
      ? [
          { to: `/company/${companyId}/recruitment/pipeline`, label: 'Pipeline' },
          { to: `/company/${companyId}/recruitment/postings`, label: 'Open postings' },
          { to: `/company/${companyId}/inbox`, label: 'Inbox' },
        ]
      : [
          { to: `/company/${companyId}/inbox`, label: 'Inbox' },
          { to: `/company/${companyId}/hr-ops`, label: 'HR ops' },
          { to: `/company/${companyId}/analytics`, label: 'Analytics' },
        ]

  useEffect(() => {
    if (!companyId) return
    setLoadingDash(true)
    setError(null)
    void Promise.allSettled([
      listInboxTasks(companyId).then((r) => {
        setInboxCount(r.length)
        setUpcoming(r.filter((x) => x.priority === 'high').slice(0, 5))
      }),
      getScoreDashboard(companyId).then((r) => {
        setScore(r.overall_score)
        setScoreActionCount(r.action_count)
      }),
      getAnalyticsDashboard(companyId).then((r) => setTraining(r.learning.completion_rate_percent)),
      getRecentActivity(companyId, 5).then((r) => setRecent(r)),
    ]).then((results) => {
      if (results.some((x) => x.status === 'rejected')) {
        setError('Some dashboard sections could not be loaded.')
      }
      setLoadingDash(false)
    })
  }, [companyId])

  return (
    <div className={styles.orgLayout}>
      <div className={styles.orgMain}>
        {error ? <p className={styles.error}>{error}</p> : null}
        <section className={styles.card}>
          <h3 className={styles.h3}>Workspace summary</h3>
          <div className={styles.statGrid}>
            <div className={styles.statCard}><p className={styles.statNumber}>{loadingDash ? '…' : inboxCount}</p><p className={styles.statLabel}>Pending inbox tasks</p></div>
            <div className={styles.statCard}><p className={styles.statNumber}>{loadingDash ? '…' : (score ?? '—')}</p><p className={styles.statLabel}>Your score ({scoreActionCount} actions)</p></div>
            <div className={styles.statCard}><p className={styles.statNumber}>{loadingDash ? '…' : `${training ?? 0}%`}</p><p className={styles.statLabel}>Training completion</p></div>
          </div>
        </section>
        <section className={styles.card}>
          <h3 className={styles.h3}>Quick actions</h3>
          <div className={styles.inline}>
            {quickLinks.map((item) => <Link key={item.to} to={item.to}>{item.label}</Link>)}
          </div>
        </section>
      </div>
      <aside className={styles.orgAside}>
        <section className={styles.card}>
          <h3 className={styles.h3}>Live activity</h3>
          {recent.length === 0 ? <p className={styles.muted}>No activity yet.</p> : recent.map((r) => (
            <p key={r.id} className={styles.muted}>
              {r.module} / {r.action_type} — {new Date(r.created_at).toLocaleString()}
            </p>
          ))}
        </section>
        <section className={styles.card}>
          <h3 className={styles.h3}>Upcoming high-priority tasks</h3>
          {upcoming.length === 0 ? <p className={styles.muted}>No high-priority tasks.</p> : upcoming.map((t) => <p key={t.id} className={styles.muted}>{t.title} ({t.due_at ?? 'no due date'})</p>)}
        </section>
      </aside>
    </div>
  )
}
