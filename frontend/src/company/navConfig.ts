import type { CompanyMembership } from '../auth/AuthContext'

export type NavItem = { to: string; label: string; roles?: string[]; children?: NavItem[] }

export type CompanyNavItem = {
  to: string
  label: string
  children?: { to: string; label: string }[]
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

const PAYROLL_ROLES = ['company_admin', 'compensation_analytics', 'hr_ops', 'employee'] as const
const PAYROLL_CONFIGURE_ROLES = ['company_admin', 'compensation_analytics', 'hr_ops'] as const
const BENEFITS_ROLES = ['company_admin', 'compensation_analytics', 'employee'] as const
const BENEFITS_MANAGE_ROLES = ['company_admin', 'compensation_analytics'] as const

const SURVEYS_ROLES = ['company_admin', 'compensation_analytics', 'hr_ops', 'employee'] as const
const SURVEYS_HR_ROLES = ['company_admin', 'compensation_analytics', 'hr_ops'] as const

export const COMPANY_NAV_DEF: NavItem[] = [
  { to: '', label: 'Dashboard', roles: ALL_MEMBERS },
  { to: 'my-profile', label: 'My profile', roles: ['employee'] },
  { to: 'org', label: 'Organization', roles: ALL_MEMBERS },
  { to: 'employees', label: 'Employees', roles: ['company_admin', 'hr_ops', 'talent_acquisition', 'ld_performance', 'compensation_analytics'] },
  { to: 'members', label: 'Members', roles: ['company_admin'] },
  { to: 'hr-ops', label: 'HR Ops', roles: ['company_admin', 'hr_ops', 'employee'] },
  { to: 'workflows', label: 'Workflows', roles: WF_ROLES },
  { to: 'recruitment', label: 'Recruitment', roles: ALL_MEMBERS },
  { to: 'performance', label: 'Performance', roles: ['company_admin', 'ld_performance', 'employee'] },
  { to: 'learning', label: 'Learning', roles: ['company_admin', 'ld_performance', 'employee'] },
  {
    to: 'payroll',
    label: 'Payroll',
    roles: [...PAYROLL_ROLES],
    children: [
      { to: 'payroll?tab=salary', label: 'Salary structures', roles: [...PAYROLL_CONFIGURE_ROLES] },
      { to: 'payroll?tab=grades', label: 'Grade structure', roles: [...PAYROLL_CONFIGURE_ROLES] },
      { to: 'payroll?tab=merit', label: 'Increment', roles: [...PAYROLL_CONFIGURE_ROLES] },
      { to: 'payroll?tab=reimbursements', label: 'Reimbursements', roles: [...PAYROLL_CONFIGURE_ROLES] },
      { to: 'payroll?tab=runs', label: 'Pay runs', roles: [...PAYROLL_CONFIGURE_ROLES] },
      { to: 'payroll?tab=payslips', label: 'Payslips', roles: [...PAYROLL_ROLES] },
      { to: 'payroll?tab=reconciliation', label: 'Reconciliation', roles: [...PAYROLL_CONFIGURE_ROLES] },
    ],
  },
  {
    to: 'benefits',
    label: 'Benefits',
    roles: [...BENEFITS_ROLES],
    children: [
      { to: 'benefits?tab=plans', label: 'Plans', roles: [...BENEFITS_MANAGE_ROLES] },
      { to: 'benefits?tab=enrollments', label: 'Enrollments', roles: [...BENEFITS_MANAGE_ROLES] },
      { to: 'benefits?tab=myBenefits', label: 'My Benefits', roles: ['employee'] },
    ],
  },
  {
    to: 'surveys',
    label: 'Engagement & Surveys',
    roles: [...SURVEYS_ROLES],
    children: [
      { to: 'surveys?tab=surveys', label: 'Surveys', roles: [...SURVEYS_ROLES] },
      { to: 'surveys?tab=responses', label: 'Responses & Analysis', roles: [...SURVEYS_HR_ROLES] },
      { to: 'surveys?tab=plans', label: 'Action Plans', roles: [...SURVEYS_HR_ROLES, 'employee'] },
      { to: 'surveys?tab=trends', label: 'Satisfaction Trends', roles: [...SURVEYS_HR_ROLES] },
      { to: 'surveys?tab=my', label: 'My Surveys', roles: ['employee'] },
    ],
  },
  { to: 'inbox', label: 'Inbox', roles: ALL_MEMBERS },
  { to: 'analytics', label: 'Analytics', roles: ['company_admin', 'compensation_analytics'] },
  { to: 'tracking', label: 'Tracking & score', roles: ALL_MEMBERS },
  { to: 'certification', label: 'Certification', roles: ALL_MEMBERS },
  { to: 'exports', label: 'Exports', roles: [...EXPORT_ROLES] },
  { to: 'webhooks', label: 'Webhooks', roles: ['company_admin'] },
  { to: 'scenarios', label: 'Scenarios', roles: [...SCENARIO_ROLES] },
  { to: 'integrations/sso', label: 'SSO (stubs)', roles: ['company_admin'] },
]

export function companyNavItems(companyId: string, membership: CompanyMembership): CompanyNavItem[] {
  const base = `/company/${companyId}/`
  const role = membership.role
  return COMPANY_NAV_DEF.filter((item) => {
    if (!item.roles || item.roles.length === 0) return true
    return item.roles.includes(role)
  }).map((item) => {
    const entry: CompanyNavItem = {
      to: `${base}${item.to}`,
      label: item.label,
    }
    if (item.children && item.children.length > 0) {
      entry.children = item.children
        .filter((c) => !c.roles || c.roles.length === 0 || c.roles.includes(role))
        .map((c) => ({
          to: `${base}${c.to}`,
          label: c.label,
        }))
    }
    return entry
  })
}

/** Roles that can list all users' activity logs (backend tracking list). */
export function canListAllActivityLogs(role: string): boolean {
  return HR_ANALYTICS.has(role)
}
