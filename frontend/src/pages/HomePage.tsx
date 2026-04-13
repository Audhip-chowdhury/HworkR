import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import styles from './HomePage.module.css'

type RegReq = {
  id: string
  status: string
  company_name: string
  rejection_reason: string | null
  submitted_at: string
}

export function HomePage() {
  const { user, myCompanies, logout, refresh, loading } = useAuth()
  const navigate = useNavigate()
  const [regReq, setRegReq] = useState<RegReq | null | undefined>(undefined)

  useEffect(() => {
    if (!user || user.is_platform_admin || myCompanies.length > 0) {
      setRegReq(undefined)
      return
    }
    let cancelled = false
    void apiFetch<RegReq | null>('/company-registration-requests/me').then((r) => {
      if (!cancelled) setRegReq(r ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [user, myCompanies])

  useEffect(() => {
    if (regReq?.status === 'approved') {
      void refresh()
    }
  }, [regReq, refresh])

  const showRegisterFlow = user && !user.is_platform_admin && myCompanies.length === 0

  if (loading) {
    return (
      <div className={styles.wrap}>
        <main className={styles.main}>
          <p className={styles.empty}>Loading…</p>
        </main>
      </div>
    )
  }

  if (user && !user.is_platform_admin && myCompanies.length === 1) {
    return <Navigate to={`/company/${myCompanies[0].company.id}/org`} replace />
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>H</span>
          <div>
            <div className={styles.name}>HworkR</div>
            <div className={styles.tag}>HR Training & Certification</div>
          </div>
        </div>
        <div className={styles.user}>
          <span>{user?.name}</span>
          <button
            type="button"
            className={styles.signOut}
            onClick={() => {
              logout()
              navigate('/login')
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>Welcome</h1>
        <p className={styles.lead}>
          Choose a workspace. Platform admins review company registrations; company members open
          their organization setup.
        </p>

        {user?.is_platform_admin ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>Platform</h2>
            <Link to="/platform" className={styles.tile}>
              <strong>Companies</strong>
              <span>Review registrations and view tenant companies</span>
            </Link>
          </section>
        ) : null}

        {showRegisterFlow ? (
          <section className={styles.section}>
            <h2 className={styles.h2}>Register your company</h2>
            {regReq === undefined ? (
              <p className={styles.empty}>Loading…</p>
            ) : regReq?.status === 'pending' ? (
              <p className={styles.empty}>
                Your registration request for <strong>{regReq.company_name}</strong> was submitted on{' '}
                {new Date(regReq.submitted_at).toLocaleString()} and is pending platform review.
              </p>
            ) : regReq?.status === 'rejected' ? (
              <div className={styles.registerBlock}>
                <p className={styles.empty}>
                  Your request for <strong>{regReq.company_name}</strong> was not approved
                  {regReq.rejection_reason ? `: ${regReq.rejection_reason}` : '.'}
                </p>
                <Link to="/register-company" className={styles.tile}>
                  <strong>Submit a new request</strong>
                  <span>Send another company registration for review</span>
                </Link>
              </div>
            ) : (
              <Link to="/register-company" className={styles.tile}>
                <strong>Register your company</strong>
                <span>Submit details for platform approval to create your organization</span>
              </Link>
            )}
          </section>
        ) : null}

        <section className={styles.section}>
          <h2 className={styles.h2}>Your companies</h2>
          {myCompanies.length === 0 ? (
            <p className={styles.empty}>
              {showRegisterFlow
                ? 'When your request is approved, your company will appear here.'
                : 'You are not assigned to a company yet.'}
            </p>
          ) : (
            <div className={styles.grid}>
              {myCompanies.map(({ company, membership }) => (
                <Link key={company.id} to={`/company/${company.id}/org`} className={styles.tile}>
                  <strong>{company.name}</strong>
                  <span className={styles.meta}>
                    Role: {membership.role.replace(/_/g, ' ')}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
