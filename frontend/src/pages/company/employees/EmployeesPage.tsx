import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import { apiFetch } from '../../../api/client'
import {
  createEmployee,
  getEmployeeDetail,
  listEmployeeSummaries,
  listLifecycleEvents,
  type EmployeeDetail,
  type EmployeeDocumentRow,
  type EmployeeSummary,
  type LifecycleEvent,
} from '../../../api/employeesApi'
import { EmployeeHrPanels } from './EmployeeHrPanels'
import { listPositions, type Department, type Position } from '../../../api/organizationApi'
import styles from '../CompanyWorkspacePage.module.css'

type JobRow = { id: string; title: string }
type EmergencyRow = { name: string; phone: string; relation: string }

function docLabel(docType: string): string {
  if (docType === 'photo') return 'Photo'
  if (docType === 'gov_id' || docType === 'id_proof') return 'Government-approved ID'
  if (docType === 'gov_id_2') return 'Additional government ID'
  if (docType === 'offer_letter') return 'Offer letter'
  return docType
}

function docActionKind(doc: EmployeeDocumentRow): 'image' | 'pdf' | null {
  if (doc.status !== 'submitted' || !doc.file_url) return null
  if (doc.doc_type === 'offer_letter') return 'pdf'
  if (doc.doc_type === 'gov_id_2') return 'image'
  const kind =
    doc.meta_json && typeof doc.meta_json === 'object' && 'kind' in doc.meta_json
      ? String((doc.meta_json as Record<string, unknown>).kind)
      : ''
  if (kind === 'pdf') return 'pdf'
  return 'image'
}

function parseEmergencyContacts(pi: Record<string, unknown> | null): EmergencyRow[] {
  if (!pi) return []
  const raw = pi.emergencyContacts
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((x) => {
      const o = x as Record<string, unknown>
      return {
        name: String(o.name ?? ''),
        phone: String(o.phone ?? ''),
        relation: String(o.relation ?? ''),
      }
    })
  }
  const legacy = String(pi.emergencyContact ?? '').trim()
  if (legacy) return [{ name: legacy, phone: '', relation: '' }]
  return []
}

function dash(s: string | null | undefined): string {
  const t = (s ?? '').trim()
  return t || '—'
}

export function EmployeesProfilePage() {
  return <EmployeesPage variant="profile" />
}

export function EmployeesLifecyclePage() {
  return <EmployeesPage variant="lifecycle" />
}

type EmployeesPageProps = { variant: 'profile' | 'lifecycle' }

