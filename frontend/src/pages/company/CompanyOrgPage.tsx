import { FormEvent, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { useAuth, type Company } from '../../auth/AuthContext'
import { OrgHierarchyTree, type PositionNode } from './OrgHierarchyTree'
import styles from './CompanyWorkspacePage.module.css'
import orgStyles from './CompanyOrgPage.module.css'

type Dept = {
  id: string
  company_id: string
  name: string
  parent_id: string | null
  head_employee_id: string | null
  level: number
}

type Position = PositionNode

type Placement = 'department' | 'c_suite' | 'temporary'

export function CompanyOrgPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const entry = myCompanies.find((x) => x.company.id === companyId)
  const isAdmin = entry?.membership.role === 'company_admin'

  const [company, setCompany] = useState<Company | null>(null)
  const [depts, setDepts] = useState<Dept[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const [deptName, setDeptName] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [posName, setPosName] = useState('')
  const [placement, setPlacement] = useState<Placement>('department')
  const [departmentId, setDepartmentId] = useState('')
  const [grade, setGrade] = useState(50)
  const [reportsToId, setReportsToId] = useState('')
  const [worksWithId, setWorksWithId] = useState('')

  async function refresh() {
    if (!companyId) return
    setError(null)
    try {
      const c = await apiFetch<Company>(`/companies/${companyId}`)
      setCompany(c)
      const [d, pos] = await Promise.all([
        apiFetch<Dept[]>(`/companies/${companyId}/departments`),
        apiFetch<Position[]>(`/companies/${companyId}/positions`),
      ])
      setDepts(d)
      setPositions(pos)
      setDepartmentId((prev) => prev || d[0]?.id || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => {
    void refresh()
  }, [companyId])

  function resetPositionForm() {
    setEditingId(null)
    setPosName('')
    setPlacement('department')
    setGrade(50)
    setReportsToId('')
    setWorksWithId('')
    setDepartmentId(depts[0]?.id ?? '')
  }

  useEffect(() => {
    if (!editingId && depts.length && !departmentId) setDepartmentId(depts[0].id)
  }, [depts, editingId, departmentId])

  function startEdit(p: Position) {
    setEditingId(p.id)
    setPosName(p.name)
    setGrade(p.grade)
    setReportsToId(p.reports_to_id ?? '')
    setWorksWithId(p.works_with_id ?? '')
    if (p.bucket === 'c_suite') {
      setPlacement('c_suite')
      setDepartmentId(depts[0]?.id ?? '')
    } else if (p.bucket === 'temporary') {
      setPlacement('temporary')
      setDepartmentId(depts[0]?.id ?? '')
    } else {
      setPlacement('department')
      setDepartmentId(p.department_id ?? depts[0]?.id ?? '')
    }
  }

  async function onSubmitPosition(e: FormEvent) {
    e.preventDefault()
    if (!companyId || !isAdmin) return
    const name = posName.trim()
    if (!name) return

    setPending(true)
    setError(null)
    try {
      const base = {
        name,
        grade: Number(grade),
        reports_to_id: reportsToId || null,
        works_with_id: worksWithId || null,
      }
      if (placement === 'department') {
        if (!departmentId) {
          setError('Select a department')
          setPending(false)
          return
        }
        await (editingId
          ? apiFetch<Position>(`/companies/${companyId}/positions/${editingId}`, {
              method: 'PATCH',
              json: {
                ...base,
                department_id: departmentId,
                bucket: 'none',
              },
            })
          : apiFetch<Position>(`/companies/${companyId}/positions`, {
              method: 'POST',
              json: {
                ...base,
                department_id: departmentId,
                bucket: 'none',
              },
            }))
      } else {
        await (editingId
          ? apiFetch<Position>(`/companies/${companyId}/positions/${editingId}`, {
              method: 'PATCH',
              json: {
                ...base,
                department_id: null,
                bucket: placement === 'c_suite' ? 'c_suite' : 'temporary',
              },
            })
          : apiFetch<Position>(`/companies/${companyId}/positions`, {
              method: 'POST',
              json: {
                ...base,
                department_id: null,
                bucket: placement === 'c_suite' ? 'c_suite' : 'temporary',
              },
            }))
      }
      resetPositionForm()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setPending(false)
    }
  }

  async function removePosition(id: string) {
    if (!companyId || !confirm('Delete this position?')) return
    setPending(true)
    try {
      await apiFetch(`/companies/${companyId}/positions/${id}`, { method: 'DELETE' })
      if (editingId === id) resetPositionForm()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setPending(false)
    }
  }

  async function addDept(e: FormEvent) {
    e.preventDefault()
    if (!companyId) return
    setPending(true)
    try {
      await apiFetch(`/companies/${companyId}/departments`, {
        method: 'POST',
        json: { name: deptName, parent_id: null, head_employee_id: null, level: 0 },
      })
      setDeptName('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setPending(false)
    }
  }

  function positionLabel(p: Position): string {
    return p.name
  }

  const reportOptions = positions.filter((p) => p.id !== editingId)
  const worksOptions = positions.filter((p) => p.id !== editingId)

  const displayCompany = company?.name ?? entry?.company.name ?? 'Company'

  return (
    <>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={`${styles.orgLayout} ${orgStyles.orgLayoutWideTree}`}>
        <div className={`${styles.orgMain} ${orgStyles.orgMainCompact}`}>
          <p className={styles.flowHint}>
            <strong>Departments</strong> group positions. <strong>Positions</strong> can sit in a
            department, or in <strong>C-suite</strong> / <strong>Temporary</strong> (not tied to a
            department). Set <strong>grade</strong> (lower = more senior) and <strong>Reports to</strong>{' '}
            to build the chart; optional <strong>Works with</strong> for peers.
          </p>

          <section className={styles.card}>
            <h3 className={styles.h3}>Departments ({depts.length})</h3>
            {depts.length === 0 ? (
              <div className={orgStyles.deptEmpty}>No departments yet. Add your first department below.</div>
            ) : (
              <div className={orgStyles.deptGrid}>
                {depts.map((d) => (
                  <article key={d.id} className={orgStyles.deptTile}>
                    <div className={orgStyles.deptTileName}>{d.name}</div>
                    <div className={orgStyles.deptTileMeta}>Level {d.level}</div>
                  </article>
                ))}
              </div>
            )}
            {isAdmin ? (
              <form onSubmit={addDept} className={styles.inline}>
                <input
                  className={styles.input}
                  placeholder="Department name"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  required
                />
                <button type="submit" className={styles.btnSm} disabled={pending}>
                  Add
                </button>
              </form>
            ) : null}
          </section>

          <section className={styles.card}>
            <h3 className={styles.h3}>Positions ({positions.length})</h3>
            {isAdmin ? (
              <form onSubmit={onSubmitPosition} className={styles.positionForm}>
                <div className={styles.formRow}>
                  <label className={styles.labelBlock}>
                    Name
                    <input
                      className={styles.input}
                      value={posName}
                      onChange={(e) => setPosName(e.target.value)}
                      required
                      placeholder="e.g. Senior Recruiter, CEO"
                    />
                  </label>
                </div>
                <div className={styles.formRow}>
                  <span className={styles.labelBlock}>Placement</span>
                  <div className={orgStyles.pillGroup}>
                    <label
                      className={`${orgStyles.pillOption} ${placement === 'department' ? orgStyles.pillOptionActive : ''}`}
                    >
                      <input
                        className={orgStyles.pillInput}
                        type="radio"
                        name="placement"
                        checked={placement === 'department'}
                        onChange={() => setPlacement('department')}
                      />
                      Department
                    </label>
                    <label
                      className={`${orgStyles.pillOption} ${placement === 'c_suite' ? orgStyles.pillOptionActive : ''}`}
                    >
                      <input
                        className={orgStyles.pillInput}
                        type="radio"
                        name="placement"
                        checked={placement === 'c_suite'}
                        onChange={() => setPlacement('c_suite')}
                      />
                      C-suite
                    </label>
                    <label
                      className={`${orgStyles.pillOption} ${placement === 'temporary' ? orgStyles.pillOptionActive : ''}`}
                    >
                      <input
                        className={orgStyles.pillInput}
                        type="radio"
                        name="placement"
                        checked={placement === 'temporary'}
                        onChange={() => setPlacement('temporary')}
                      />
                      Temporary
                    </label>
                  </div>
                </div>
                {placement === 'department' ? (
                  <label className={styles.labelBlock}>
                    Department
                    <span className={orgStyles.selectWrap}>
                      <select
                        className={`${styles.input} ${orgStyles.prettySelect}`}
                        value={departmentId}
                        onChange={(e) => setDepartmentId(e.target.value)}
                        required
                      >
                        {depts.length === 0 ? (
                          <option value="">Add a department first</option>
                        ) : (
                          depts.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))
                        )}
                      </select>
                    </span>
                  </label>
                ) : null}
                <label className={styles.labelBlock}>
                  Grade (lower = more senior)
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    max={999999}
                    value={grade}
                    onChange={(e) => setGrade(Number(e.target.value))}
                  />
                </label>
                <label className={styles.labelBlock}>
                  Reports to
                  <span className={orgStyles.selectWrap}>
                    <select
                      className={`${styles.input} ${orgStyles.prettySelect}`}
                      value={reportsToId}
                      onChange={(e) => setReportsToId(e.target.value)}
                    >
                      <option value="">— None (root) —</option>
                      {reportOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {positionLabel(p)}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
                <label className={styles.labelBlock}>
                  Works with
                  <span className={orgStyles.selectWrap}>
                    <select
                      className={`${styles.input} ${orgStyles.prettySelect}`}
                      value={worksWithId}
                      onChange={(e) => setWorksWithId(e.target.value)}
                    >
                      <option value="">— None —</option>
                      {worksOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {positionLabel(p)}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
                <div className={styles.formActions}>
                  <button type="submit" className={styles.btnSm} disabled={pending}>
                    {editingId ? 'Save position' : 'Add position'}
                  </button>
                  {editingId ? (
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => resetPositionForm()}
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Placement</th>
                    <th>Grade</th>
                    <th>Reports to</th>
                    <th>Works with</th>
                    {isAdmin ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {positions.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 6 : 5} className={styles.muted}>
                        No positions yet.
                      </td>
                    </tr>
                  ) : (
                    positions.map((p) => {
                      const reports = p.reports_to_id
                        ? positions.find((x) => x.id === p.reports_to_id)
                        : null
                      const works = p.works_with_id
                        ? positions.find((x) => x.id === p.works_with_id)
                        : null
                      const place =
                        p.bucket === 'c_suite'
                          ? 'C-suite'
                          : p.bucket === 'temporary'
                            ? 'Temporary'
                            : p.department_name ?? '—'
                      return (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td>{place}</td>
                          <td>{p.grade}</td>
                          <td>{reports ? reports.name : '—'}</td>
                          <td>{works ? works.name : '—'}</td>
                          {isAdmin ? (
                            <td className={styles.tableCellActions}>
                              <button
                                type="button"
                                className={styles.linkBtn}
                                onClick={() => startEdit(p)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className={styles.linkDanger}
                                onClick={() => void removePosition(p.id)}
                              >
                                Delete
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className={`${styles.orgAside} ${orgStyles.orgTreePane}`}>
          <div className={`${styles.chartCard} ${orgStyles.orgTreeCard}`}>
            <OrgHierarchyTree companyName={displayCompany} positions={positions} />
          </div>
        </aside>
      </div>
    </>
  )
}
