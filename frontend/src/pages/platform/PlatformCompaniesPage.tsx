import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { AppShell } from '../../components/layout/AppShell'
import type { Company } from '../../auth/AuthContext'
import styles from './PlatformCompaniesPage.module.css'

type RegistrationRequest = {
  id: string
  requester_email: string
  company_name: string
  logo_url: string | null
  industry: string | null
  location: string | null
  submitted_at: string
  status: string
}

export function PlatformCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [pendingReqs, setPendingReqs] = useState<RegistrationRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const [list, pending] = await Promise.all([
        apiFetch<Company[]>('/platform/companies'),
        apiFetch<RegistrationRequest[]>('/platform/company-registration-requests?status=pending'),
      ])
      setCompanies(list)
      setPendingReqs(pending)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function onApprove(id: string) {
    if (!window.confirm('Approve this company registration and create the tenant?')) return
    setBusyId(id)
    setError(null)
    try {
      await apiFetch<Company>(`/platform/company-registration-requests/${id}/approve`, {
        method: 'POST',
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed')
    } finally {
      setBusyId(null)
    }
  }

  async function onReject(id: string) {
    const reason = window.prompt('Optional rejection reason (leave blank for none):') ?? ''
    setBusyId(id)
    setError(null)
    try {
      await apiFetch(`/platform/company-registration-requests/${id}/reject`, {
        method: 'POST',
        ...(reason.trim() ? { json: { reason: reason.trim() } } : {}),
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reject failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AppShell
      title="Platform"
      subtitle="Approve company registrations and view tenants"
      navItems={[
        { to: '/platform', label: 'Companies' },
        { to: '/', label: 'Home' },
      ]}
    >
      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.list}>
        <h2 className={styles.h2}>Pending company registrations</h2>
        {pendingReqs.length === 0 ? (
          <p className={styles.note}>No pending requests.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Requester</th>
                <th>Company</th>
                <th>Industry</th>
                <th>Location</th>
                <th>Logo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pendingReqs.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.submitted_at).toLocaleString()}</td>
                  <td>{r.requester_email}</td>
                  <td>{r.company_name}</td>
                  <td>{r.industry ?? '—'}</td>
                  <td>{r.location ?? '—'}</td>
                  <td>
                    {r.logo_url ? (
                      <img
                        src={r.logo_url}
                        alt=""
                        className={styles.thumb}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={styles.actions}>
                    <button
                      type="button"
                      className={styles.btn}
                      disabled={busyId === r.id}
                      onClick={() => void onApprove(r.id)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      disabled={busyId === r.id}
                      onClick={() => void onReject(r.id)}
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.list}>
        <h2 className={styles.h2}>All companies</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Industry</th>
              <th>Location</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.industry ?? '—'}</td>
                <td>{c.location ?? '—'}</td>
                <td>
                  <code className={styles.code}>{c.id}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  )
}
