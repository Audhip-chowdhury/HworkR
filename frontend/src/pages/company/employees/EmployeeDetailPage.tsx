import { Navigate, useParams } from 'react-router-dom'

/** Legacy route: send users to the split Employees view with the same employee selected. */
export function EmployeeDetailPage() {
  const { companyId = '', employeeId = '' } = useParams()
  const qs = employeeId ? `?id=${encodeURIComponent(employeeId)}` : ''
  return <Navigate to={`/company/${companyId}/employees/profile${qs}`} replace />
}
