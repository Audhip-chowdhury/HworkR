import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { INBOX_BADGE_INVALIDATE_EVENT, listInboxTasks } from '../api/inboxApi'
import styles from '../pages/company/CompanyWorkspacePage.module.css'

export function NotificationsPanel({ companyId }: { companyId: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [openCount, setOpenCount] = useState(0)

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

  return (
    <button
      type="button"
      className={styles.btnGhost}
      onClick={() => navigate(`/company/${companyId}/inbox`)}
      aria-label={openCount > 0 ? `Inbox, ${openCount} open tasks` : 'Inbox'}
    >
      Inbox{openCount > 0 ? ` (${openCount})` : ''}
    </button>
  )
}
