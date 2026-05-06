import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as recruitmentApi from '../../../api/recruitmentApi'
import { apiFetch } from '../../../api/client'
import { useAuth } from '../../../auth/AuthContext'
import type { HiringCriteria, Requisition } from '../../../api/types'
import styles from '../CompanyWorkspacePage.module.css'

const TA_ROLES = new Set(['company_admin', 'talent_acquisition'])

function parseSkillsInput(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function formatCriteriaCells(hc: HiringCriteria | null | undefined): { skills: string; experience: string; education: string } {
  if (!hc) {
    return { skills: '—', experience: '—', education: '—' }
  }
  const skills =
    hc.skills?.length > 0
      ? hc.skills.slice(0, 4).join(', ') + (hc.skills.length > 4 ? '…' : '')
      : '—'
  const clip = (s: string | null, n: number) => {
    if (!s?.trim()) return '—'
    const t = s.trim()
    return t.length > n ? `${t.slice(0, n)}…` : t
  }
  return {
    skills,
    experience: clip(hc.experience, 56),
    education: clip(hc.education, 56),
  }
}

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
  const [skillsText, setSkillsText] = useState('')
  const [experience, setExperience] = useState('')
  const [education, setEducation] = useState('')
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
    if (!confirm(`Submit requisition ${req.req_code ?? req.id.slice(0, 8)} for approval?`)) return
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

  async function createReq(e?: FormEvent) {
    e?.preventDefault()
    if (!companyId || !canSubmit) return
    setPending(true)
    setError(null)
    try {
      const skills = parseSkillsInput(skillsText)
      const hiring_criteria: HiringCriteria = {
        skills,
        experience: experience.trim() || null,
        education: education.trim() || null,
      }
      await recruitmentApi.createRequisition(companyId, {
        department_id: departmentId || null,
        job_id: jobId || null,
        headcount: Number(headcount) || 1,
        hiring_criteria,
      })
      setSkillsText('')
      setExperience('')
      setEducation('')
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
      <div className={styles.moduleNav}>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment/postings`}>Job postings</Link>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment/pipeline`}>Pipeline</Link>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment/interviews`}>Interviews</Link>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment/offers`}>Offers</Link>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment/candidate-portal`}>Candidate portal</Link>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment/tracking`}>Tracking</Link>
      </div>
      <section className={styles.card}>
        <h3 className={styles.h3}>Requisitions</h3>
        {error ? <p className={styles.error}>{error}</p> : null}
        {canSubmit ? (
          <form
            className={styles.reqForm}
            onSubmit={(e) => void createReq(e)}
            noValidate
          >
            <fieldset className={styles.reqFieldset}>
              <legend className={styles.reqLegend}>New requisition</legend>

              <div className={styles.reqSection}>
                <h4 className={styles.h4}>Role and department</h4>
                <div className={styles.reqFormGrid}>
                  <label className={styles.labelBlock} htmlFor="req-department">
                    Department
                    <select
                      id="req-department"
                      className={styles.input}
                      style={{ width: '100%' }}
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                    >
                      <option value="">Select department</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                  <label className={styles.labelBlock} htmlFor="req-job">
                    Job profile
                    <select
                      id="req-job"
                      className={styles.input}
                      style={{ width: '100%' }}
                      value={jobId}
                      onChange={(e) => setJobId(e.target.value)}
                    >
                      <option value="">Select job</option>
                      {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                    </select>
                  </label>
                  <label className={styles.labelBlock} htmlFor="req-headcount">
                    Headcount
                    <input
                      id="req-headcount"
                      className={styles.input}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={headcount}
                      onChange={(e) => setHeadcount(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className={styles.reqSection}>
                <h4 className={styles.h4}>Hiring criteria</h4>
                <label className={styles.labelBlock} htmlFor="req-skills">
                  Required skills
                  <textarea
                    id="req-skills"
                    className={styles.input}
                    style={{ minHeight: 88, width: '100%' }}
                    placeholder="e.g. Python, SQL, stakeholder communication"
                    value={skillsText}
                    onChange={(e) => setSkillsText(e.target.value)}
                    aria-describedby="req-skills-hint"
                  />
                  <p id="req-skills-hint" className={styles.reqHint}>
                    Separate skills with commas or put one skill per line.
                  </p>
                </label>
                <label className={styles.labelBlock} htmlFor="req-experience">
                  Experience
                  <input
                    id="req-experience"
                    className={styles.input}
                    style={{ width: '100%' }}
                    placeholder="e.g. 3-5 years in HR ops"
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                  />
                </label>
                <label className={styles.labelBlock} htmlFor="req-education">
                  Education
                  <input
                    id="req-education"
                    className={styles.input}
                    style={{ width: '100%' }}
                    placeholder="e.g. Bachelor's in HR or related field"
                    value={education}
                    onChange={(e) => setEducation(e.target.value)}
                  />
                </label>
              </div>

              <div className={styles.formActions} style={{ marginTop: '1rem' }}>
                <button className={styles.btnSm} type="submit" disabled={pending}>
                  {pending ? 'Creating…' : 'Create requisition'}
                </button>
              </div>
            </fieldset>
          </form>
        ) : null}

        <div className={styles.reqToolbar}>
          <label className={styles.labelInline} htmlFor="req-status-filter">
            <span>Filter list by status</span>
            <select
              id="req-status-filter"
              className={styles.input}
              style={{ minWidth: 200 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
            </select>
          </label>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Req ID</th>
                <th>Status</th>
                <th>Headcount</th>
                <th>Skills</th>
                <th>Experience</th>
                <th>Education</th>
                <th>Workflow</th>
                {canSubmit ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canSubmit ? 8 : 7} className={styles.muted}>Loading requisitions…</td></tr>
              ) : filtered.map((r) => {
                const cells = formatCriteriaCells(r.hiring_criteria)
                return (
                <tr key={r.id}>
                  <td className={styles.muted} title={r.id}>
                    {r.req_code ?? '—'}
                  </td>
                  <td>{r.status}</td>
                  <td>{r.headcount}</td>
                  <td className={styles.muted}>{cells.skills}</td>
                  <td className={styles.muted}>{cells.experience}</td>
                  <td className={styles.muted}>{cells.education}</td>
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
              )})}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 ? <p className={styles.muted}>No requisitions yet.</p> : null}
      </section>
    </div>
  )
}
