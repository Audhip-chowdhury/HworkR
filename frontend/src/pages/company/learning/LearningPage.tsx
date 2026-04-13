import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { createAssignment, createCompletion, createCourse, getSkillProfile, listAssignments, listCourses, upsertSkillProfile } from '../../../api/performanceLearningApi'
import styles from '../CompanyWorkspacePage.module.css'

type Tab = 'courses' | 'assignments' | 'skills'

export function LearningPage() {
  const { companyId = '' } = useParams()
  const [tab, setTab] = useState<Tab>('courses')
  const [courses, setCourses] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [courseTitle, setCourseTitle] = useState('')
  const [courseCategory, setCourseCategory] = useState('')
  const [courseMandatory, setCourseMandatory] = useState(false)
  const [skillEmployeeId, setSkillEmployeeId] = useState('')
  const [skillJson, setSkillJson] = useState('{}')
  const [loading, setLoading] = useState(true)
  const [pending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [c, a] = await Promise.all([listCourses(companyId), listAssignments(companyId)])
      setCourses(c)
      setAssignments(a)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load learning module')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [companyId])

  return (
    <div className={styles.org}>
      <div className={styles.tabBar}>
        <button className={`${styles.tabBtn} ${tab === 'courses' ? styles.tabBtnActive : ''}`} onClick={() => setTab('courses')}>Courses</button>
        <button className={`${styles.tabBtn} ${tab === 'assignments' ? styles.tabBtnActive : ''}`} onClick={() => setTab('assignments')}>Assignments</button>
        <button className={`${styles.tabBtn} ${tab === 'skills' ? styles.tabBtnActive : ''}`} onClick={() => setTab('skills')}>Skill profiles</button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}

      {tab === 'courses' ? <section className={styles.card}><h3 className={styles.h3}>Course catalog</h3><div className={styles.inline}><input className={styles.input} placeholder="Course title" value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} /><input className={styles.input} placeholder="Category" value={courseCategory} onChange={(e) => setCourseCategory(e.target.value)} /><label className={styles.radio}><input type="checkbox" checked={courseMandatory} onChange={(e) => setCourseMandatory(e.target.checked)} />Mandatory</label><button className={styles.btnSm} disabled={pending} onClick={() => void createCourse(companyId, { title: courseTitle || `Course ${Date.now()}`, category: courseCategory || null, mandatory: courseMandatory }).then(() => refresh())}>Create course</button></div>{loading ? <p className={styles.muted}>Loading courses…</p> : courses.map((c) => <p key={c.id} className={styles.muted}>{c.title} <span className={`${styles.badge} ${c.mandatory ? styles.badgeGreen : styles.badgeAmber}`}>{c.mandatory ? 'Mandatory' : 'Optional'}</span></p>)}</section> : null}
      {tab === 'assignments' ? <section className={styles.card}><h3 className={styles.h3}>Training assignments</h3><div className={styles.inline}><input className={styles.input} placeholder="Employee id" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} /><select className={styles.input}><option value="">Select course</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select><button className={styles.btnSm} disabled={pending || !courses[0] || !employeeId} onClick={() => void createAssignment(companyId, { employee_id: employeeId, course_id: courses[0]?.id }).then(() => refresh())}>Assign course</button></div>{assignments.map((a) => <p key={a.id} className={styles.muted}>{a.status} · due {a.due_date ?? '—'} <button className={styles.linkBtn} onClick={() => void createCompletion(companyId, { assignment_id: a.id }).then(() => refresh())}>Mark complete</button></p>)}{!loading && assignments.length === 0 ? <p className={styles.muted}>No assignments.</p> : null}</section> : null}
      {tab === 'skills' ? <section className={styles.card}><h3 className={styles.h3}>Skill profiles</h3><div className={styles.inline}><input className={styles.input} placeholder="Employee id" value={skillEmployeeId} onChange={(e) => setSkillEmployeeId(e.target.value)} /><button className={styles.btnSm} onClick={() => void getSkillProfile(companyId, skillEmployeeId).then((r) => setSkillJson(JSON.stringify(r.skills_json ?? {}, null, 2))).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load profile'))}>Load</button></div><textarea className={styles.input} style={{ minHeight: 160 }} value={skillJson} onChange={(e) => setSkillJson(e.target.value)} /><button className={styles.btnSm} onClick={() => void upsertSkillProfile(companyId, skillEmployeeId, JSON.parse(skillJson) as Record<string, unknown>).then(() => refresh()).catch((e) => setError(e instanceof Error ? e.message : 'Invalid JSON'))}>Save skills</button></section> : null}
    </div>
  )
}
