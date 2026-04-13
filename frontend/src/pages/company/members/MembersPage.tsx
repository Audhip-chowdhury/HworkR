import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { deactivateMember, inviteMember, listMembers, updateMemberRole, type MembershipRow } from '../../../api/membersApi'
import styles from '../CompanyWorkspacePage.module.css'

export function MembersPage() {
  const { companyId = '' } = useParams()
  const [rows, setRows] = useState<MembershipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('employee')

  async function refresh() {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      setRows(await listMembers(companyId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [companyId])

  async function onInvite() {
    if (!companyId || !email.trim()) return
    setPending(true)
    setError(null)
    try {
      await inviteMember(companyId, { email: email.trim(), role, name: name.trim() || null, password: password || null })
      setEmail('')
      setName('')
      setPassword('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invite failed')
    } finally {
      setPending(false)
    }
  }

  async function onRoleChange(member: MembershipRow, nextRole: string) {
    if (!companyId) return
    if (!confirm(`Change role for ${member.user_id.slice(0, 8)} to ${nextRole}?`)) return
    setPending(true)
    try {
      await updateMemberRole(companyId, member.user_id, nextRole)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Role update failed')
    } finally {
      setPending(false)
    }
  }

  async function onDeactivate(member: MembershipRow) {
    if (!companyId) return
    if (!confirm(`Deactivate member ${member.user_id.slice(0, 8)}?`)) return
    setPending(true)
    try {
      await deactivateMember(companyId, member.user_id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deactivate failed')
    } finally {
      setPending(false)
    }
  }

  const filtered = rows.filter((m) => {
    if (roleFilter && m.role !== roleFilter) return false
    return `${m.user_id} ${m.role} ${m.status}`.toLowerCase().includes(query.toLowerCase())
  })

  return (
    <section className={styles.card}>
      <h3 className={styles.h3}>Members</h3>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.inline}>
        <input className={styles.input} placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={styles.input} placeholder="name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={styles.input} type="password" minLength={6} placeholder="password (for new user)" value={password} onChange={(e) => setPassword(e.target.value)} />
        <select className={styles.input} value={role} onChange={(e) => setRole(e.target.value)}><option>employee</option><option>hr_ops</option><option>talent_acquisition</option><option>ld_performance</option><option>compensation_analytics</option><option>company_admin</option></select>
        <button className={styles.btnSm} disabled={pending} onClick={() => void onInvite()}>{pending ? 'Inviting…' : 'Invite'}</button>
      </div>
      <div className={styles.inline}>
        <input className={styles.input} placeholder="Search member" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className={styles.input} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          <option>employee</option><option>hr_ops</option><option>talent_acquisition</option><option>ld_performance</option><option>compensation_analytics</option><option>company_admin</option>
        </select>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>User</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {loading ? <tr><td className={styles.muted} colSpan={4}>Loading members…</td></tr> : null}
            {!loading && filtered.length === 0 ? <tr><td className={styles.muted} colSpan={4}>No members match your filters.</td></tr> : null}
            {filtered.map((m) => (
              <tr key={m.id}>
                <td>{m.user_id.slice(0, 8)}…</td>
                <td>
                  <select value={m.role} disabled={pending} onChange={(e) => void onRoleChange(m, e.target.value)}>
                    <option>employee</option><option>hr_ops</option><option>talent_acquisition</option><option>ld_performance</option><option>compensation_analytics</option><option>company_admin</option>
                  </select>
                </td>
                <td>{m.status}</td>
                <td><button className={styles.linkDanger} disabled={pending || m.status !== 'active'} onClick={() => void onDeactivate(m)}>Deactivate</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
