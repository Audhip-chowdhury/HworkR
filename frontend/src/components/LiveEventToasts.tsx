import { useRealtimeEvents } from '../context/RealtimeEventsContext'
import styles from './LiveEventToasts.module.css'

const INTERESTING = new Set([
  'requisition.submitted',
  'workflow.approved',
  'workflow.rejected',
  'offer.accepted',
  'offer.declined',
  'leave.approved',
  'leave.rejected',
  'certificate.issued',
  'training.completed',
])

export function LiveEventToasts() {
  const { events, clearEvents } = useRealtimeEvents()
  const visible = events.filter((e) => INTERESTING.has(e.envelope.event_type)).slice(0, 6)

  if (visible.length === 0) return null

  return (
    <div className={styles.host} aria-live="polite">
      <div className={styles.header}>
        <span>Live updates</span>
        <button type="button" className={styles.clear} onClick={clearEvents}>
          Clear
        </button>
      </div>
      <ul className={styles.list}>
        {visible.map((row) => (
          <li key={row.id} className={styles.item}>
            <strong>{row.envelope.event_type}</strong>
            <span className={styles.meta}>
              {row.envelope.entity_type ?? '—'} {row.envelope.entity_id ?? ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