function EmployeesPage({ variant }: EmployeesPageProps) {
  const { companyId = '' } = useParams<{ companyId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('id') ?? ''
  const { myCompanies } = useAuth()
  const role = myCompanies.find((x) => x.company.id === companyId)?.membership.role ?? ''
  const canCreate = role === 'company_admin' || role === 'hr_ops'

  const [summaries, setSummaries] = useState<EmployeeSummary[]>([])
  const [detail, setDetail] = useState<EmployeeDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [listLoading, setListLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [lifecycleEvents, setLifecycleEvents] = useState<LifecycleEvent[]>([])
  const [lifecycleLoading, setLifecycleLoading] = useState(false)
  const [q, setQ] = useState('')

  const [depts, setDepts] = useState<Department[]>([])
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [code, setCode] = useState('EMP-')
  const [status, setStatus] = useState('active')
  const [hireDate, setHireDate] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [jobId, setJobId] = useState('')
  const [pending, setPending] = useState(false)

  const refreshList = useCallback(async () => {
    if (!companyId) return
    setListLoading(true)
    setError(null)
    try {
      const sum = await listEmployeeSummaries(companyId)
      setSummaries(sum)
      if (canCreate) {
        const [departments, jobCatalog] = await Promise.all([
          apiFetch<Department[]>(`/companies/${companyId}/departments`),
          apiFetch<JobRow[]>(`/companies/${companyId}/job-catalog`),
        ])
        setDepts(departments)
        setJobs(jobCatalog)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load employees')
    } finally {
      setListLoading(false)
    }
  }, [companyId, canCreate])

  const loadDetail = useCallback(
    async (id: string) => {
      if (!companyId || !id) {
        setDetail(null)
        return
      }
      setDetailLoading(true)
      setError(null)
      try {
        const d = await getEmployeeDetail(companyId, id)
        setDetail(d)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load employee')
        setDetail(null)
      } finally {
        setDetailLoading(false)
      }
    },
    [companyId],
  )

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId, loadDetail])

  useEffect(() => {
    if (!companyId || !departmentId) {
      setPositions([])
      setPositionId('')
      return
    }
    let cancelled = false
    void listPositions(companyId, departmentId)
      .then((rows) => {
        if (!cancelled) setPositions(rows)
      })
      .catch(() => {
        if (!cancelled) setPositions([])
      })
    return () => {
      cancelled = true
    }
  }, [companyId, departmentId])

  useEffect(() => {
    if (variant !== 'lifecycle' || !companyId || !selectedId) {
      setLifecycleEvents([])
      setLifecycleLoading(false)
      return
    }
    setLifecycleLoading(true)
    void listLifecycleEvents(companyId, selectedId)
      .then(setLifecycleEvents)
      .catch(() => setLifecycleEvents([]))
      .finally(() => setLifecycleLoading(false))
  }, [companyId, selectedId, variant])

  function selectEmployee(id: string) {
    setSearchParams(id ? { id } : {})
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!companyId || !canCreate) return
    setPending(true)
    setError(null)
    try {
      if (departmentId) {
        if (positions.length > 0 && !positionId) {
          setError('Select a position (designation) for this department, or add positions under Company → Org.')
          setPending(false)
          return
        }
      }
      await createEmployee(companyId, {
        employee_code: code,
        status,
        hire_date: hireDate || null,
        department_id: departmentId || null,
        position_id: positionId || null,
        job_id: jobId || null,
      })
      setCode('EMP-')
      setStatus('active')
      setHireDate('')
      setDepartmentId('')
      setPositionId('')
      setJobId('')
      await refreshList()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create employee')
    } finally {
      setPending(false)
    }
  }

  const filtered = useMemo(() => {
    const qq = q.toLowerCase()
    return summaries.filter(
      (s) =>
        !qq ||
        s.employee_code.toLowerCase().includes(qq) ||
        s.display_name.toLowerCase().includes(qq) ||
        s.display_email.toLowerCase().includes(qq),
    )
  }, [q, summaries])

  const pageHint =
    variant === 'profile'
      ? 'New hires appear here after offer acceptance and employee onboarding. This view is read-only — select someone to see their profile. Employees update their own details after login. Missing documents trigger inbox tasks when the employee is linked to a user account.'
      : 'Select an employee to record and review onboarding, transfers, promotions, terminations, and rehires. History is stored as explicit lifecycle events (not inferred from profile edits).'

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>
          {variant === 'profile' ? 'Employee profile management' : 'Lifecycle events'}
        </h3>
        <p className={styles.hint}>{pageHint}</p>
        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.employeesSplit}>
          <div className={styles.employeesListPane}>
            <input
              className={styles.input}
              placeholder="Search by ID, name, or email"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ marginBottom: '0.75rem' }}
            />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Name</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {listLoading ? (
                    <tr>
                      <td colSpan={3} className={styles.muted}>
                        Loading…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={3} className={styles.muted}>
                        No employees found.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((s) => (
                      <tr
                        key={s.id}
                        className={selectedId === s.id ? styles.rowSelected : undefined}
                        onClick={() => selectEmployee(s.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>{s.employee_code}</td>
                        <td>{s.display_name}</td>
                        <td>{s.display_email}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.employeesDetailPane}>
            {!selectedId ? (
              <p className={styles.muted}>Select an employee from the list.</p>
            ) : detailLoading ? (
              <p className={styles.muted}>Loading employee…</p>
            ) : !detail ? (
              <p className={styles.muted}>Could not load this employee.</p>
            ) : (
              <>
                <h4 className={styles.employeesDetailTitle}>{detail.display_name}</h4>
                <p className={styles.hint}>
                  Code: {detail.employee_code}
                  {variant === 'profile' && !detail.user_id ? (
                    <span> — No login user linked (inbox document tasks won’t apply until a user is linked to this record).</span>
                  ) : null}
                </p>

                {variant === 'profile' ? (
                  <>
                    <div className={styles.employeesSection}>
                      <h5 className={styles.employeesSectionHeading}>Personal info</h5>
                      <ReadOnlyDetail
                        label="Full name"
                        value={dash(String((detail.personal_info_json as Record<string, unknown> | null)?.fullName ?? detail.display_name))}
                      />
                      <ReadOnlyDetail
                        label="Date of birth"
                        value={dash(String((detail.personal_info_json as Record<string, unknown> | null)?.dob ?? '').slice(0, 10))}
                      />
                      <ReadOnlyDetail
                        label="Personal email"
                        value={dash(String((detail.personal_info_json as Record<string, unknown> | null)?.personalEmail ?? ''))}
                      />
                      <ReadOnlyDetail label="Contact" value={dash(String((detail.personal_info_json as Record<string, unknown> | null)?.phone ?? ''))} />
                      <ReadOnlyDetail
                        label="Address"
                        value={dash(String((detail.personal_info_json as Record<string, unknown> | null)?.address ?? ''))}
                      />
                      <div className={styles.hint} style={{ marginTop: '0.75rem' }}>
                        Emergency contacts
                      </div>
                      {parseEmergencyContacts((detail.personal_info_json ?? null) as Record<string, unknown> | null).length === 0 ? (
                        <p className={styles.muted}>—</p>
                      ) : (
                        <ul className={styles.ul} style={{ marginTop: '0.35rem' }}>
                          {parseEmergencyContacts((detail.personal_info_json ?? null) as Record<string, unknown> | null).map((row, i) => (
                            <li key={i}>
                              {dash(row.name)}
                              {row.phone ? ` · ${row.phone}` : ''}
                              {row.relation ? ` (${row.relation})` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className={styles.employeesSection}>
                      <h5 className={styles.employeesSectionHeading}>Job info</h5>
                      <ReadOnlyDetail label="Title" value={dash(detail.job_title)} />
                      <ReadOnlyDetail label="Grade" value={dash(detail.job_grade)} />
                      <ReadOnlyDetail label="Department" value={dash(detail.department_name)} />
                      <ReadOnlyDetail label="Manager" value={dash(detail.manager_name)} />
                      <ReadOnlyDetail label="Location" value={dash(detail.location_name)} />
                      <ReadOnlyDetail label="Employment status" value={dash(detail.status)} />
                      <ReadOnlyDetail label="Start date" value={dash(detail.hire_date)} />
                    </div>

                    <div className={styles.employeesSection}>
                      <h5 className={styles.employeesSectionHeading}>Document management</h5>
                      <div className={styles.tableWrap}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>Document</th>
                              <th>Status</th>
                              <th>File</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.documents.length === 0 ? (
                              <tr>
                                <td colSpan={3} className={styles.muted}>
                                  No document rows.
                                </td>
                              </tr>
                            ) : (
                              detail.documents.map((doc) => {
                                const kind = docActionKind(doc)
                                return (
                                  <tr key={doc.id}>
                                    <td>{docLabel(doc.doc_type)}</td>
                                    <td>{doc.status === 'submitted' ? 'Submitted' : 'Not submitted'}</td>
                                    <td>
                                      {kind === 'image' && doc.file_url ? (
                                        <a
                                          href={doc.file_url}
                                          className={styles.docLink}
                                          onClick={(e) => {
                                            e.preventDefault()
                                            setPreviewUrl(doc.file_url)
                                          }}
                                        >
                                          View
                                        </a>
                                      ) : kind === 'pdf' && doc.file_url ? (
                                        <a
                                          href={doc.file_url}
                                          className={styles.docLink}
                                          download
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          Download
                                        </a>
                                      ) : (
                                        <span className={styles.muted}>—</span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                      <p className={styles.hint}>
                        Employees see tasks in Inbox when a document is not submitted and their record is linked to a user account. Uploads are done from My profile.
                      </p>
                    </div>
                  </>
                ) : (
                  <EmployeeHrPanels
                    companyId={companyId}
                    employeeId={detail.id}
                    detail={detail}
                    lifecycleEvents={lifecycleEvents}
                    lifecycleLoading={lifecycleLoading}
                    onRefreshDetail={() => loadDetail(selectedId)}
                    onRefreshLifecycle={() => listLifecycleEvents(companyId, selectedId).then(setLifecycleEvents)}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {variant === 'profile' && previewUrl ? (
        <div className={styles.docPreviewBackdrop} role="presentation" onClick={() => setPreviewUrl(null)}>
          <div className={styles.docPreviewModal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.docPreviewClose} aria-label="Close preview" onClick={() => setPreviewUrl(null)}>
              ×
            </button>
            <img src={previewUrl} alt="Document preview" />
          </div>
        </div>
      ) : null}

      {canCreate ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Create employee</h3>
          <form className={styles.positionForm} onSubmit={onCreate}>
            <label className={styles.labelBlock}>
              Employee code
              <input className={styles.input} value={code} onChange={(e) => setCode(e.target.value)} required />
            </label>
            <div className={styles.formRow}>
              <label className={styles.labelBlock}>
                Status
                <select className={styles.input} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_leave">On leave</option>
                </select>
              </label>
              <label className={styles.labelBlock}>
                Hire date
                <input type="date" className={styles.input} value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.labelBlock}>
                Department
                <select
                  className={styles.input}
                  value={departmentId}
                  onChange={(e) => {
                    setDepartmentId(e.target.value)
                    setPositionId('')
                  }}
                >
                  <option value="">Unassigned</option>
                  {depts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.labelBlock}>
                Position (designation)
                <select className={styles.input} value={positionId} onChange={(e) => setPositionId(e.target.value)} disabled={!departmentId}>
                  <option value="">{departmentId ? 'Select position' : 'Select a department first'}</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {departmentId && positions.length === 0 ? (
              <p className={styles.muted}>No positions for this department yet. Create them under Company → Org chart / Positions.</p>
            ) : null}
            <div className={styles.formRow}>
              <label className={styles.labelBlock}>
                Job catalog
                <select className={styles.input} value={jobId} onChange={(e) => setJobId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" className={styles.btnSm} disabled={pending}>
              {pending ? 'Creating…' : 'Create employee'}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  )
}

function ReadOnlyDetail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: '0.65rem' }}>
      <div className={styles.hint} style={{ marginBottom: '0.15rem' }}>
        {label}
      </div>
      <div style={{ lineHeight: 1.45 }}>{value}</div>
    </div>
  )
}
