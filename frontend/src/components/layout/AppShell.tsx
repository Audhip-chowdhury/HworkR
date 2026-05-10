import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import styles from './AppShell.module.css'

export type AppShellNavItem =
  | { kind: 'link'; to: string; label: string }
  | {
      kind: 'group'
      label: string
      /** When set, a primary nav row links here; children render under it. */
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
  /** Company workspace: enables Members in the account menu for `company_admin`. */
  workspaceContext?: { companyId: string; role: string }
  children: ReactNode
}

function searchParamsEquivalent(a: string, b: string): boolean {
  const pa = new URLSearchParams(a)
  const pb = new URLSearchParams(b)
  if (pa.size !== pb.size) return false
  for (const [k, v] of pa) {
    if (pb.get(k) !== v) return false
  }
  return true
}

/**
 * Match a sidebar child link to the current location. Handles `?tab=` query strings
 * so the Payroll / Benefits / Surveys sub-tabs highlight correctly even though they
 * all share a single base route.
 */
function isChildNavActive(
  childTo: string,
  pathname: string,
  search: string,
  siblingTos: string[],
): boolean {
  try {
    const childUrl = new URL(childTo, window.location.origin)
    if (childUrl.pathname !== pathname) {
      if (childUrl.pathname.endsWith('/workflows') && pathname.startsWith(`${childUrl.pathname}/`)) {
        return true
      }
      return false
    }
    const locParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    const locTab = locParams.get('tab')
    const childTab = new URLSearchParams(childUrl.search).get('tab')
    if (locTab === null && pathname.endsWith('/audits/policies')) {
      if (siblingTos.length === 1) return childTo === siblingTos[0]
      return childTab === 'library'
    }
    if (locTab !== null) {
      return childTab === locTab
    }
    // No `?tab=` in the URL: fall back to the module's default tab so something is highlighted.
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
    // Distinct child routes (Employees, Leave, Audits, Learning, …): path already matched;
    // treat as active when query string matches the child link (including both empty).
    const locSearch = search.startsWith('?') ? search.slice(1) : search
    const childSearch = childUrl.search.startsWith('?') ? childUrl.search.slice(1) : childUrl.search
    return searchParamsEquivalent(locSearch, childSearch)
  } catch {
    return false
  }
}

function parentRouteActive(parentTo: string, pathname: string): boolean {
  try {
    const parentUrl = new URL(parentTo, window.location.origin)
    return pathname === parentUrl.pathname || pathname.startsWith(`${parentUrl.pathname}/`)
  } catch {
    return pathname === parentTo || pathname.startsWith(`${parentTo}/`)
  }
}

