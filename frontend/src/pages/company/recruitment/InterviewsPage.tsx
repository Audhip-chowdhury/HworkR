import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { createInterview, listApplications, listInterviews, updateInterview } from '../../../api/recruitmentApi'
import styles from '../CompanyWorkspacePage.module.css'

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function InterviewsPage() {
  const { companyId = '' } = useParams()
  const [apps, setApps] = useState<any[]>([])
  const [expandedAppId, setExpandedAppId] = useState('')
  const [rows, setRows] = useState<Record<string, any[]>>({})
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'scheduled' | 'not_scheduled'>('all')
  const [scheduledAt, setScheduledAt] = useState('')
  const [format, setFormat] = useState('video')
  const [panelNotes, setPanelNotes] = useState('')
  const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    void listApplications(companyId)
      .then(async (applications) => {
        setApps(applications)
        const interviewRows = await Promise.all(
          applications.map(async (a) => [a.id, await listInterviews(companyId, a.id)] as const),
        )
        setRows(Object.fromEntries(interviewRows))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load applications'))
      .finally(() => setLoading(false))
  }, [companyId])

  async function load(applicationId: string) {
    setExpandedAppId(applicationId)
    try {
      const r = await listInterviews(companyId, applicationId)
      setRows((p) => ({ ...p, [applicationId]: r }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load interviews')
    }
  }

  async function schedule(applicationId: string) {
    setPending(true)
    setError(null)
    try {
      if (editingInterviewId) {
        await updateInterview(companyId, editingInterviewId, {
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          format,
          panel_json: { notes: panelNotes || null },
          status: 'scheduled',
        })
      } else {
        await createInterview(companyId, applicationId, {
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
          format,
          panel_json: { notes: panelNotes || null },
          status: 'scheduled',
        })
      }
      await load(applicationId)
      setEditingInterviewId(null)
      setScheduledAt('')
      setPanelNotes('')
      setExpandedAppId('')
      toast.success(editingInterviewId ? 'Interview rescheduled.' : 'Interview scheduled.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule interview')
    } finally {
      setPending(false)
    }
  }

  function activeInterviewFor(applicationId: string): any | null {
    const list = rows[applicationId] ?? []
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i]?.status !== 'cancelled') return list[i]
    }
    return null
  }

  function openScheduleForm(applicationId: string) {
    setEditingInterviewId(null)
    setExpandedAppId((prev) => (prev === applicationId ? '' : applicationId))
  }

  function openRescheduleForm(applicationId: string) {
    const active = activeInterviewFor(applicationId)
    if (!active) return
    setEditingInterviewId(active.id)
    setScheduledAt(toLocalInputValue(active.scheduled_at))
    setFormat(active.format ?? 'video')
    const notes = active.panel_json?.notes
    setPanelNotes(typeof notes === 'string' ? notes : '')
    setExpandedAppId(applicationId)
  }

  async function removeInterview(applicationId: string) {
    const active = activeInterviewFor(applicationId)
    if (!active) return
    if (!confirm('Remove this scheduled interview?')) return
    setPending(true)
    setError(null)
    try {
      await updateInterview(companyId, active.id, {
        status: 'cancelled',
        scheduled_at: null,
      })
      if (expandedAppId === applicationId) {
        setExpandedAppId('')
      }
      await load(applicationId)
      toast.success('Interview removed.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove interview')
    } finally {
      setPending(false)
    }
  }

  const filteredApps = apps.filter((a) => {
    const hasInterview = Boolean(activeInterviewFor(a.id))
    if (scheduleFilter === 'scheduled') return hasInterview
    if (scheduleFilter === 'not_scheduled') return !hasInterview
    return true
  })

  return (
    <section className={styles.card}>
      <div className={styles.moduleNav}>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment`}>Back to Recruitment</Link>
      </div>
      <h3 className={styles.h3}>Interviews</h3>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading applications…</p> : null}
      <div className={styles.inline} style={{ marginBottom: '0.75rem' }}>
        <select className={styles.input} value={scheduleFilter} onChange={(e) => setScheduleFilter(e.target.value as 'all' | 'scheduled' | 'not_scheduled')}>
          <option value="all">All applications</option>
          <option value="scheduled">Scheduled</option>
          <option value="not_scheduled">Not scheduled</option>
        </select>
      </div>
      {filteredApps.map((a) => (
        <div key={a.id} className={styles.deptBlock}>
          <div className={styles.inline} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <p className={styles.muted} style={{ margin: 0 }}>
              {a.posting_title ?? a.id.slice(0, 8)} · Candidate: {a.candidate_name ?? `${a.candidate_user_id.slice(0, 8)}…`}
            </p>
            <div className={styles.inline} style={{ gap: '0.4rem' }}>
              <button
                className={styles.interviewScheduleBtn}
                type="button"
                disabled={Boolean(activeInterviewFor(a.id))}
                onClick={() => openScheduleForm(a.id)}
              >
                Schedule
              </button>
              <button
                className={styles.interviewScheduleBtn}
                type="button"
                disabled={!activeInterviewFor(a.id)}
                onClick={() => openRescheduleForm(a.id)}
              >
                Reschedule
              </button>
              <button
                className={styles.interviewScheduleBtn}
                type="button"
                disabled={!activeInterviewFor(a.id) || pending}
                onClick={() => void removeInterview(a.id)}
              >
                Remove interview
              </button>
            </div>
          </div>
          {expandedAppId === a.id ? (
            <>
              <div className={styles.inline}>
                <input type="datetime-local" className={styles.input} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                <select className={styles.input} value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="video">Video</option>
                  <option value="phone">Phone</option>
                  <option value="onsite">Onsite</option>
                </select>
                <input className={styles.input} placeholder="Panel notes" value={panelNotes} onChange={(e) => setPanelNotes(e.target.value)} />
                <button className={styles.btnSm} disabled={pending} onClick={() => void schedule(a.id)}>
                  {editingInterviewId ? 'Save reschedule' : 'Schedule'}
                </button>
              </div>
              {(rows[a.id] ?? []).length === 0 ? <p className={styles.muted}>No interviews yet.</p> : null}
              {(rows[a.id] ?? []).map((r) => <p key={r.id} className={styles.muted}>{r.status} · {r.format ?? '—'} · {r.scheduled_at ?? 'unscheduled'}</p>)}
            </>
          ) : null}
        </div>
      ))}
    </section>
  )
}
