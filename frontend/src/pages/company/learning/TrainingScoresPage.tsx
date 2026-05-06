import { useCallback, useEffect, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import {
  learningEmployeeSuggestions,
  listCourseEmployeeScores,
  listCourses,
} from '../../../api/performanceLearningApi'
import type { Course, CourseEmployeeScoreRow, LearningEmployeeSuggestion } from '../../../api/performanceLearningApi'
import styles from '../CompanyWorkspacePage.module.css'

const HR_LD = new Set([
  'company_admin',
  'hr_ops',
  'ld_performance',
  'talent_acquisition',
  'compensation_analytics',
])

export function TrainingScoresPage() {
  const { companyId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { myCompanies } = useAuth()
  const role = myCompanies.find((c) => c.company.id === companyId)?.membership.role
  const isHr = role ? HR_LD.has(role) : false

  const [courses, setCourses] = useState<Course[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scores, setScores] = useState<CourseEmployeeScoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingScores, setLoadingScores] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<LearningEmployeeSuggestion[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)

  const refreshCourses = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const c = await listCourses(companyId)
      setCourses(c)
      setSelectedId((prev) => {
        if (!c.length) return null
        if (prev && c.some((x) => x.id === prev)) return prev
        return c[0]!.id
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  const loadScores = useCallback(async () => {
    if (!companyId || !selectedId) return
    setLoadingScores(true)
    setError(null)
    try {
      const q = search.trim()
      const rows = await listCourseEmployeeScores(companyId, selectedId, {
        employee_q: q.length >= 4 ? q : undefined,
        employee_id: selectedEmployeeId ?? undefined,
      })
      setScores(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load scores')
    } finally {
      setLoadingScores(false)
    }
  }, [companyId, selectedId, search, selectedEmployeeId])

  useEffect(() => {
    void refreshCourses()
  }, [refreshCourses])

  const courseIdFromUrl = searchParams.get('course')

  useEffect(() => {
    if (!courseIdFromUrl || courses.length === 0) return
    if (courses.some((c) => c.id === courseIdFromUrl)) {
      setSelectedId(courseIdFromUrl)
    }
  }, [courseIdFromUrl, courses])

  useEffect(() => {
    void loadScores()
  }, [loadScores])

  useEffect(() => {
    const q = search.trim()
    if (q.length < 4) {
      setSuggestions([])
      return
    }
    const t = window.setTimeout(() => {
      void learningEmployeeSuggestions(companyId, q)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
    }, 300)
    return () => window.clearTimeout(t)
  }, [search, companyId])

  if (!isHr) {
    return <Navigate to={`/company/${companyId}/learning/assignments`} replace />
  }

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>Courses</h3>
        <p className={styles.hint}>Select a course to view employee scores and completion status.</p>
        {error ? <p className={styles.error}>{error}</p> : null}
        {loading ? <p className={styles.muted}>Loading courses…</p> : null}
        {!loading && courses.length === 0 ? <p className={styles.muted}>No courses yet. Add one under Course catalog.</p> : null}
        {!loading && courses.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Course name</th>
                  <th>Points</th>
                  <th>Due date</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr
                    key={c.id}
                    className={selectedId === c.id ? styles.rowSelected : undefined}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedId(c.id)
                      setSelectedEmployeeId(null)
                      setSearch('')
                    }}
                  >
                    <td>{c.title}</td>
                    <td>{c.points ?? 0}</td>
                    <td>{c.due_date ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {selectedId ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Employee scores</h3>
          <div className={styles.inline} style={{ marginBottom: '0.75rem', alignItems: 'flex-end' }}>
            <label className={styles.labelBlock} style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              Search employee (type at least 4 characters for suggestions)
              <input
                className={styles.input}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setSelectedEmployeeId(null)
                }}
                placeholder="Name or employee code"
                autoComplete="off"
              />
              {suggestions.length > 0 && search.trim().length >= 4 ? (
                <ul
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '100%',
                    zIndex: 5,
                    margin: 0,
                    padding: '0.35rem 0',
                    listStyle: 'none',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    maxHeight: 200,
                    overflow: 'auto',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  }}
                >
                  {suggestions.map((s) => (
                    <li key={s.employee_id}>
                      <button
                        type="button"
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '0.4rem 0.65rem',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          font: 'inherit',
                        }}
                        onClick={() => {
                          setSelectedEmployeeId(s.employee_id)
                          setSearch(s.label)
                          setSuggestions([])
                        }}
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </label>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => {
                setSearch('')
                setSelectedEmployeeId(null)
              }}
            >
              Clear filter
            </button>
          </div>
          {loadingScores ? <p className={styles.muted}>Loading scores…</p> : null}
          {!loadingScores ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Code</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Overdue / didn&apos;t attend</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((r) => (
                    <tr key={r.employee_id}>
                      <td>{r.display_name}</td>
                      <td>{r.employee_code ?? '—'}</td>
                      <td>{r.score}</td>
                      <td>{r.status_label}</td>
                      <td>
                        {r.didnt_attend
                          ? "Didn't attend (past due)"
                          : r.overdue_before_due
                            ? 'Overdue'
                            : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {scores.length === 0 ? <p className={styles.muted}>No rows match this filter.</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
