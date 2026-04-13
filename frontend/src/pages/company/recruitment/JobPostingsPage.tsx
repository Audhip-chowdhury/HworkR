import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { createPosting, listPostings, listRequisitions } from '../../../api/recruitmentApi'
import styles from '../CompanyWorkspacePage.module.css'

export function JobPostingsPage() {
  const { companyId = '' } = useParams()
  const [postings, setPostings] = useState<any[]>([])
  const [requisitions, setRequisitions] = useState<any[]>([])
  const [requisitionId, setRequisitionId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [requirements, setRequirements] = useState('')
  const [deadline, setDeadline] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [p, r] = await Promise.all([listPostings(companyId), listRequisitions(companyId)])
      setPostings(p)
      setRequisitions(r)
      if (!requisitionId && r[0]) setRequisitionId(r[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load postings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [companyId])

  async function onCreate() {
    if (!companyId || !requisitionId || !title.trim()) return
    setPending(true)
    setError(null)
    try {
      await createPosting(companyId, { requisition_id: requisitionId, title: title.trim(), description, requirements, deadline: deadline || undefined })
      setTitle('')
      setDescription('')
      setRequirements('')
      setDeadline('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create posting failed')
    } finally {
      setPending(false)
    }
  }

  const filtered = postings.filter((p) => (statusFilter ? p.status === statusFilter : true))

  return (
    <section className={styles.card}>
      <h3 className={styles.h3}>Job postings</h3>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.positionForm}>
        <select className={styles.input} value={requisitionId} onChange={(e) => setRequisitionId(e.target.value)}>
          <option value="">Select requisition</option>
          {requisitions.map((r) => <option key={r.id} value={r.id}>{r.id.slice(0, 8)}… ({r.status})</option>)}
        </select>
        <input className={styles.input} placeholder="Posting title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className={styles.input} style={{ minHeight: 80 }} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <textarea className={styles.input} style={{ minHeight: 80 }} placeholder="Requirements" value={requirements} onChange={(e) => setRequirements(e.target.value)} />
        <input className={styles.input} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        <button className={styles.btnSm} disabled={pending} onClick={() => void onCreate()}>{pending ? 'Creating…' : 'Create posting'}</button>
      </div>
      <div className={styles.inline}>
        <select className={styles.input} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Title</th><th>Status</th><th>Deadline</th></tr></thead>
          <tbody>
            {loading ? <tr><td className={styles.muted} colSpan={3}>Loading job postings…</td></tr> : null}
            {!loading && filtered.length === 0 ? <tr><td className={styles.muted} colSpan={3}>No job postings.</td></tr> : null}
            {filtered.map((p) => <tr key={p.id}><td>{p.title}</td><td>{p.status}</td><td>{p.deadline ?? '—'}</td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  )
}
