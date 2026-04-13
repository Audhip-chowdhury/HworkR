import { useEffect, useState } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import { useParams } from 'react-router-dom'
import { createLifecycleEvent, getEmployee, listLifecycleEvents, updateEmployee, updateOnboardingChecklist, type Employee, type LifecycleEvent } from '../../../api/employeesApi'
import styles from '../CompanyWorkspacePage.module.css'

type Tab = 'profile' | 'job' | 'lifecycle' | 'onboarding'

export function EmployeeDetailPage() {
  const { companyId = '', employeeId = '' } = useParams()
  const { myCompanies } = useAuth()
  const role = myCompanies.find((x) => x.company.id === companyId)?.membership.role ?? ''
  const canEdit = role === 'company_admin' || role === 'hr_ops'
  const [tab, setTab] = useState<Tab>('profile')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [events, setEvents] = useState<LifecycleEvent[]>([])
  const [status, setStatus] = useState('active')
  const [hireDate, setHireDate] = useState('')
  const [eventType, setEventType] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventNotes, setEventNotes] = useState('')
  const [checklistText, setChecklistText] = useState('{}')

  async function refresh() {
    if (!companyId || !employeeId) return
    setLoading(true)
    setError(null)
    try {
      const [emp, lifecycle] = await Promise.all([
        getEmployee(companyId, employeeId),
        listLifecycleEvents(companyId, employeeId),
      ])
      setEmployee(emp)
      setStatus(emp.status)
      setHireDate(emp.hire_date ?? '')
      setChecklistText(JSON.stringify(emp.onboarding_checklist_json ?? {}, null, 2))
      setEvents(lifecycle)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load employee')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [companyId, employeeId])

  async function saveJobInfo() {
    if (!canEdit || !employee) return
    setPending(true)
    setError(null)
    try {
      const next = await updateEmployee(companyId, employee.id, {
        status,
        hire_date: hireDate || null,
      })
      setEmployee(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update employee')
    } finally {
      setPending(false)
    }
  }

  async function addLifecycleEvent() {
    if (!canEdit || !eventType.trim()) return
    setPending(true)
    setError(null)
    try {
      const row = await createLifecycleEvent(companyId, employeeId, {
        event_type: eventType.trim(),
        effective_date: eventDate || null,
        notes: eventNotes || null,
      })
      setEvents((prev) => [row, ...prev])
      setEventType('')
      setEventDate('')
      setEventNotes('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create lifecycle event')
    } finally {
      setPending(false)
    }
  }

  async function saveChecklist() {
    if (!canEdit) return
    setPending(true)
    setError(null)
    try {
      const payload = JSON.parse(checklistText) as Record<string, unknown>
      const next = await updateOnboardingChecklist(companyId, employeeId, payload)
      setEmployee(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid checklist JSON')
    } finally {
      setPending(false)
    }
  }

  if (loading) return <p className={styles.muted}>Loading employee…</p>
  if (error && !employee) return <p className={styles.error}>{error}</p>
  if (!employee) return <p className={styles.muted}>Employee not found.</p>

  return (
    <div className={styles.org}>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.tabBar}>
        <button className={`${styles.tabBtn} ${tab === 'profile' ? styles.tabBtnActive : ''}`} onClick={() => setTab('profile')}>Profile</button>
        <button className={`${styles.tabBtn} ${tab === 'job' ? styles.tabBtnActive : ''}`} onClick={() => setTab('job')}>Job info</button>
        <button className={`${styles.tabBtn} ${tab === 'lifecycle' ? styles.tabBtnActive : ''}`} onClick={() => setTab('lifecycle')}>Lifecycle</button>
        <button className={`${styles.tabBtn} ${tab === 'onboarding' ? styles.tabBtnActive : ''}`} onClick={() => setTab('onboarding')}>Onboarding</button>
      </div>

      <section className={styles.card}>
        {tab === 'profile' ? (
          <>
            <h3 className={styles.h3}>Employee profile</h3>
            <p>Employee code: {employee.employee_code}</p>
            <p>Department: {employee.department_id ?? 'Unassigned'}</p>
            <p>Job: {employee.job_id ?? 'Unassigned'}</p>
            <p>Manager: {employee.manager_id ?? 'Unassigned'}</p>
            <p>Location: {employee.location_id ?? 'Unassigned'}</p>
          </>
        ) : null}
        {tab === 'job' ? (
          <>
            <h3 className={styles.h3}>Job info</h3>
            <label className={styles.labelBlock}>
              Status
              <input className={styles.input} value={status} onChange={(e) => setStatus(e.target.value)} disabled={!canEdit} />
            </label>
            <label className={styles.labelBlock}>
              Hire date
              <input type="date" className={styles.input} value={hireDate} onChange={(e) => setHireDate(e.target.value)} disabled={!canEdit} />
            </label>
            {canEdit ? <button className={styles.btnSm} disabled={pending} onClick={() => void saveJobInfo()}>{pending ? 'Saving…' : 'Save job info'}</button> : null}
          </>
        ) : null}
        {tab === 'lifecycle' ? (
          <>
            <h3 className={styles.h3}>Lifecycle events</h3>
            {canEdit ? (
              <div className={styles.positionForm}>
                <input className={styles.input} placeholder="Event type" value={eventType} onChange={(e) => setEventType(e.target.value)} />
                <input className={styles.input} type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                <input className={styles.input} placeholder="Notes" value={eventNotes} onChange={(e) => setEventNotes(e.target.value)} />
                <button className={styles.btnSm} disabled={pending} onClick={() => void addLifecycleEvent()}>Add event</button>
              </div>
            ) : null}
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Type</th><th>Date</th><th>Status</th><th>Notes</th></tr></thead>
                <tbody>
                  {events.length === 0 ? <tr><td className={styles.muted} colSpan={4}>No lifecycle events yet.</td></tr> : null}
                  {events.map((e) => <tr key={e.id}><td>{e.event_type}</td><td>{e.effective_date ?? '—'}</td><td>{e.status}</td><td>{e.notes ?? '—'}</td></tr>)}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        {tab === 'onboarding' ? (
          <>
            <h3 className={styles.h3}>Onboarding checklist JSON</h3>
            <textarea className={styles.input} style={{ minHeight: 180 }} value={checklistText} onChange={(e) => setChecklistText(e.target.value)} disabled={!canEdit} />
            {canEdit ? <button className={styles.btnSm} disabled={pending} onClick={() => void saveChecklist()}>Save checklist</button> : null}
          </>
        ) : null}
      </section>
    </div>
  )
}
