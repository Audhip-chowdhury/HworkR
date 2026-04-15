import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { listMyDirectReports } from '../../api/employeesApi'
import { AppShell } from '../../components/layout/AppShell'
import { LiveEventToasts } from '../../components/LiveEventToasts'
import { NotificationsPanel } from '../../components/NotificationsPanel'
import { companyNavItems } from '../../company/navConfig'
import { RealtimeEventsProvider } from '../../context/RealtimeEventsContext'
import { CompanyRealtimeBridge } from './CompanyRealtimeBridge'
import { companySectionTitle } from './companyPageTitles'
import styles from './CompanyWorkspacePage.module.css'

export function CompanyLayout() {
  const { companyId = '' } = useParams()
  const location = useLocation()
  const { myCompanies } = useAuth()
  const entry = myCompanies.find((x) => x.company.id === companyId)
  const prefix = `/company/${companyId}/`
  const after = location.pathname.startsWith(prefix)
    ? location.pathname.slice(prefix.length)
    : ''
  const { title, subtitle } = companySectionTitle(after)

  if (!entry) {
    return (
      <div className={styles.fallback}>
        <p>You do not have access to this company.</p>
        <Link to="/">Back to home</Link>
      </div>
    )
  }

  const displayCompany = entry.company.name

  const [employeeHasDirectReports, setEmployeeHasDirectReports] = useState<boolean | null>(null)

  useEffect(() => {
    if (!companyId) return
    if (entry.membership.role !== 'employee' && entry.membership.role !== 'hr_ops') {
      setEmployeeHasDirectReports(null)
      return
    }
    let cancelled = false
    setEmployeeHasDirectReports(null)
    void listMyDirectReports(companyId)
      .then((list) => {
        if (!cancelled) setEmployeeHasDirectReports(list.length > 0)
      })
      .catch(() => {
        if (!cancelled) setEmployeeHasDirectReports(false)
      })
    return () => {
      cancelled = true
    }
  }, [companyId, entry.membership.role])

  const navItems = companyNavItems(
    companyId,
    entry.membership,
    entry.membership.role === 'employee' || entry.membership.role === 'hr_ops'
      ? { showTeamGoals: employeeHasDirectReports === true }
      : undefined,
  )

  return (
    <RealtimeEventsProvider>
      <CompanyRealtimeBridge companyId={companyId} />
      <AppShell
        title={title}
        subtitle={subtitle}
        companyName={displayCompany}
        navItems={navItems}
        topbarExtra={<NotificationsPanel companyId={companyId} />}
      >
        <Outlet />
      </AppShell>
      <LiveEventToasts />
    </RealtimeEventsProvider>
  )
}
