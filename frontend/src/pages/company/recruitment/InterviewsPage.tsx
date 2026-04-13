import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { createInterview, listApplications, listInterviews } from '../../../api/recruitmentApi'
import styles from '../CompanyWorkspacePage.module.css'

export function InterviewsPage() {
  const { companyId = '' } = useParams()
  const [apps, setApps] = useState<any[]>([])
  const [expandedAppId, setExpandedAppId] = useState('')
  const [rows, setRows] = useState<Record<string, any[]>>({})
  const [scheduledAt, setScheduledAt] = useState('')
  const [format, setFormat] = useState('video')
  const [panelNotes, setPanelNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    void listApplications(companyId)
      .then(setApps)
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
    try {
      await createInterview(companyId, applicationId, {
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        format,
        panel_json: { notes: panelNotes || null },
        status: 'scheduled',
      })
      await load(applicationId)
      setScheduledAt('')
      setPanelNotes('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule interview')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className={styles.card}>
      <h3 className={styles.h3}>Interviews</h3>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading applications…</p> : null}
      {apps.map((a) => (
        <div key={a.id} className={styles.deptBlock}>
          <p className={styles.muted}>
            <button className={styles.linkBtn} onClick={() => void load(a.id)}>Load</button>
            {a.posting_title ?? a.id.slice(0, 8)}
          </p>
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
                <button className={styles.btnSm} disabled={pending} onClick={() => void schedule(a.id)}>Schedule</button>
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
