import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { listApplications, updateApplicationStage } from '../../../api/recruitmentApi'
import styles from '../CompanyWorkspacePage.module.css'

const STAGES = ['applied', 'screened', 'phone_screen', 'interview', 'assessment', 'offer', 'hired', 'rejected']

export function CandidatePipelinePage() {
  const { companyId = '' } = useParams()
  const [apps, setApps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

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

  useEffect(() => { void refresh() }, [companyId])

  async function move(id: string, stage: string) {
    setPendingId(id)
    try {
      const n = await updateApplicationStage(companyId, id, { stage, status: stage === 'rejected' ? 'closed' : 'active' })
      setApps((p) => p.map((x) => (x.id === id ? n : x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update stage')
    } finally {
      setPendingId('')
    }
  }

  return (
    <div className={styles.org}>
      {error ? <p className={styles.error}>{error}</p> : null}
      <input className={styles.input} placeholder="Filter by posting/candidate" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className={styles.inline} style={{ alignItems: 'stretch', overflowX: 'auto', flexWrap: 'nowrap' }}>
        {STAGES.map((s) => (
          <section key={s} className={styles.card} style={{ minWidth: 240 }}>
            <h3 className={styles.h3}>{s}</h3>
            {loading ? <p className={styles.muted}>Loading…</p> : null}
            {!loading &&
              apps
                .filter((a) => a.stage === s && `${a.posting_title ?? ''} ${a.candidate_user_id}`.toLowerCase().includes(query.toLowerCase()))
                .map((a) => (
                  <div key={a.id} className={styles.deptBlock}>
                    <p className={styles.muted}>{a.posting_title ?? a.id.slice(0, 8)}…</p>
                    <p className={styles.muted}>Candidate: {a.candidate_user_id.slice(0, 8)}…</p>
                    <select
                      className={styles.input}
                      value={a.stage}
                      disabled={pendingId === a.id}
                      onChange={(e) => void move(a.id, e.target.value)}
                    >
                      {STAGES.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                ))}
          </section>
        ))}
      </div>
    </div>
  )
}
