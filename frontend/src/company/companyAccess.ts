/**
 * Company workspace RBAC: which membership.role may open which URL segments
 * under `/company/:companyId/…` and related UI flags (e.g. audit member search).
 *
 * Role model: company_admin, hr_ops, talent_acquisition, ld_performance,
 * compensation_analytics, employee
 */

export const ALL_COMPANY_ROLES = [
  'company_admin',
  'talent_acquisition',
  'hr_ops',
  'ld_performance',
  'compensation_analytics',
  'employee',
] as const

/** Non–line-employee HR roles (analytics, broad “HR” product areas). */
export const HR_NON_EMPLOYEE_ROLES = [
  'company_admin',
  'talent_acquisition',
  'hr_ops',
  'ld_performance',
  'compensation_analytics',
] as const

/**
 * Leave org admin: approvals queue, org-wide balance tracker, cross-employee leave APIs.
 * HR Ops specialist only.
 */
export const LEAVE_ORG_ADMIN_ROLES = [
  'hr_ops',
] as const

/** HR Operations + admin: full employee directory, org-wide audit search, policy publish, survey admin tabs */
export const HR_OPS_ADMIN_ROLES = ['company_admin', 'hr_ops'] as const

/** Recruitment + admin: recruitment module + workflows */
export const RECRUITMENT_ADMIN_ROLES = ['company_admin', 'talent_acquisition'] as const

/** L&D + admin: course catalog + training scores */
export const LD_ADMIN_ROLES = ['company_admin', 'ld_performance'] as const

/** Compensation + admin: payroll configuration tabs + benefits plan management */
export const COMPENSATION_ADMIN_ROLES = ['company_admin', 'compensation_analytics'] as const

export function canListAllActivityLogs(role: string): boolean {
  return role === 'company_admin' || role === 'hr_ops'
}

/** Analytics dashboard (not in “common” verbatim; keep for all HR non-employees). */
export function canViewAnalytics(role: string): boolean {
  return HR_NON_EMPLOYEE_ROLES.includes(role as (typeof HR_NON_EMPLOYEE_ROLES)[number])
}

/**
 * Whether `role` may open a path segment like `employees/profile`, `recruitment/postings`, or `` for dashboard.
 */
export function canAccessCompanyPath(path: string, role: string): boolean {
  const p = (path.replace(/\/$/, '') || '').split('?')[0]

  if (
    p === 'members' ||
    p.startsWith('members/') ||
    p === 'hr-ops' ||
    p.startsWith('hr-ops/') ||
    p === 'exports' ||
    p.startsWith('exports/') ||
    p === 'webhooks' ||
    p.startsWith('webhooks/') ||
    p === 'scenarios' ||
    p.startsWith('scenarios/') ||
    p.startsWith('integrations/sso') ||
    p === 'tracking' ||
    p.startsWith('tracking/')
  ) {
    return role === 'company_admin'
  }

  if (p.startsWith('employees')) {
    return role === 'company_admin' || role === 'hr_ops'
  }

  if (p.startsWith('workflows')) {
    return role === 'company_admin' || role === 'talent_acquisition'
  }

  if (p.startsWith('recruitment')) {
    return role === 'company_admin' || role === 'talent_acquisition' || role === 'employee'
  }

  if (p === 'learning/catalog' || p === 'learning/scores') {
    return role === 'company_admin' || role === 'ld_performance'
  }

  if (
    p === 'leave/approvals' ||
    p.startsWith('leave/approvals/') ||
    p === 'leave/balances' ||
    p.startsWith('leave/balances/')
  ) {
    return LEAVE_ORG_ADMIN_ROLES.includes(role as (typeof LEAVE_ORG_ADMIN_ROLES)[number])
  }

  if (p.startsWith('learning')) {
    return ALL_COMPANY_ROLES.includes(role as (typeof ALL_COMPANY_ROLES)[number])
  }

  if (p === 'performance' || p.startsWith('performance/')) {
    return role === 'company_admin' || role === 'hr_ops'
  }

  if (p === 'analytics' || p.startsWith('analytics/')) {
    return canViewAnalytics(role)
  }

  if (p.startsWith('payroll')) {
    return ALL_COMPANY_ROLES.includes(role as (typeof ALL_COMPANY_ROLES)[number])
  }

  if (p.startsWith('benefits')) {
    return ALL_COMPANY_ROLES.includes(role as (typeof ALL_COMPANY_ROLES)[number])
  }

  if (p.startsWith('surveys')) {
    return ALL_COMPANY_ROLES.includes(role as (typeof ALL_COMPANY_ROLES)[number])
  }

  if (p.startsWith('my-profile') || p.startsWith('my-goals')) {
    return role === 'employee' || role === 'hr_ops'
  }

  if (p.startsWith('team-goals')) {
    return role === 'employee' || role === 'hr_ops'
  }

  if (
    p === '' ||
    p === 'org' ||
    p.startsWith('leave') ||
    p.startsWith('audits') ||
    p.startsWith('inbox') ||
    p.startsWith('legal') ||
    p.startsWith('progress') ||
    p.startsWith('certification')
  ) {
    return ALL_COMPANY_ROLES.includes(role as (typeof ALL_COMPANY_ROLES)[number])
  }

  return false
}
