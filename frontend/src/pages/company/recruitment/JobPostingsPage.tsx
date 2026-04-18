import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  createPosting,
  listPostings,
  listRequisitions,
  patchPosting,
  type JobPosting,
} from '../../../api/recruitmentApi'
import { apiFetch } from '../../../api/client'
import { useAuth } from '../../../auth/AuthContext'
import type { Requisition } from '../../../api/types'
import styles from '../CompanyWorkspacePage.module.css'
import jpStyles from './JobPostingsPage.module.css'

const TA_ROLES = new Set(['company_admin', 'talent_acquisition'])

function shortId(id: string): string {
  if (id.length <= 12) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

function requisitionSelectLabel(
  r: Requisition,
  deptById: Map<string, string>,
  jobById: Map<string, string>,
): string {
  const code = r.req_code ?? '—'
  const rid = shortId(r.id)
  const dept = r.department_id ? deptById.get(r.department_id) ?? '—' : '—'
  const role = r.job_id ? jobById.get(r.job_id) ?? '—' : '—'
  return `${code} · ${rid} · ${dept} / ${role}`
}

function PostingRefField({
  posting,
  canEdit,
  saving,
  onSave,
}: {
  posting: JobPosting
  canEdit: boolean
  saving: boolean
  onSave: (value: string) => void
}) {
  const [local, setLocal] = useState(posting.posting_ref ?? '')
  useEffect(() => {
    setLocal(posting.posting_ref ?? '')
  }, [posting.id, posting.posting_ref, posting.updated_at])

  if (!canEdit) {
    const t = posting.posting_ref?.trim()
    return <span className={styles.muted}>{t || '—'}</span>
  }
  return (
    <input
      className={`${styles.input} ${jpStyles.postingRefInput}`}
      value={local}
      disabled={saving}
      placeholder="Listing / ref #"
      aria-label={`Posting ID for ${posting.title}`}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const next = local.trim()
        const prev = (posting.posting_ref ?? '').trim()
        if (next !== prev) onSave(next)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

export function JobPostingsPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const role = myCompanies.find((c) => c.company.id === companyId)?.membership.role ?? ''
  const canEdit = TA_ROLES.has(role)

  const [postings, setPostings] = useState<JobPosting[]>([])
  const [requisitions, setRequisitions] = useState<Requisition[]>([])
  const [requisitionId, setRequisitionId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [requirements, setRequirements] = useState('')
  const [deadline, setDeadline] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [postedFilter, setPostedFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [contextLoading, setContextLoading] = useState(true)
  const [tableLoading, setTableLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deptById, setDeptById] = useState<Map<string, string>>(() => new Map())
  const [jobById, setJobById] = useState<Map<string, string>>(() => new Map())

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText.trim()), 400)
    return () => clearTimeout(t)
  }, [searchText])

  const requisitionsWithoutPosting = useMemo(() => {
    const used = new Set(postings.map((p) => p.requisition_id))
    return requisitions.filter((r) => !used.has(r.id))
  }, [requisitions, postings])

  const reqById = useMemo(
    () => new Map(requisitions.map((r) => [r.id, r] as const)),
    [requisitions],
  )

  const loadContext = useCallback(async () => {
    if (!companyId) return
    setError(null)
    const [r, departments, jobs] = await Promise.all([
      listRequisitions(companyId),
      apiFetch<Array<{ id: string; name: string }>>(`/companies/${companyId}/departments`),
      apiFetch<Array<{ id: string; title: string }>>(`/companies/${companyId}/job-catalog`),
    ])
    setRequisitions(r)
    setDeptById(new Map(departments.map((d) => [d.id, d.name])))
    setJobById(new Map(jobs.map((j) => [j.id, j.title])))
  }, [companyId])

  const loadPostings = useCallback(async () => {
    if (!companyId) return
    setTableLoading(true)
    setError(null)
    try {
      const p = await listPostings(companyId, {
        status: statusFilter || undefined,
        posted: postedFilter === 'all' ? undefined : postedFilter === 'yes' ? 'true' : 'false',
        search: debouncedSearch || undefined,
      })
      setPostings(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load postings')
    } finally {
      setTableLoading(false)
    }
  }, [companyId, statusFilter, postedFilter, debouncedSearch])

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    async function run() {
      setContextLoading(true)
      setError(null)
      try {
        await loadContext()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setContextLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [companyId, loadContext])

  useEffect(() => {
    if (!companyId) return
    void loadPostings()
  }, [companyId, loadPostings])

  useEffect(() => {
    if (contextLoading) return
    const eligible = requisitionsWithoutPosting
    if (eligible.length === 0) {
      if (requisitionId) setRequisitionId('')
      return
    }
    const stillValid = requisitionId && eligible.some((r) => r.id === requisitionId)
    if (!stillValid) setRequisitionId(eligible[0].id)
  }, [contextLoading, requisitionsWithoutPosting, requisitionId])

  async function onCreate() {
    if (!companyId || !requisitionId || !title.trim()) return
    setPending(true)
    setError(null)
    try {
      await createPosting(companyId, {
        requisition_id: requisitionId,
        title: title.trim(),
        description,
        requirements,
        deadline: deadline || undefined,
      })
      setTitle('')
      setDescription('')
      setRequirements('')
      setDeadline('')
      await loadContext()
      await loadPostings()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create posting failed')
    } finally {
      setPending(false)
    }
  }

  async function updatePosted(p: JobPosting, posted: boolean) {
    if (!companyId || !canEdit) return
    setSavingId(p.id)
    setError(null)
    try {
      const updated = await patchPosting(companyId, p.id, { posted })
      setPostings((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSavingId(null)
    }
  }

  async function updatePostingRef(p: JobPosting, postingRef: string) {
    if (!companyId || !canEdit) return
    setSavingId(p.id)
    setError(null)
    try {
      const updated = await patchPosting(companyId, p.id, {
        posting_ref: postingRef.length ? postingRef : null,
      })
      setPostings((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSavingId(null)
    }
  }

  const showEmpty = !tableLoading && postings.length === 0

  return (
    <section className={styles.card}>
      <div className={styles.moduleNav}>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment`}>Back to Recruitment</Link>
      </div>
      <h3 className={styles.h3}>Job postings</h3>
      <p className={jpStyles.hint}>
        Each requisition can have at most one job posting. Use <strong>Posted</strong> when the role is live on external boards;
        <strong> Posting ID</strong> is your own reference (e.g. LinkedIn listing #), not the internal system id.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {canEdit ? (
        <div className={styles.positionForm}>
          <label className={styles.labelBlock} htmlFor="jp-requisition">
            Requisition
            <select
              id="jp-requisition"
              className={styles.input}
              value={requisitionId}
              onChange={(e) => setRequisitionId(e.target.value)}
              disabled={contextLoading || requisitionsWithoutPosting.length === 0}
            >
              <option value="">
                {requisitionsWithoutPosting.length === 0
                  ? 'No requisitions available (create one or all already have postings)'
                  : 'Select requisition'}
              </option>
              {requisitionsWithoutPosting.map((r) => (
                <option key={r.id} value={r.id}>
                  {requisitionSelectLabel(r, deptById, jobById)}
                </option>
              ))}
            </select>
          </label>
          <input className={styles.input} placeholder="Posting title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className={styles.input} style={{ minHeight: 80 }} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <textarea className={styles.input} style={{ minHeight: 80 }} placeholder="Requirements" value={requirements} onChange={(e) => setRequirements(e.target.value)} />
          <input className={styles.input} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          <button
            className={styles.btnSm}
            type="button"
            disabled={pending || !requisitionId || requisitionsWithoutPosting.length === 0}
            onClick={() => void onCreate()}
          >
            {pending ? 'Creating…' : 'Create posting'}
          </button>
        </div>
      ) : (
        <p className={styles.muted}>Only company admins and talent acquisition can create postings. You can still browse and filter the list below.</p>
      )}

      <div className={jpStyles.toolbar} aria-label="Filter job postings">
        <div className={jpStyles.toolbarField}>
          <label htmlFor="jp-filter-status">Opening status</label>
          <select
            id="jp-filter-status"
            className={styles.input}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="open">Open only</option>
            <option value="closed">Closed only</option>
          </select>
        </div>
        <div className={jpStyles.toolbarField}>
          <label htmlFor="jp-filter-posted">Posted externally</label>
          <select
            id="jp-filter-posted"
            className={styles.input}
            value={postedFilter}
            onChange={(e) => setPostedFilter(e.target.value as 'all' | 'yes' | 'no')}
          >
            <option value="all">All</option>
            <option value="yes">Posted ✓</option>
            <option value="no">Not posted yet</option>
          </select>
        </div>
        <div className={`${jpStyles.toolbarField} ${jpStyles.searchInput}`}>
          <label htmlFor="jp-search">Search title or posting ID</label>
          <input
            id="jp-search"
            className={styles.input}
            type="search"
            placeholder="Type to filter…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Requisition</th>
              <th>Title</th>
              <th>Status</th>
              <th>Posted</th>
              <th>Posting ID</th>
              <th>Deadline</th>
            </tr>
          </thead>
          <tbody>
            {tableLoading ? (
              <tr>
                <td className={styles.muted} colSpan={6}>
                  Loading postings…
                </td>
              </tr>
            ) : null}
            {!tableLoading && showEmpty ? (
              <tr>
                <td className={styles.muted} colSpan={6}>
                  No job postings match your filters.
                </td>
              </tr>
            ) : null}
            {!tableLoading &&
              postings.map((p) => {
                const req = reqById.get(p.requisition_id)
                const reqLabel = req?.req_code
                  ? `${req.req_code} · ${shortId(p.requisition_id)}`
                  : shortId(p.requisition_id)
                return (
                  <tr key={p.id}>
                    <td className={styles.muted} title={p.requisition_id}>
                      {reqLabel}
                    </td>
                    <td>{p.title}</td>
                    <td>{p.status}</td>
                    <td className={jpStyles.postedCell}>
                      <input
                        type="checkbox"
                        className={jpStyles.postedCheck}
                        checked={p.posted ?? false}
                        disabled={!canEdit || savingId === p.id}
                        title={canEdit ? 'Toggle posted to external boards' : 'View only'}
                        aria-label={p.posted ? 'Posted' : 'Not posted'}
                        onChange={(e) => void updatePosted(p, e.target.checked)}
                      />
                    </td>
                    <td>
                      <PostingRefField
                        posting={p}
                        canEdit={canEdit}
                        saving={savingId === p.id}
                        onSave={(v) => void updatePostingRef(p, v)}
                      />
                    </td>
                    <td>{p.deadline ?? '—'}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
      {!canEdit ? (
        <p className={jpStyles.tableFootnote}>Editing Posted and Posting ID requires company admin or talent acquisition access.</p>
      ) : null}
    </section>
  )
}
