import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as recruitmentApi from '../../../api/recruitmentApi'
import { apiFetch } from '../../../api/client'
import { useAuth } from '../../../auth/AuthContext'
import type { Requisition } from '../../../api/types'
import styles from '../CompanyWorkspacePage.module.css'

const TA_ROLES = new Set(['company_admin', 'talent_acquisition'])

export function RecruitmentPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const role = myCompanies.find((c) => c.company.id === companyId)?.membership.role ?? ''
  const canSubmit = TA_ROLES.has(role)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [jobId, setJobId] = useState('')
  const [headcount, setHeadcount] = useState('1')
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([])
  const [jobs, setJobs] = useState<Array<{ id: string; title: string }>>([])

  const [rows, setRows] = useState<Requisition[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function refresh() {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [r, d, j] = await Promise.all([
        recruitmentApi.listRequisitions(companyId),
        apiFetch<Array<{ id: string; name: string }>>(`/companies/${companyId}/departments`),
        apiFetch<Array<{ id: string; title: string }>>(`/companies/${companyId}/job-catalog`),
      ])
      setRows(r)
      setDepartments(d)
      setJobs(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [companyId])

  async function submitForApproval(req: Requisition) {
    if (!companyId || !canSubmit) return
    if (!confirm(`Submit requisition ${req.id.slice(0, 8)}… for approval?`)) return
    setPending(true)
    try {
      await recruitmentApi.patchRequisition(companyId, req.id, { status: 'submitted' })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setPending(false)
    }
  }

  async function createReq() {
    if (!companyId || !canSubmit) return
    setPending(true)
    setError(null)
    try {
      await recruitmentApi.createRequisition(companyId, {
        department_id: departmentId || null,
        job_id: jobId || null,
        headcount: Number(headcount) || 1,
      })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setPending(false)
    }
  }

  const filtered = rows.filter((r) => (statusFilter ? r.status === statusFilter : true))

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>ATS modules</h3>
        <div className={styles.inline}>
          <Link to={`/company/${companyId}/recruitment/postings`}>Job postings</Link>
          <Link to={`/company/${companyId}/recruitment/pipeline`}>Pipeline</Link>
          <Link to={`/company/${companyId}/recruitment/interviews`}>Interviews</Link>
          <Link to={`/company/${companyId}/recruitment/offers`}>Offers</Link>
          <Link to={`/company/${companyId}/recruitment/candidate-portal`}>Candidate portal</Link>
        </div>
      </section>
      <section className={styles.card}>
        <h3 className={styles.h3}>Requisitions</h3>
        {error ? <p className={styles.error}>{error}</p> : null}
        {canSubmit ? (
          <div className={styles.inline}>
            <select className={styles.input} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select className={styles.input} value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">Job</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
            <input className={styles.input} type="number" min={1} value={headcount} onChange={(e) => setHeadcount(e.target.value)} />
            <button className={styles.btnSm} disabled={pending} onClick={() => void createReq()}>Create requisition</button>
            <select className={styles.input} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
            </select>
          </div>
        ) : null}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Headcount</th>
                <th>Workflow</th>
                {canSubmit ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canSubmit ? 5 : 4} className={styles.muted}>Loading requisitions…</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id}>
                  <td className={styles.muted}>{r.id.slice(0, 8)}…</td>
                  <td>{r.status}</td>
                  <td>{r.headcount}</td>
                  <td>
                    <Link
                      className={styles.linkBtn}
                      to={`/company/${companyId}/workflows?entity_type=requisition&entity_id=${encodeURIComponent(r.id)}`}
                    >
                      View workflow
                    </Link>
                  </td>
                  {canSubmit ? (
                    <td>
                      {r.status === 'draft' ? (
                        <button
                          type="button"
                          className={styles.btnSm}
                          disabled={pending}
                          onClick={() => void submitForApproval(r)}
                        >
                          Submit for approval
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 ? <p className={styles.muted}>No requisitions yet.</p> : null}
      </section>
    </div>
  )
}
