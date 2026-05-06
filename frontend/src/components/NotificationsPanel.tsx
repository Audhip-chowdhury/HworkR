import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { INBOX_BADGE_INVALIDATE_EVENT, listInboxTasks } from '../api/inboxApi'
import { listNotifications, markNotificationsRead, type NotificationRow } from '../api/notificationsApi'
import styles from '../pages/company/CompanyWorkspacePage.module.css'

export function NotificationsPanel({ companyId }: { companyId: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [openCount, setOpenCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loadingPanel, setLoadingPanel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [listTick, setListTick] = useState(0)

  const unread = useMemo(() => rows.filter((r) => !r.read).length, [rows])

  const bumpNotifications = useCallback(() => setListTick((t) => t + 1), [])

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    void listNotifications(companyId)
      .then((items) => {
        if (!cancelled) {
          setRows(items)
          setError(null)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load notifications')
      })
    return () => {
      cancelled = true
    }
  }, [companyId, location.pathname, location.search, listTick])

  useEffect(() => {
    if (!open || !companyId) return
    let cancelled = false
    setLoadingPanel(true)
    setError(null)
    void listNotifications(companyId)
      .then(async (items) => {
        if (cancelled) return
        setRows(items)
        const unreadIds = items.filter((i) => !i.read).map((i) => i.id)
        if (unreadIds.length > 0) {
          await markNotificationsRead(companyId, unreadIds)
          if (cancelled) return
          setRows((prev) => prev.map((r) => (unreadIds.includes(r.id) ? { ...r, read: true } : r)))
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load notifications')
      })
      .finally(() => {
        if (!cancelled) setLoadingPanel(false)
      })
    return () => {
      cancelled = true
    }
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
    const onInvalidate = () => {
      refreshOpenCount()
      bumpNotifications()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshOpenCount()
        bumpNotifications()
      }
    }
    window.addEventListener(INBOX_BADGE_INVALIDATE_EVENT, onInvalidate)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(INBOX_BADGE_INVALIDATE_EVENT, onInvalidate)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshOpenCount, bumpNotifications])

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      const el = wrapRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

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
    <div ref={wrapRef} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
      <div className={styles.notificationsWrap}>
        <button
          type="button"
          className={`${styles.btnGhost} ${styles.notificationsBellBtn}`}
          onClick={() => setOpen((v) => !v)}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          aria-expanded={open}
        >
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden={true}
          >
            <path
              d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10.29 21a1.94 1.94 0 0 0 3.42 0"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {unread > 0 ? (
            <span className={styles.notificationsBellBadge}>{unread > 99 ? '99+' : unread}</span>
          ) : null}
        </button>
        {open ? (
          <div className={styles.notificationsPanel} role="region" aria-label="Notifications">
            <div className={styles.notificationsPanelHeader}>
              <h4 className={styles.h4}>Notifications</h4>
            </div>
            <div className={styles.notificationsPanelBody}>
              {error ? <p className={styles.error}>{error}</p> : null}
              {loadingPanel ? <p className={styles.muted}>Loading…</p> : null}
              {!loadingPanel && rows.length === 0 && !error ? (
                <p className={styles.notificationsEmpty}>No notifications yet.</p>
              ) : null}
              {!loadingPanel &&
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
