import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import { createCourse, listCourses } from '../../../api/performanceLearningApi'
import type { Course } from '../../../api/performanceLearningApi'
import styles from '../CompanyWorkspacePage.module.css'

const HR_LD = new Set([
  'company_admin',
  'hr_ops',
  'ld_performance',
  'talent_acquisition',
  'compensation_analytics',
])

export function CourseCatalogPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const role = myCompanies.find((c) => c.company.id === companyId)?.membership.role
  const isHr = role ? HR_LD.has(role) : false

  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const [name, setName] = useState('')
  const [points, setPoints] = useState(10)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [dueDate, setDueDate] = useState('')

  const refresh = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const c = await listCourses(companyId)
      setCourses(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load courses')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!companyId || !name.trim()) return
    setPending(true)
    setError(null)
    try {
      await createCourse(companyId, {
        title: name.trim(),
        content_url: youtubeUrl.trim() || null,
        points,
        due_date: dueDate || null,
        mandatory: true,
      })
      setName('')
      setYoutubeUrl('')
      setDueDate('')
      setPoints(10)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create course')
    } finally {
      setPending(false)
    }
  }

  if (!isHr) {
    return <Navigate to={`/company/${companyId}/learning/assignments`} replace />
  }

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>Add course</h3>
        <p className={styles.hint}>
          New courses are assigned to <strong>all employees</strong> in the company. Points are awarded when an employee
          completes the training video.
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}
        <form onSubmit={onSubmit} className={styles.positionForm}>
          <label className={styles.labelBlock}>
            Course name
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Workplace safety orientation"
            />
          </label>
          <label className={styles.labelBlock}>
            Points
            <input
              className={styles.input}
              type="number"
              min={0}
              step={1}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
            />
          </label>
          <label className={styles.labelBlock}>
            YouTube video link
            <input
              className={styles.input}
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
            />
          </label>
          <label className={styles.labelBlock}>
            Due date
            <input
              className={styles.input}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          <button type="submit" className={styles.btnSm} disabled={pending}>
            {pending ? 'Creating…' : 'Create course'}
          </button>
        </form>
      </section>

      <section className={styles.card}>
        <h3 className={styles.h3}>Existing courses ({courses.length})</h3>
        {loading ? <p className={styles.muted}>Loading…</p> : null}
        {!loading && courses.length === 0 ? <p className={styles.muted}>No courses yet.</p> : null}
        {!loading && courses.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Course name</th>
                  <th>Points</th>
                  <th>YouTube link</th>
                  <th>Due date</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td>{c.title}</td>
                    <td>{c.points ?? 0}</td>
                    <td>
                      {c.content_url ? (
                        <a href={c.content_url} target="_blank" rel="noreferrer" className={styles.homeLink}>
                          Open
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{c.due_date ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
