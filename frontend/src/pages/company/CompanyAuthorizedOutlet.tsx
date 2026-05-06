import { Navigate, Outlet, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { canAccessCompanyPath } from '../../company/companyAccess'

/**
 * Enforces `canAccessCompanyPath` for nested company workspace routes.
 * Must sit inside `CompanyLayout` so membership is already validated.
 */
export function CompanyAuthorizedOutlet() {
  const { companyId = '' } = useParams()
  const location = useLocation()
  const { myCompanies } = useAuth()
  const entry = myCompanies.find((x) => x.company.id === companyId)
  const role = entry?.membership.role

  const prefix = `/company/${companyId}/`
  const rel = location.pathname.startsWith(prefix) ? location.pathname.slice(prefix.length) : ''
  const pathKey = rel.split('?')[0]

  if (!role || !canAccessCompanyPath(pathKey, role)) {
    return <Navigate to={`/company/${companyId}`} replace />
  }
  return <Outlet />
}
