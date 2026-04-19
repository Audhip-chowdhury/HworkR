import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  createCompletion,
  listAssignments,
  type TrainingAssignmentEnriched,
} from '../../../api/performanceLearningApi'
import styles from '../CompanyWorkspacePage.module.css'
import { TrainingVideoModal } from './TrainingVideoModal'

function hasFullCredit(a: TrainingAssignmentEnriched): boolean {
  return a.display_status === 'completed'
}

export function TrainingAssignmentsPage() {
  const { companyId = '' } = useParams()
  const [rows, setRows] = useState<TrainingAssignmentEnriched[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [active, setActive] = useState<TrainingAssignmentEnriched | null>(null)
  const [completing, setCompleting] = useState(false)

  const refresh = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const a = await listAssignments(companyId)
      setRows(a)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assignments')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onVideoCompleted = useCallback(async () => {
    if (!companyId || !active) return
    if (hasFullCredit(active)) {
      setModalOpen(false)
      setActive(null)
      return
    }
    setCompleting(true)
    setError(null)
    try {
      await createCompletion(companyId, { assignment_id: active.id })
      setModalOpen(false)
      setActive(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record completion')
    } finally {
      setCompleting(false)
    }
  }, [companyId, active, refresh])

  const onAbandonVideo = useCallback(async () => {
    if (!companyId || !active) return
    if (hasFullCredit(active)) return
    if (active.completion_score === 0) return
    try {
      await createCompletion(companyId, { assignment_id: active.id, score: 0 })
      await refresh()
    } catch {
      /* duplicate or race */
    }
  }, [companyId, active, refresh])

  function openRow(a: TrainingAssignmentEnriched) {
    setActive(a)
    setModalOpen(true)
  }

  function statusCell(a: TrainingAssignmentEnriched) {
    if (hasFullCredit(a)) return 'Complete'
    if (a.completion_score === 0) return 'Closed early (score 0)'
    if (a.overdue_before_due) return 'Pending (overdue)'
    return 'Pending'
  }

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>My training assignments</h3>
        <p className={styles.hint}>
          Open a course to watch in the in-app player. You cannot skip ahead; closing with ✕ before the
          video ends records score 0.
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}
        {completing ? <p className={styles.muted}>Saving completion…</p> : null}
        {loading ? <p className={styles.muted}>Loading…</p> : null}
        {!loading && rows.length === 0 ? (
          <p className={styles.muted}>
            No assignments yet. Assignments are tied to your employee profile for this company. If you are
            HR and see nothing, ensure your user is linked to an employee record.
          </p>
        ) : null}
        {!loading && rows.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Course name</th>
                  <th>Points</th>
                  <th>Due date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <button type="button" className={styles.linkBtn} onClick={() => openRow(a)}>
                        {a.course_title}
                      </button>
                      {hasFullCredit(a) ? (
                        <span className={styles.muted} style={{ marginLeft: '0.5rem' }}>
                          (completed)
                        </span>
                      ) : null}
                    </td>
                    <td>{a.course_points}</td>
                    <td>{a.due_date ?? '—'}</td>
                    <td>{statusCell(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <TrainingVideoModal
        youtubeUrl={active?.youtube_url}
        open={modalOpen && !!active}
        onAbandon={onAbandonVideo}
        onClose={() => {
          setModalOpen(false)
          setActive(null)
        }}
        onCompleted={onVideoCompleted}
      />
    </div>
  )
}
