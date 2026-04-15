import type { CompanyMembership } from '../auth/AuthContext'

export type NavItem = { to: string; label: string; roles?: string[] }

/** Optional filters for nav (e.g. hide Team goals when the user has no direct reports). */
export type CompanyNavOptions = {
  /** When false, "Team goals" is hidden for employees and HR ops. Omitted or true: default role-based visibility. */
  showTeamGoals?: boolean
}

const EXPORT_ROLES = new Set(['company_admin', 'talent_acquisition', 'hr_ops', 'ld_performance', 'compensation_analytics'])
const SCENARIO_ROLES = new Set(['company_admin', 'hr_ops', 'ld_performance'])
const HR_ANALYTICS = new Set([
  'company_admin',
  'talent_acquisition',
  'hr_ops',
  'ld_performance',
  'compensation_analytics',
])

const ALL_MEMBERS = [
  'company_admin',
  'talent_acquisition',
  'hr_ops',
  'ld_performance',
  'compensation_analytics',
  'employee',
]

const WF_ROLES = ['company_admin', 'talent_acquisition', 'hr_ops']

export const COMPANY_NAV_DEF: NavItem[] = [
  { to: '', label: 'Dashboard', roles: ALL_MEMBERS },
  { to: 'my-profile', label: 'My profile', roles: ['employee', 'hr_ops'] },
  { to: 'my-goals', label: 'My goals', roles: ['employee', 'hr_ops'] },
  { to: 'team-goals', label: 'Team goals', roles: ['employee', 'hr_ops'] },
  { to: 'org', label: 'Organization', roles: ALL_MEMBERS },
  { to: 'employees', label: 'Employees', roles: ['company_admin', 'hr_ops', 'talent_acquisition', 'ld_performance', 'compensation_analytics'] },
  { to: 'members', label: 'Members', roles: ['company_admin'] },
  { to: 'hr-ops', label: 'HR Ops', roles: ['company_admin', 'hr_ops', 'employee'] },
  { to: 'workflows', label: 'Workflows', roles: WF_ROLES },
  { to: 'recruitment', label: 'Recruitment', roles: ALL_MEMBERS },
  { to: 'performance', label: 'Performance', roles: ['hr_ops'] },
  { to: 'learning', label: 'Learning', roles: ['company_admin', 'ld_performance', 'employee'] },
  { to: 'payroll', label: 'Payroll', roles: ['company_admin', 'compensation_analytics', 'employee'] },
  { to: 'benefits', label: 'Benefits', roles: ['company_admin', 'compensation_analytics', 'employee'] },
  { to: 'surveys', label: 'Surveys', roles: ['company_admin', 'compensation_analytics', 'employee'] },
  { to: 'inbox', label: 'Inbox', roles: ALL_MEMBERS },
  { to: 'analytics', label: 'Analytics', roles: ['company_admin', 'compensation_analytics'] },
  { to: 'tracking', label: 'Tracking & score', roles: ALL_MEMBERS },
  { to: 'certification', label: 'Certification', roles: ALL_MEMBERS },
  { to: 'exports', label: 'Exports', roles: [...EXPORT_ROLES] },
  { to: 'webhooks', label: 'Webhooks', roles: ['company_admin'] },
  { to: 'scenarios', label: 'Scenarios', roles: [...SCENARIO_ROLES] },
  { to: 'integrations/sso', label: 'SSO (stubs)', roles: ['company_admin'] },
]

export function companyNavItems(
  companyId: string,
  membership: CompanyMembership,
  opts?: CompanyNavOptions,
): { to: string; label: string }[] {
  const base = `/company/${companyId}/`
  const role = membership.role
  return COMPANY_NAV_DEF.filter((item) => {
    if (!item.roles || item.roles.length === 0) return true
    if (!item.roles.includes(role)) return false
    if (
      item.to === 'team-goals' &&
      (role === 'employee' || role === 'hr_ops') &&
      opts?.showTeamGoals === false
    ) {
      return false
    }
    return true
  }).map((item) => ({
    to: `${base}${item.to}`,
    label: item.label,
  }))
}

/** Roles that can list all users' activity logs (backend tracking list). */
export function canListAllActivityLogs(role: string): boolean {
  return HR_ANALYTICS.has(role)
}
