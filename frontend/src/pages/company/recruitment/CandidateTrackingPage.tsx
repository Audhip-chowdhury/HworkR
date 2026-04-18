import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  listApplicationActivity,
  listApplications,
  listPostings,
  type ApplicationActivity,
} from '../../../api/recruitmentApi'
import styles from '../CompanyWorkspacePage.module.css'

const STAGES = ['applied', 'screened', 'phone_screen', 'interview', 'assessment', 'offer', 'hired', 'rejected']

function formatVia(v: string | null | undefined): string {
  if (v === 'offer_created') return 'Offer sent'
  if (v === 'offer_response') return 'Offer response'
  return ''
}

function transitionLabel(row: ApplicationActivity): string {
  if (row.action === 'create') {
    return `Start → ${row.stage ?? 'applied'}`
  }
  const a = row.previous_stage?.trim() || '—'
  const b = row.stage?.trim() || '—'
  return `${a} → ${b}`
}

function statusDelta(row: ApplicationActivity): string {
  if (row.action === 'create') {
    return row.status ?? '—'
  }
  const a = row.previous_status?.trim() || '—'
  const b = row.status?.trim() || '—'
  return a === b ? b : `${a} → ${b}`
}

export function CandidateTrackingPage() {
  const { companyId = '' } = useParams()
  const [rows, setRows] = useState<ApplicationActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [postings, setPostings] = useState<Array<{ id: string; title: string }>>([])
  const [candidates, setCandidates] = useState<Array<{ id: string; label: string }>>([])

  const [postingId, setPostingId] = useState('')
  const [candidateUserId, setCandidateUserId] = useState('')
  const [applicationId, setApplicationId] = useState('')
  const [action, setAction] = useState('')
  const [fromStage, setFromStage] = useState('')
  const [toStage, setToStage] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [textQ, setTextQ] = useState('')
  const [applicationIdDebounced, setApplicationIdDebounced] = useState('')

  useEffect(() => {
    const t = window.setTimeout(() => setApplicationIdDebounced(applicationId.trim()), 400)
    return () => window.clearTimeout(t)
  }, [applicationId])

  const loadMeta = useCallback(async () => {
    if (!companyId) return
    try {
      const [p, apps] = await Promise.all([listPostings(companyId), listApplications(companyId)])
      setPostings(p.map((x) => ({ id: x.id, title: x.title })))
      const seen = new Map<string, string>()
      for (const a of apps) {
        const label = a.candidate_name?.trim() || a.candidate_user_id.slice(0, 8)
        if (!seen.has(a.candidate_user_id)) seen.set(a.candidate_user_id, label)
      }
      setCandidates([...seen.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)))
    } catch {
      /* filters still work without dropdown data */
    }
  }, [companyId])

  const refresh = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      let date_from: string | undefined
      let date_to: string | undefined
      if (dateFrom) {
        const d = new Date(`${dateFrom}T00:00:00`)
        date_from = d.toISOString()
      }
      if (dateTo) {
        const d = new Date(`${dateTo}T23:59:59.999`)
        date_to = d.toISOString()
      }
      const data = await listApplicationActivity(companyId, {
        posting_id: postingId || undefined,
        candidate_user_id: candidateUserId || undefined,
        application_id: applicationIdDebounced || undefined,
        action: action || undefined,
        from_stage: fromStage || undefined,
        to_stage: toStage || undefined,
        date_from,
        date_to,
        limit: 300,
      })
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity')
    } finally {
      setLoading(false)
    }
  }, [companyId, postingId, candidateUserId, applicationIdDebounced, action, fromStage, toStage, dateFrom, dateTo])

  useEffect(() => {
    void loadMeta()
  }, [loadMeta])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const filtered = useMemo(() => {
    const q = textQ.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const hay = [
        r.candidate_name,
        r.posting_title,
        r.application_id,
        r.actor_name,
        r.stage,
        r.previous_stage,
        r.via,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rows, textQ])

  function clearFilters() {
    setPostingId('')
    setCandidateUserId('')
    setApplicationId('')
    setAction('')
    setFromStage('')
    setToStage('')
    setDateFrom('')
    setDateTo('')
    setTextQ('')
  }

  return (
    <div className={styles.org}>
      <div className={styles.moduleNav}>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment`}>Recruitment home</Link>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment/postings`}>Job postings</Link>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment/pipeline`}>Pipeline</Link>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment/interviews`}>Interviews</Link>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment/offers`}>Offers</Link>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment/candidate-portal`}>Candidate portal</Link>
        <span className={styles.moduleNavBtn} style={{ opacity: 0.95, cursor: 'default', fontWeight: 600 }}>
          Tracking
        </span>
      </div>

      <section className={styles.card}>
        <h3 className={styles.h3}>Candidate activity</h3>
        <p className={styles.muted} style={{ marginTop: 0 }}>
          Every pipeline move is logged: new applications, stage changes, offers, and candidate responses. Use filters to narrow by job, person, or transition.
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.reqToolbar} style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <label className={styles.labelInline}>
            <span>Job posting</span>
            <select
              className={styles.input}
              style={{ minWidth: 200 }}
              value={postingId}
              onChange={(e) => setPostingId(e.target.value)}
            >
              <option value="">All postings</option>
              {postings.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.labelInline}>
            <span>Candidate</span>
            <select
              className={styles.input}
              style={{ minWidth: 200 }}
              value={candidateUserId}
              onChange={(e) => setCandidateUserId(e.target.value)}
            >
              <option value="">All candidates</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.labelInline}>
            <span>Application ID</span>
            <input
              className={styles.input}
              style={{ minWidth: 220 }}
              placeholder="Paste full application id"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
            />
          </label>
          <label className={styles.labelInline}>
            <span>Event type</span>
            <select className={styles.input} style={{ minWidth: 160 }} value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All events</option>
              <option value="create">New application</option>
              <option value="update_stage">Stage / status change</option>
            </select>
          </label>
        </div>

        <div className={styles.reqToolbar} style={{ flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.75rem' }}>
          <label className={styles.labelInline}>
            <span>From stage</span>
            <select className={styles.input} style={{ minWidth: 180 }} value={fromStage} onChange={(e) => setFromStage(e.target.value)}>
              <option value="">Any</option>
              <option value="__new__">New application (start)</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.labelInline}>
            <span>To stage</span>
            <select className={styles.input} style={{ minWidth: 180 }} value={toStage} onChange={(e) => setToStage(e.target.value)}>
              <option value="">Any</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.labelInline}>
            <span>From date</span>
            <input className={styles.input} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className={styles.labelInline}>
            <span>To date</span>
            <input className={styles.input} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>

        <div className={styles.inline} style={{ marginTop: '0.75rem', alignItems: 'center' }}>
          <input
            className={styles.input}
            style={{ maxWidth: 360 }}
            placeholder="Search in loaded rows (name, job, id, stage…)"
            value={textQ}
            onChange={(e) => setTextQ(e.target.value)}
          />
          <button type="button" className={styles.btnSm} onClick={() => void refresh()} disabled={loading}>
            Refresh
          </button>
          <button type="button" className={styles.btnSm} onClick={clearFilters}>
            Clear filters
          </button>
        </div>

        <div className={styles.tableWrap} style={{ marginTop: '1rem' }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Candidate</th>
                <th>Posting</th>
                <th>Transition</th>
                <th>Status</th>
                <th>Actor</th>
                <th>Context</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className={styles.muted}>
                    Loading activity…
                  </td>
                </tr>
              ) : null}
              {!loading &&
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.muted}>{new Date(r.timestamp).toLocaleString()}</td>
                    <td>{r.candidate_name?.trim() || r.candidate_user_id.slice(0, 8)}</td>
                    <td>{r.posting_title?.trim() || r.posting_id.slice(0, 8)}</td>
                    <td>
                      <strong>{transitionLabel(r)}</strong>
                    </td>
                    <td className={styles.muted}>{statusDelta(r)}</td>
                    <td>{r.actor_name?.trim() || '—'}</td>
                    <td className={styles.muted}>
                      {r.action === 'create' ? 'Applied' : 'Updated'}
                      {formatVia(r.via) ? ` · ${formatVia(r.via)}` : ''}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 ? (
          <p className={styles.muted}>No activity matches these filters.</p>
        ) : null}
      </section>
    </div>
  )
}
