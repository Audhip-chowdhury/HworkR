import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import styles from './AppShell.module.css'

type Props = {
  /** Top bar heading (e.g. "Organizational structure") */
  title: string
  subtitle?: string
  /** When set, shown prominently under HworkR in the sidebar (company workspace). */
  companyName?: string
  navItems: { to: string; label: string }[]
  topbarExtra?: ReactNode
  children: ReactNode
}

export function AppShell({ title, subtitle, companyName, navItems, topbarExtra, children }: Props) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

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
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
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
