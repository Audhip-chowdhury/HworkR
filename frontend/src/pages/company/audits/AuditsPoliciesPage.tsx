import { useMemo } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import { canListAllActivityLogs } from '../../../company/companyAccess'
import { PolicyDocumentsPage } from './PolicyDocumentsPage'
import { PolicyPublishPage } from './PolicyPublishPage'

const TAB_LIBRARY = 'library'
const TAB_PUBLISH = 'publish'

/** Renders policy library vs publish from `?tab=` only — sidebar provides navigation, no in-page tabs. */
export function AuditsPoliciesPage() {
  const { companyId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { myCompanies } = useAuth()
  const membership = useMemo(
    () => myCompanies.find((c) => c.company.id === companyId)?.membership,
    [myCompanies, companyId],
  )
  const canPublish = membership ? canListAllActivityLogs(membership.role) : false

  if (!searchParams.has('tab')) {
    const merged = new URLSearchParams(searchParams)
    merged.set('tab', TAB_LIBRARY)
    return <Navigate to={`/company/${companyId}/audits/policies?${merged.toString()}`} replace />
  }

  const rawTab = searchParams.get('tab')
  const tab =
    rawTab === TAB_PUBLISH || rawTab === TAB_LIBRARY ? rawTab : rawTab === null ? TAB_LIBRARY : null

  if (tab === null) {
    return <Navigate to={`/company/${companyId}/audits/policies?tab=${TAB_LIBRARY}`} replace />
  }

  if (tab === TAB_PUBLISH && !canPublish) {
    return <Navigate to={`/company/${companyId}/audits/policies?tab=${TAB_LIBRARY}`} replace />
  }

  return tab === TAB_PUBLISH ? <PolicyPublishPage /> : <PolicyDocumentsPage />
}
