import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRealtimeEvents } from '../../../context/RealtimeEventsContext'
import { listApplications, updateApplicationStage } from '../../../api/recruitmentApi'
import styles from '../CompanyWorkspacePage.module.css'

const PIPELINE_ORDER = ['applied', 'screened', 'phone_screen', 'interview', 'assessment', 'offer', 'hired']
/** Board columns only — no "hired" panel; candidates who are hired leave this view (still movable via offer flow / API). */
const STAGES = ['applied', 'screened', 'phone_screen', 'interview', 'assessment', 'offer', 'rejected']

function allowedNextStages(current: string): string[] {
  if (current === 'hired') return ['hired']

  if (current === 'rejected') {
    // We do not persist the exact pre-reject stage in the current model,
    // so allow recruiters to recover to any pipeline stage.
    return ['rejected', ...PIPELINE_ORDER]
  }

  const idx = PIPELINE_ORDER.indexOf(current)
  if (idx === -1) {
    return [current, 'rejected']
  }
  const next = PIPELINE_ORDER[idx + 1]
  return next ? [current, next, 'rejected'] : [current, 'rejected']
}

export function CandidatePipelinePage() {
  const { companyId = '' } = useParams()
  const { events } = useRealtimeEvents()
  const lastSeenEventId = useRef(0)
  const alignedStreamAfterLoad = useRef(false)
  const [apps, setApps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const refreshQuiet = useCallback(async () => {
    if (!companyId) return
    setError(null)
    try {
      setApps(await listApplications(companyId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pipeline')
    }
  }, [companyId])

  async function refresh() {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      setApps(await listApplications(companyId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pipeline')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    lastSeenEventId.current = 0
    alignedStreamAfterLoad.current = false
  }, [companyId])

  useEffect(() => { void refresh() }, [companyId])

  useEffect(() => {
    if (loading || !companyId) return
    const head = events[0]
    if (!alignedStreamAfterLoad.current) {
      alignedStreamAfterLoad.current = true
      lastSeenEventId.current = head?.id ?? 0
      return
    }
    if (!head || head.id === lastSeenEventId.current) return
    lastSeenEventId.current = head.id
    const ev = head.envelope
    if (ev.company_id !== companyId || ev.event_type !== 'application.created') return
    void refreshQuiet()
  }, [events, companyId, loading, refreshQuiet])

  async function move(id: string, stage: string) {
    const appRow = apps.find((a) => a.id === id)
    if (!appRow) return
    if (!allowedNextStages(appRow.stage).includes(stage)) return

    setPendingId(id)
    try {
      const n = await updateApplicationStage(companyId, id, { stage, status: stage === 'rejected' ? 'closed' : 'active' })
      // PATCH response does not include candidate_name; preserve it in local state.
      setApps((p) => p.map((x) => (x.id === id ? { ...n, candidate_name: x.candidate_name } : x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update stage')
    } finally {
      setPendingId('')
    }
  }

  return (
    <div className={styles.org}>
      <div className={styles.moduleNav}>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment`}>Back to Recruitment</Link>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment/tracking`}>Tracking</Link>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      <input className={styles.input} placeholder="Filter by posting/candidate" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className={styles.inline} style={{ alignItems: 'stretch', overflowX: 'auto', flexWrap: 'nowrap' }}>
        {STAGES.map((s) => (
          <section key={s} className={styles.card} style={{ minWidth: 240 }}>
            <h3 className={styles.h3}>{s}</h3>
            {loading ? <p className={styles.muted}>Loading…</p> : null}
            {!loading &&
              apps
                .filter((a) => {
                  const candidateName = a.candidate_name ?? ''
                  return a.stage === s && `${a.posting_title ?? ''} ${candidateName} ${a.candidate_user_id}`.toLowerCase().includes(query.toLowerCase())
                })
                .map((a) => {
                  return (
                    <div key={a.id} className={styles.deptBlock}>
                      <p className={styles.muted}>{a.posting_title ?? a.id.slice(0, 8)}…</p>
                      <p className={styles.muted}>
                        Candidate: {a.candidate_name ?? `${a.candidate_user_id.slice(0, 8)}…`}
                      </p>
                      <select
                        className={styles.input}
                        value={a.stage}
                        disabled={pendingId === a.id || a.stage === 'hired'}
                        onChange={(e) => void move(a.id, e.target.value)}
                      >
                        {allowedNextStages(a.stage).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  )
                })}
          </section>
        ))}
      </div>
    </div>
  )
}
