import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import type { CompanyNavItem } from '../../company/navConfig'
import { useAuth } from '../../auth/AuthContext'
import styles from './AppShell.module.css'

type Props = {
  /** Top bar heading (e.g. "Organizational structure") */
  title: string
  subtitle?: string
  /** When set, shown prominently under HworkR in the sidebar (company workspace). */
  companyName?: string
  navItems: CompanyNavItem[]
  topbarExtra?: ReactNode
  children: ReactNode
}

/** Match sidebar child link to current location; handles ?tab= and extra params (e.g. pay_run_id). */
function isChildNavActive(childTo: string, pathname: string, search: string, siblingTos: string[]): boolean {
  try {
    const childUrl = new URL(childTo, window.location.origin)
    if (childUrl.pathname !== pathname) return false
    const locParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    const locTab = locParams.get('tab')
    const childTab = new URLSearchParams(childUrl.search).get('tab')
    if (locTab !== null) {
      return childTab === locTab
    }
    // No tab in URL: single visible child or default tab for multi-child modules
    if (pathname.endsWith('/payroll')) {
      if (siblingTos.length === 1) return childTo === siblingTos[0]
      return childTab === 'salary'
    }
    if (pathname.endsWith('/benefits')) {
      if (siblingTos.length === 1) return childTo === siblingTos[0]
      return childTab === 'plans'
    }
    return false
  } catch {
    return false
  }
}

function parentRouteActive(parentTo: string, pathname: string): boolean {
  return pathname === parentTo || pathname.startsWith(`${parentTo}/`)
}

export function AppShell({ title, subtitle, companyName, navItems, topbarExtra, children }: Props) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname
  const search = location.search

  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setOpenOverride({})
  }, [pathname])

  const navEntries = useMemo(() => {
    return navItems.map((item) => {
      const children = item.children
      if (!children?.length) {
        return { kind: 'link' as const, item }
      }
      const siblingTos = children.map((c) => c.to)
      const hasActiveChild = children.some((c) => isChildNavActive(c.to, pathname, search, siblingTos))
      const expanded = hasActiveChild || (openOverride[item.to] ?? false)
      return { kind: 'group' as const, item, siblingTos, hasActiveChild, expanded }
    })
  }, [navItems, pathname, search, openOverride])

  const toggleGroup = useCallback((parentTo: string, hasActiveChild: boolean) => {
    if (hasActiveChild) return
    setOpenOverride((o) => ({ ...o, [parentTo]: !(o[parentTo] ?? false) }))
  }, [])

  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.logo}>H</span>
          <div>
            <div className={styles.brandName}>HworkR</div>
            {companyName ? (
              <div className={styles.brandCompany}>{companyName}</div>
            ) : (
              <div className={styles.brandSub}>{title}</div>
            )}
          </div>
        </div>
        <nav className={styles.nav}>
          {navEntries.map((entry) => {
            if (entry.kind === 'link') {
              const { item } = entry
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                  }
                >
                  {item.label}
                </NavLink>
              )
            }

            const { item, siblingTos, hasActiveChild, expanded } = entry
            const labelActive = hasActiveChild || parentRouteActive(item.to, pathname)

            return (
              <div key={item.to} className={styles.navGroup}>
                <button
                  type="button"
                  className={`${styles.navGroupLabel} ${labelActive ? styles.navGroupLabelActive : ''}`}
                  aria-expanded={expanded}
                  onClick={() => toggleGroup(item.to, hasActiveChild)}
                >
                  <span>{item.label}</span>
                  <span className={styles.navGroupCaret} aria-hidden>
                    {expanded ? '▾' : '▸'}
                  </span>
                </button>
                {expanded ? (
                  <div className={styles.navGroupChildren}>
                    {item.children!.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        className={() =>
                          `${styles.navSubLink} ${isChildNavActive(child.to, pathname, search, siblingTos) ? styles.navSubLinkActive : ''}`
                        }
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </nav>
        <div className={styles.sidebarFooter}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => {
              logout()
              navigate('/login')
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <h1 className={styles.pageTitle}>{title}</h1>
            {subtitle ? <p className={styles.pageSub}>{subtitle}</p> : null}
          </div>
          <div className={styles.topbarRight}>
            {topbarExtra}
            <span className={styles.userName}>{user?.name}</span>
            <Link to="/" className={styles.homeLink}>
              Home
            </Link>
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  )
}
