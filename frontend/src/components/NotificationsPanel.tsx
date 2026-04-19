import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { INBOX_BADGE_INVALIDATE_EVENT, listInboxTasks } from '../api/inboxApi'
import { listNotifications, type NotificationRow } from '../api/notificationsApi'
import styles from '../pages/company/CompanyWorkspacePage.module.css'

export function NotificationsPanel({ companyId }: { companyId: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [openCount, setOpenCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<NotificationRow[]>([])

  const unread = useMemo(() => rows.filter((r) => !r.read).length, [rows])

  useEffect(() => {
    if (!companyId || !open) return
    setLoading(true)
    setError(null)
    void listNotifications(companyId)
      .then((items) => setRows(items.map((x) => ({ ...x, read: true }))))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load notifications'))
      .finally(() => setLoading(false))
  }, [companyId, open])

  const refreshOpenCount = useCallback(() => {
    if (!companyId) return
    void listInboxTasks(companyId)
      .then((tasks) => setOpenCount(tasks.filter((t) => t.status === 'open').length))
      .catch(() => setOpenCount(0))
  }, [companyId])

  useEffect(() => {
    refreshOpenCount()
  }, [refreshOpenCount, location.pathname, location.search])

  useEffect(() => {
    const onInvalidate = () => refreshOpenCount()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshOpenCount()
    }
    window.addEventListener(INBOX_BADGE_INVALIDATE_EVENT, onInvalidate)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(INBOX_BADGE_INVALIDATE_EVENT, onInvalidate)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshOpenCount])

  function navigateFromNotification(row: NotificationRow) {
    if (row.entity_type === 'leave_request') navigate(`/company/${companyId}/hr-ops`)
    else if (row.entity_type === 'application') navigate(`/company/${companyId}/recruitment/pipeline`)
    else if (row.entity_type === 'offer') navigate(`/company/${companyId}/recruitment/offers`)
    else if (row.type === 'review_cycle_peer_review') navigate(`/company/${companyId}/my-goals/peer-review`)
    else if (row.type === 'peer_review_submitted') navigate(`/company/${companyId}/my-goals/peer-review`)
    else if (row.type === 'pip_placed') navigate(`/company/${companyId}/performance?tab=pips`)
    else if (row.entity_type === 'peer_review_request' && row.entity_id) {
      navigate(`/company/${companyId}/employees/${row.entity_id}`)
    } else if (row.entity_type === 'review_cycle') navigate(`/company/${companyId}/my-goals`)
    else if (row.entity_type === 'employee_goals_submitted' && row.entity_id) {
      navigate(`/company/${companyId}/employees/${row.entity_id}`)
    } else navigate(`/company/${companyId}/inbox`)
    setOpen(false)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
      <div className={styles.notificationsWrap}>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={() => setOpen((v) => !v)}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        >
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
      <button
        type="button"
        className={styles.btnGhost}
        onClick={() => navigate(`/company/${companyId}/inbox`)}
        aria-label={openCount > 0 ? `Inbox, ${openCount} open tasks` : 'Inbox'}
      >
        Inbox{openCount > 0 ? ` (${openCount})` : ''}
      </button>
    </div>
  )
}
