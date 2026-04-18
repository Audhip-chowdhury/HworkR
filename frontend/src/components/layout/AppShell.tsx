import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
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

export function AppShell({ title, subtitle, companyName, navItems, topbarExtra, children }: Props) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
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
          {navItems.map((item) =>
            item.kind === 'link' ? (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                }
              >
                {item.label}
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