export function AppShell({ title, subtitle, companyName, navItems, topbarExtra, workspaceContext, children }: Props) {
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
      if (item.kind === 'link') {
        return { kind: 'link' as const, item }
      }
      const siblingTos = item.children.map((c) => c.to)
      const hasActiveChild = item.children.some((c) =>
        isChildNavActive(c.to, pathname, search, siblingTos),
      )
      const groupKey = item.parentTo ?? item.label
      // Allow collapsing while a child route is active: explicit `false` means "user collapsed".
      const expanded = hasActiveChild
        ? openOverride[groupKey] !== false
        : (openOverride[groupKey] ?? false)
      return { kind: 'group' as const, item, siblingTos, hasActiveChild, expanded, groupKey }
    })
  }, [navItems, pathname, search, openOverride])

  const toggleGroup = useCallback((groupKey: string, hasActiveChild: boolean) => {
    setOpenOverride((o) => {
      if (hasActiveChild) {
        const isOpen = o[groupKey] !== false
        return { ...o, [groupKey]: !isOpen }
      }
      return { ...o, [groupKey]: !(o[groupKey] ?? false) }
    })
  }, [])

  const accountMenuRef = useRef<HTMLDivElement | null>(null)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  const showMembersInAccountMenu = workspaceContext?.role === 'company_admin'

  const closePasswordModal = useCallback(() => {
    setPasswordModalOpen(false)
    setPasswordError(null)
    setPasswordSuccess(null)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmNewPassword('')
  }, [])

  const openPasswordModal = useCallback(() => {
    setAccountMenuOpen(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmNewPassword('')
    setPasswordModalOpen(true)
    setPasswordError(null)
    setPasswordSuccess(null)
  }, [])

  useEffect(() => {
    if (!accountMenuOpen) return
    const onDocMouseDown = (e: MouseEvent) => {
      const el = accountMenuRef.current
      if (el && !el.contains(e.target as Node)) setAccountMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [accountMenuOpen])

  useEffect(() => {
    if (!passwordModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePasswordModal()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [passwordModalOpen, closePasswordModal])

  async function submitPasswordChange() {
    if (savingPassword) return
    setPasswordError(null)
    setPasswordSuccess(null)
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setPasswordError('Please fill in all password fields.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New password and confirmation do not match.')
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
      setConfirmNewPassword('')
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
          {navEntries.map((entry) => {
            if (entry.kind === 'link') {
              const { item } = entry
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to.endsWith('/') || /\/company\/[^/]+\/?$/.test(item.to)}
                  className={({ isActive }) =>
                    `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                  }
                >
                  {item.label}
                </NavLink>
              )
            }

            const { item, siblingTos, hasActiveChild, expanded, groupKey } = entry
            const labelActive =
              hasActiveChild || (item.parentTo ? parentRouteActive(item.parentTo, pathname) : false)

            // Single clickable label row that both (a) navigates to the parent route when
            // there is one and (b) opens/closes the dropdown. Using a NavLink for groups
            // with `parentTo` and a plain button for groups without.
            const handleLabelClick = (e: ReactMouseEvent) => {
              // For modifier-clicks (cmd/ctrl/shift/middle), let the browser handle it
              // as a normal link click and skip the toggle.
              if (item.parentTo && (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) {
                return
              }
              // If clicking the parent will navigate somewhere new, ensure the dropdown
              // is open after navigation. Otherwise just toggle.
              if (
                item.parentTo &&
                !parentRouteActive(item.parentTo, pathname) &&
                !hasActiveChild
              ) {
                setOpenOverride((o) => ({ ...o, [groupKey]: true }))
                return
              }
              toggleGroup(groupKey, hasActiveChild)
            }

            const labelInner = (
              <>
                <span>{item.label}</span>
                <span className={styles.navGroupCaret} aria-hidden>
                  {expanded ? '▾' : '▸'}
                </span>
              </>
            )

            return (
              <div key={groupKey} className={styles.navGroup}>
                {item.parentTo ? (
                  <NavLink
                    to={item.parentTo}
                    onClick={handleLabelClick}
                    aria-expanded={expanded}
                    className={`${styles.navGroupLabel} ${labelActive ? styles.navGroupLabelActive : ''}`}
                  >
                    {labelInner}
                  </NavLink>
                ) : (
                  <button
                    type="button"
                    className={`${styles.navGroupLabel} ${labelActive ? styles.navGroupLabelActive : ''}`}
                    aria-expanded={expanded}
                    onClick={() => toggleGroup(groupKey, hasActiveChild)}
                  >
                    {labelInner}
                  </button>
                )}
                {expanded ? (
                  <div className={styles.navGroupChildren}>
                    {item.children.map((child) => {
                      const active = isChildNavActive(child.to, pathname, search, siblingTos)
                      return (
                        <NavLink
                          key={`${child.label}:${child.to}`}
                          to={child.to}
                          className={() =>
                            `${styles.navSubLink} ${active ? styles.navSubLinkActive : ''}`
                          }
                        >
                          {child.label}
                        </NavLink>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
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
            <div className={styles.accountMenuWrap} ref={accountMenuRef}>
              <button
                type="button"
                className={styles.iconBtn}
                title="Account menu"
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                onClick={() => {
                  if (passwordModalOpen) closePasswordModal()
                  setAccountMenuOpen((o) => !o)
                }}
              >
                ⚙
              </button>
              {accountMenuOpen ? (
                <div className={styles.accountMenu} role="menu" aria-label="Account">
                  <button type="button" className={styles.accountMenuItem} role="menuitem" onClick={openPasswordModal}>
                    Change password
                  </button>
                  {showMembersInAccountMenu && workspaceContext ? (
                    <>
                      <div className={styles.accountMenuDivider} role="separator" />
                      <button
                        type="button"
                        className={styles.accountMenuItem}
                        role="menuitem"
                        onClick={() => {
                          setAccountMenuOpen(false)
                          navigate(`/company/${workspaceContext.companyId}/members`)
                        }}
                      >
                        Members
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
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
      {passwordModalOpen ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => closePasswordModal()}
        >
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="change-password-title" className={styles.modalTitle}>
              Change password
            </h3>
            <p className={styles.modalHint}>Enter your current password, then a new password twice.</p>
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
            <label className={styles.modalLabel}>
              Reconfirm new password
              <input
                className={styles.modalInput}
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
            </label>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={savingPassword}
                onClick={() => void submitPasswordChange()}
              >
                {savingPassword ? 'Saving…' : 'Update password'}
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={() => closePasswordModal()}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
