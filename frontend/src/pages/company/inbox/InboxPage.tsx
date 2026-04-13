import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { listInboxTasks, type InboxTask } from '../../../api/inboxApi'
import styles from '../CompanyWorkspacePage.module.css'

export function InboxPage() {
  const { companyId = '' } = useParams()
  const [rows, setRows] = useState<InboxTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [query, setQuery] = useState('')
  const [sortField, setSortField] = useState<'due_at' | 'created_at' | 'priority'>('due_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    void listInboxTasks(companyId)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load inbox'))
      .finally(() => setLoading(false))
  }, [companyId])

  const filtered = [...rows]
    .filter((r) => (statusFilter ? r.status === statusFilter : true))
    .filter((r) => (priorityFilter ? r.priority === priorityFilter : true))
    .filter((r) => `${r.title} ${r.type}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const sign = sortDir === 'asc' ? 1 : -1
      const av = String(a[sortField] ?? '')
      const bv = String(b[sortField] ?? '')
      return av.localeCompare(bv) * sign
    })

  function sort(next: 'due_at' | 'created_at' | 'priority') {
    if (next === sortField) setSortDir((v) => (v === 'asc' ? 'desc' : 'asc'))
    else {
      setSortField(next)
      setSortDir('asc')
    }
  }

  return (
    <section className={styles.card}>
      <h3 className={styles.h3}>Inbox tasks</h3>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.inline}>
        <input className={styles.input} placeholder="Search tasks" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className={styles.input} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="done">Done</option>
        </select>
        <select className={styles.input} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th><button type="button" className={styles.linkBtn} onClick={() => sort('priority')}>Priority</button></th>
              <th>Task</th>
              <th>Type</th>
              <th><button type="button" className={styles.linkBtn} onClick={() => sort('due_at')}>Due</button></th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className={styles.muted}>Loading inbox tasks…</td></tr> : null}
            {!loading && filtered.length === 0 ? <tr><td colSpan={6} className={styles.muted}>No tasks.</td></tr> : null}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td><span className={`${styles.badge} ${r.priority === 'high' ? styles.badgeRed : r.priority === 'medium' ? styles.badgeAmber : styles.badgeGreen}`}>{r.priority}</span></td>
                <td>{r.title}</td>
                <td>{r.type}</td>
                <td>{r.due_at ?? '—'}</td>
                <td>{r.status}</td>
                <td>{r.entity_type && r.entity_id ? <Link to={`/company/${companyId}/${r.entity_type === 'leave_request' ? 'hr-ops' : 'inbox'}`}>Open</Link> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
