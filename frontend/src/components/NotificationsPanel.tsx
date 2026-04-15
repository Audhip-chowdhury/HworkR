import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as notificationsApi from '../api/notificationsApi'
import styles from '../pages/company/CompanyWorkspacePage.module.css'

export function NotificationsPanel({ companyId }: { companyId: string }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<notificationsApi.NotificationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!companyId || !open) return
    setLoading(true)
    setError(null)
    void notificationsApi
      .listNotifications(companyId)
      .then((items) => setRows(items.map((x) => ({ ...x, read: true }))))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load notifications'))
      .finally(() => setLoading(false))
  }, [companyId, open])

  const unread = rows.filter((r) => !r.read).length

  function navigateFromNotification(row: notificationsApi.NotificationRow) {
    if (row.entity_type === 'leave_request') navigate(`/company/${companyId}/hr-ops`)
    else if (row.entity_type === 'application') navigate(`/company/${companyId}/recruitment/pipeline`)
    else if (row.entity_type === 'offer') navigate(`/company/${companyId}/recruitment/offers`)
    else if (row.entity_type === 'review_cycle') navigate(`/company/${companyId}/my-goals`)
    else if (row.entity_type === 'employee_goals_submitted' && row.entity_id) {
      navigate(`/company/${companyId}/employees/${row.entity_id}`)
    } else navigate(`/company/${companyId}/inbox`)
    setOpen(false)
  }

  return (
    <div className={styles.notificationsWrap}>
      <button type="button" className={styles.btnGhost} onClick={() => setOpen((v) => !v)}>
        Inbox {unread > 0 ? `(${unread})` : ''}
      </button>
      {open ? (
        <div className={styles.notificationsPanel} role="region" aria-label="Notifications">
          <div className={styles.notificationsPanelHeader}>
            <h4 className={styles.h4}>Notifications</h4>
          </div>
          <div className={styles.notificationsPanelBody}>
            {error ? <p className={styles.error}>{error}</p> : null}
            {loading ? <p className={styles.muted}>Loading…</p> : null}
            {!loading && rows.length === 0 && !error ? (
              <p className={styles.notificationsEmpty}>No notifications yet.</p>
            ) : null}
            {!loading &&
              rows.map((n) => (
                <div key={n.id} className={styles.notificationsItem}>
                  <button
                    type="button"
                    className={styles.notificationsItemTitle}
                    onClick={() => navigateFromNotification(n)}
                  >
                    {n.title}
                  </button>
                  {n.message ? <p className={styles.notificationsItemMessage}>{n.message}</p> : null}
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
