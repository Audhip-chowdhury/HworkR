import { NavLink, Navigate, Outlet, useParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import styles from '../CompanyWorkspacePage.module.css'

export function MyGoalsLayout() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const entry = myCompanies.find((x) => x.company.id === companyId)
  const canUse = entry?.membership.role === 'employee' || entry?.membership.role === 'hr_ops'
  const base = `/company/${companyId}/my-goals`

  if (!entry) {
    return (
      <div className={styles.fallback}>
        <p>You do not have access to this company.</p>
      </div>
    )
  }

  if (!canUse) {
    return <Navigate to={`/company/${companyId}`} replace />
  }

  return (
    <div className={styles.org}>
      <div className={styles.inline} style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <NavLink
          end
          to={base}
          className={({ isActive }) => (isActive ? styles.btnSm : styles.btnGhost)}
        >
          Review goals
        </NavLink>
        <NavLink
          to={`${base}/peer-review`}
          className={({ isActive }) => (isActive ? styles.btnSm : styles.btnGhost)}
        >
          Peer review
        </NavLink>
      </div>
      <Outlet />
    </div>
  )
}
