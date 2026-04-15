import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { AppShell } from '../components/layout/AppShell'
import styles from './RegisterCompanyPage.module.css'

type RegistrationOut = {
  id: string
  company_name: string
  status: string
  submitted_at: string
}

type RegMe = { status: string } | null

export function RegisterCompanyPage() {
  const { user, myCompanies, refresh } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user?.is_platform_admin) navigate('/', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    if (myCompanies.length > 0) navigate('/', { replace: true })
  }, [myCompanies, navigate])

  useEffect(() => {
    if (!user || user.is_platform_admin) return
    void apiFetch<RegMe>('/company-registration-requests/me').then((r) => {
      if (r?.status === 'pending') navigate('/', { replace: true })
    })
  }, [user, navigate])
  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState('')
  const [location, setLocation] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const fd = new FormData()
      fd.append('company_name', companyName.trim())
      if (industry.trim()) fd.append('industry', industry.trim())
      if (location.trim()) fd.append('location', location.trim())
      if (logoFile) fd.append('logo', logoFile)

      await apiFetch<RegistrationOut>('/company-registration-requests', {
        method: 'POST',
        body: fd,
      })
      await refresh()
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <AppShell
      title="Register company"
      subtitle="Request approval to create your organization"
      navItems={[
        { kind: 'link', to: '/', label: 'Home' },
        { kind: 'link', to: '/register-company', label: 'Register company' },
      ]}
    >
      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.card}>
        <h2 className={styles.h2}>Company details</h2>
        <p className={styles.note}>
          Your request is reviewed by a platform administrator. You can belong to only one company;
          you cannot submit another request while one is pending.
        </p>
        <form onSubmit={onSubmit} className={styles.form}>
          <label className={styles.label}>
            Company name
            <input
              className={styles.input}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              maxLength={255}
            />
          </label>
          <label className={styles.label}>
            Industry (optional)
            <input
              className={styles.input}
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              maxLength={255}
            />
          </label>
          <label className={styles.label}>
            Location (optional)
            <input
              className={styles.input}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={255}
            />
          </label>
          <label className={styles.label}>
            Logo (optional)
            <input
              className={styles.input}
              type="file"
              accept=".png,.jpg,.jpeg,.gif,.webp"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            />
            <span className={styles.hint}>PNG, JPG, GIF, or WebP — max 2 MB</span>
          </label>
          <button type="submit" className={styles.btn} disabled={pending}>
            Submit request
          </button>
        </form>
      </section>
    </AppShell>
  )
}
