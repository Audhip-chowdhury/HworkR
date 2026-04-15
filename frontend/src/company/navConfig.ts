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
  { to: 'my-profile', label: 'My profile', roles: ['employee'] },
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
  { to: 'performance', label: 'Performance', roles: ['company_admin', 'ld_performance', 'employee'] },
  { to: 'learning', label: 'Learning', roles: ['company_admin', 'ld_performance', 'employee'] },
  { to: 'payroll', label: 'Payroll', roles: ['company_admin', 'compensation_analytics', 'employee'] },
  { to: 'benefits', label: 'Benefits', roles: ['company_admin', 'compensation_analytics', 'employee'] },
  { to: 'surveys', label: 'Surveys', roles: ['company_admin', 'compensation_analytics', 'employee'] },
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

export function companyNavItems(companyId: string, membership: CompanyMembership): NavResolvedItem[] {
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
      out.push({ kind: 'link', to: `${base}${leaf.to}`, label: leaf.label })
    }
  }
  return out
}

/** Roles that can list all users' activity logs (backend tracking list). */
export function canListAllActivityLogs(role: string): boolean {
  return HR_ANALYTICS.has(role)
}
