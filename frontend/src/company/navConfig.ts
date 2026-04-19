import type { CompanyMembership } from '../auth/AuthContext'

export type NavLeaf = { to: string; label: string; roles?: string[] }

/** Single link or a sidebar group (e.g. Employees with sub-routes). */
export type NavDefItem =
  | NavLeaf
  | {
      type: 'group'
      label: string
      /** Main nav row links here (e.g. default employee tab); sub-routes show as a tree below. */
      parentTo?: string
      roles?: string[]
      children: NavLeaf[]
    }

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

const PAYROLL_ROLES = ['company_admin', 'compensation_analytics', 'hr_ops', 'employee'] as const
const PAYROLL_CONFIGURE_ROLES = ['company_admin', 'compensation_analytics', 'hr_ops'] as const
const BENEFITS_ROLES = ['company_admin', 'compensation_analytics', 'employee'] as const
const BENEFITS_MANAGE_ROLES = ['company_admin', 'compensation_analytics'] as const

const SURVEYS_ROLES = ['company_admin', 'compensation_analytics', 'hr_ops', 'employee'] as const
const SURVEYS_HR_ROLES = ['company_admin', 'compensation_analytics', 'hr_ops'] as const

const EMPLOYEES_ROLES = [
  'company_admin',
  'hr_ops',
  'talent_acquisition',
  'ld_performance',
  'compensation_analytics',
] as const

/** HR / leadership roles — not the base `employee` self-service role */
const LEAVE_HR_SUBTABS_ROLES = [
  'company_admin',
  'hr_ops',
  'talent_acquisition',
  'ld_performance',
  'compensation_analytics',
]

export const COMPANY_NAV_DEF: NavDefItem[] = [
  { to: '', label: 'Dashboard', roles: ALL_MEMBERS },
  { to: 'my-profile', label: 'My profile', roles: ['employee', 'hr_ops'] },
  { to: 'my-goals', label: 'My goals', roles: ['employee', 'hr_ops'] },
  { to: 'team-goals', label: 'Team goals', roles: ['employee', 'hr_ops'] },
  { to: 'org', label: 'Organization', roles: ALL_MEMBERS },
  {
    type: 'group',
    label: 'Employees',
    parentTo: 'employees/profile',
    roles: [...EMPLOYEES_ROLES],
    children: [
      { to: 'employees/profile', label: 'Employee profile management' },
      { to: 'employees/lifecycle', label: 'Lifecycle events' },
    ],
  },
  {
    type: 'group',
    label: 'Leave',
    parentTo: 'leave/policies',
    roles: ALL_MEMBERS,
    children: [
      { to: 'leave/policies', label: 'Leave policies' },
      { to: 'leave/holidays', label: 'Holiday calendar' },
      { to: 'leave/approvals', label: 'Leave approvals', roles: LEAVE_HR_SUBTABS_ROLES },
      { to: 'leave/request', label: 'Leave request' },
      { to: 'leave/balances', label: 'Leave balance tracker', roles: LEAVE_HR_SUBTABS_ROLES },
    ],
  },
  {
    type: 'group',
    label: 'Audits',
    parentTo: 'audits/trail',
    roles: ALL_MEMBERS,
    children: [
      { to: 'audits/trail', label: 'Audit trail' },
      { to: 'audits/policies', label: 'Policy documents' },
      { to: 'audits/policies/publish', label: 'Publish policy', roles: LEAVE_HR_SUBTABS_ROLES },
    ],
  },
  { to: 'members', label: 'Members', roles: ['company_admin'] },
  { to: 'hr-ops', label: 'HR Ops', roles: ['company_admin', 'hr_ops', 'employee'] },
  { to: 'workflows', label: 'Workflows', roles: WF_ROLES },
  { to: 'recruitment', label: 'Recruitment', roles: ALL_MEMBERS },
  { to: 'performance', label: 'Performance', roles: ['hr_ops'] },
  {
    type: 'group',
    label: 'Learning and Development',
    parentTo: 'learning/assignments',
    roles: ALL_MEMBERS,
    children: [
      { to: 'learning/assignments', label: 'Training assignment' },
      {
        to: 'learning/catalog',
        label: 'Course catalog management',
        roles: ['company_admin', 'hr_ops', 'ld_performance', 'talent_acquisition', 'compensation_analytics'],
      },
      {
        to: 'learning/scores',
        label: 'Training scores',
        roles: ['company_admin', 'hr_ops', 'ld_performance', 'talent_acquisition', 'compensation_analytics'],
      },
    ],
  },
  {
    type: 'group',
    label: 'Payroll',
    parentTo: 'payroll',
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
    type: 'group',
    label: 'Benefits',
    parentTo: 'benefits',
    roles: [...BENEFITS_ROLES],
    children: [
      { to: 'benefits?tab=plans', label: 'Plans', roles: [...BENEFITS_MANAGE_ROLES] },
      { to: 'benefits?tab=enrollments', label: 'Enrollments', roles: [...BENEFITS_MANAGE_ROLES] },
      { to: 'benefits?tab=myBenefits', label: 'My Benefits', roles: ['employee'] },
    ],
  },
  {
    type: 'group',
    label: 'Engagement & Surveys',
    parentTo: 'surveys',
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
  { to: 'progress', label: 'Progress', roles: ALL_MEMBERS },
  { to: 'analytics', label: 'Analytics', roles: ['company_admin', 'compensation_analytics'] },
  { to: 'tracking', label: 'Tracking & score', roles: ALL_MEMBERS },
  { to: 'certification', label: 'Certification', roles: ALL_MEMBERS },
  { to: 'exports', label: 'Exports', roles: [...EXPORT_ROLES] },
  { to: 'webhooks', label: 'Webhooks', roles: ['company_admin'] },
  { to: 'scenarios', label: 'Scenarios', roles: [...SCENARIO_ROLES] },
  { to: 'integrations/sso', label: 'SSO (stubs)', roles: ['company_admin'] },
]

export type NavResolvedItem =
  | { kind: 'link'; to: string; label: string }
  | {
      kind: 'group'
      label: string
      parentTo?: string
      children: { to: string; label: string }[]
    }

export function companyNavItems(
  companyId: string,
  membership: CompanyMembership,
  opts?: CompanyNavOptions,
): NavResolvedItem[] {
  const base = `/company/${companyId}/`
  const role = membership.role
  const out: NavResolvedItem[] = []
  for (const item of COMPANY_NAV_DEF) {
    if ('type' in item && item.type === 'group') {
      if (item.roles && !item.roles.includes(role)) continue
      const children = item.children
        .filter((c) => !c.roles || c.roles.includes(role))
        .map((c) => ({
          to: `${base}${c.to}`,
          label: c.label,
        }))
      if (children.length === 0) continue
      out.push({
        kind: 'group',
        label: item.label,
        parentTo: item.parentTo ? `${base}${item.parentTo}` : undefined,
        children,
      })
    } else {
      const leaf = item as NavLeaf
      if (leaf.roles && !leaf.roles.includes(role)) continue
      if (
        leaf.to === 'team-goals' &&
        (role === 'employee' || role === 'hr_ops') &&
        opts?.showTeamGoals === false
      ) {
        continue
      }
      out.push({ kind: 'link', to: `${base}${leaf.to}`, label: leaf.label })
    }
  }
  return out
}

/** Roles that can list all users' activity logs (backend tracking list). */
export function canListAllActivityLogs(role: string): boolean {
  return HR_ANALYTICS.has(role)
}
