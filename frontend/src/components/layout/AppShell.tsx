import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useLocation, useNavigate } from 'react-router-dom'
import type { CompanyNavItem } from '../../company/navConfig'
import { apiFetch } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import styles from './AppShell.module.css'

export type AppShellNavItem =
  | { kind: 'link'; to: string; label: string }
  | {
      kind: 'group'
      label: string
      /** When set, a primary nav row links here; children render as a tree branch list below. */
      parentTo?: string
      children: { to: string; label: string }[]
    }

type Props = {
  /** Top bar heading (e.g. "Organizational structure") */
  title: string
  subtitle?: string
  /** When set, shown prominently under HworkR in the sidebar (company workspace). */
  companyName?: string
  navItems: AppShellNavItem[]
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
    if (pathname.endsWith('/surveys')) {
      if (siblingTos.length === 1) return childTo === siblingTos[0]
      return childTab === 'surveys'
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
      // Allow collapsing while a child route is active: explicit openOverride[parent] === false means "user collapsed".
      const expanded = hasActiveChild ? openOverride[item.to] !== false : (openOverride[item.to] ?? false)
      return { kind: 'group' as const, item, siblingTos, hasActiveChild, expanded }
    })
  }, [navItems, pathname, search, openOverride])

  const toggleGroup = useCallback((parentTo: string, hasActiveChild: boolean) => {
    setOpenOverride((o) => {
      if (hasActiveChild) {
        const isOpen = o[parentTo] !== false
        return { ...o, [parentTo]: !isOpen }
      }
      return { ...o, [parentTo]: !(o[parentTo] ?? false) }
    })
  }, [])
  const location = useLocation()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  async function submitPasswordChange() {
    if (savingPassword) return
    setPasswordError(null)
    setPasswordSuccess(null)
    if (!currentPassword || !newPassword) {
      setPasswordError('Please enter both current and new password.')
      return
    }
    setSavingPassword(true)
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        json: { current_password: currentPassword, new_password: newPassword },
      })
      setCurrentPassword('')
      setNewPassword('')
      setPasswordSuccess('Password updated successfully.')
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'Failed to update password')
    } finally {
      setSavingPassword(false)
    }
  }

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
          {navEntries.map((entry) =>
            item.kind === 'link' ? {
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
            ) : item.parentTo ? (
              <NavTreeGroup
                key={item.label}
                item={{ ...item, parentTo: item.parentTo }}
                locationPathname={location.pathname}
              />
            ) : (
              <div key={item.label} className={styles.navGroup}>
                <div className={styles.navGroupLabel}>{item.label}</div>
                {item.children.map((child) => (
                  <NavLink
                    key={child.to}
                    to={child.to}
                    className={({ isActive }) =>
                      `${styles.navLink} ${styles.navLinkNested} ${isActive ? styles.navLinkActive : ''}`
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
              </div>
            ),
          )}
        </nav>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <h1 className={styles.pageTitle}>{title}</h1>
            {subtitle ? <p className={styles.pageSub}>{subtitle}</p> : null}
          </div>
          <div className={styles.topbarRight}>
            {topbarExtra}
            <button
              type="button"
              className={styles.iconBtn}
              title="Account settings"
              aria-label="Account settings"
              onClick={() => {
                setSettingsOpen(true)
                setPasswordError(null)
                setPasswordSuccess(null)
              }}
            >
              ⚙
            </button>
            <span className={styles.userName}>{user?.name}</span>
            <button
              type="button"
              className={styles.signOutBtnTop}
              onClick={() => {
                logout()
                navigate('/login')
              }}
            >
              Sign out
            </button>
            <Link to="/" className={styles.homeLink}>
              Home
            </Link>
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
      {settingsOpen ? (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setSettingsOpen(false)}>
          <div className={styles.modalCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Account settings</h3>
            <p className={styles.modalHint}>Change your account password.</p>
            {passwordError ? <p className={styles.modalError}>{passwordError}</p> : null}
            {passwordSuccess ? <p className={styles.modalSuccess}>{passwordSuccess}</p> : null}
            <label className={styles.modalLabel}>
              Current password
              <input
                className={styles.modalInput}
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </label>
            <label className={styles.modalLabel}>
              New password
              <input
                className={styles.modalInput}
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <div className={styles.modalActions}>
              <button type="button" className={styles.primaryBtn} onClick={() => void submitPasswordChange()}>
                {savingPassword ? 'Saving…' : 'Update password'}
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => {
                  setSettingsOpen(false)
                  setPasswordError(null)
                  setPasswordSuccess(null)
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function NavTreeGroup({
  item,
  locationPathname,
}: {
  item: Extract<AppShellNavItem, { kind: 'group' }> & { parentTo: string }
  locationPathname: string
}) {
  const sectionBase = item.parentTo.split('?')[0].replace(/\/[^/]+$/, '')
  const underSection = locationPathname.startsWith(sectionBase)

  const [expanded, setExpanded] = useState(false)
  const wasUnderSection = useRef(false)

  useEffect(() => {
    if (underSection && !wasUnderSection.current) {
      setExpanded(true)
    }
    if (!underSection && wasUnderSection.current) {
      setExpanded(false)
    }
    wasUnderSection.current = underSection
  }, [underSection])

  return (
    <div className={styles.navTree}>
      <div className={styles.navTreeParentRow}>
        <NavLink
          to={item.parentTo}
          className={({ isActive }) =>
            `${styles.navLink} ${styles.navTreeParentLink} ${isActive || underSection ? styles.navLinkActive : ''}`
          }
        >
          {item.label}
        </NavLink>
        <button
          type="button"
          className={styles.navTreeToggle}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`nav-tree-${item.label.replace(/\s+/g, '-')}`}
          title={expanded ? 'Hide sub-pages' : 'Show sub-pages'}
        >
          <span className={styles.navTreeToggleIcon} aria-hidden>
            ▼
          </span>
        </button>
      </div>
      {expanded ? (
        <div
          className={styles.navTreeBranches}
          id={`nav-tree-${item.label.replace(/\s+/g, '-')}`}
          role="group"
          aria-label={`${item.label} sections`}
        >
          {item.children.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              className={({ isActive }) =>
                `${styles.navTreeBranchLink} ${isActive ? styles.navLinkActive : ''}`
              }
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  )
}
