import { useEffect, useMemo, useState } from 'react'
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
    if (entry.membership.role !== 'employee') {
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

  const navItems = useMemo(() => {
    const raw = companyNavItems(
      companyId,
      entry.membership,
      entry.membership.role === 'employee'
        ? { showTeamGoals: employeeHasDirectReports === true }
        : undefined,
    )
    const preserveQuery =
      location.pathname.includes('/employees/') ||
      location.pathname.includes('/leave/') ||
      location.pathname.includes('/audits/') ||
      location.pathname.includes('/learning/')
    const suffix = preserveQuery ? location.search : ''
    return raw.map((item) => {
      if (item.kind === 'group') {
        const parentTo =
          item.parentTo &&
          (item.parentTo.includes('/employees/') ||
            item.parentTo.includes('/leave/') ||
            item.parentTo.includes('/audits/') ||
            item.parentTo.includes('/learning/'))
            ? `${item.parentTo.split('?')[0]}${suffix}`
            : item.parentTo
        return {
          ...item,
          parentTo,
          children: item.children.map((c) => ({
            ...c,
            to:
              c.to.includes('/employees/') ||
              c.to.includes('/leave/') ||
              c.to.includes('/audits/') ||
              c.to.includes('/learning/')
                ? `${c.to.split('?')[0]}${suffix}`
                : c.to,
          })),
        }
      }
      return item
    })
  }, [companyId, entry.membership, employeeHasDirectReports, location.pathname, location.search])

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
