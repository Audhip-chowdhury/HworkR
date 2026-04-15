import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { listHolidays, type HolidayRow } from '../../../api/leaveApi'
import styles from '../CompanyWorkspacePage.module.css'
import leaveStyles from './Leave.module.css'

function formatDisplayDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function LeaveHolidaysPage() {
  const { companyId = '' } = useParams()
  const [rows, setRows] = useState<HolidayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    void listHolidays(companyId)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load holidays'))
      .finally(() => setLoading(false))
  }, [companyId])

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>Holiday calendar</h3>
        <p className={styles.hint}>Company-wide public holidays. These days are highlighted on the leave calendar.</p>
        {error ? <p className={styles.error}>{error}</p> : null}
        {loading ? <p className={styles.muted}>Loading…</p> : null}
        {!loading && !error ? (
          <div className={leaveStyles.holidayGrid}>
            {rows.map((h) => (
              <div key={h.id} className={leaveStyles.holidayCard}>
                <div className={leaveStyles.holidayDate}>{formatDisplayDate(h.date)}</div>
                <div className={leaveStyles.holidayName}>{h.name}</div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}
