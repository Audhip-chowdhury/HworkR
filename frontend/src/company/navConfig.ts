import type { CompanyMembership } from '../auth/AuthContext'
import {
  ALL_COMPANY_ROLES,
  COMPENSATION_ADMIN_ROLES,
  HR_NON_EMPLOYEE_ROLES,
  HR_OPS_ADMIN_ROLES,
  LD_ADMIN_ROLES,
  LEAVE_ORG_ADMIN_ROLES,
  RECRUITMENT_ADMIN_ROLES,
} from './companyAccess'

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

const ALL_MEMBERS = [...ALL_COMPANY_ROLES]

/** Approvals + org balance tracker — not Talent Acquisition (recruiting). */
const LEAVE_ORG_SUBTABS_ROLES = [...LEAVE_ORG_ADMIN_ROLES]

/** Employee directory — HR Operations + admin only. */
const EMPLOYEES_ADMIN_ROLES = [...HR_OPS_ADMIN_ROLES]

const PAYROLL_ROLES = [...ALL_COMPANY_ROLES] as const
const PAYROLL_CONFIGURE_ROLES = [...COMPENSATION_ADMIN_ROLES] as const

const BENEFITS_ROLES = [...ALL_COMPANY_ROLES] as const
const BENEFITS_MANAGE_ROLES = [...COMPENSATION_ADMIN_ROLES] as const

const SURVEYS_ROLES = [...ALL_COMPANY_ROLES] as const
/** Responses / trends — HR Ops + admin. */
const SURVEYS_HR_ADMIN_ROLES = [...HR_OPS_ADMIN_ROLES] as const

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
    roles: [...EMPLOYEES_ADMIN_ROLES],
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
      { to: 'leave/approvals', label: 'Leave approvals', roles: LEAVE_ORG_SUBTABS_ROLES },
      { to: 'leave/request', label: 'Leave request' },
      { to: 'leave/balances', label: 'Leave balance tracker', roles: LEAVE_ORG_SUBTABS_ROLES },
    ],
  },
  { to: 'audits/trail', label: 'Audit trail', roles: ALL_MEMBERS },
  {
    type: 'group',
    label: 'Policies',
    parentTo: 'audits/policies?tab=library',
    roles: ALL_MEMBERS,
    children: [
      { to: 'audits/policies?tab=library', label: 'Policy library' },
      { to: 'audits/policies?tab=publish', label: 'Publish', roles: [...HR_OPS_ADMIN_ROLES] },
    ],
  },
  {
    type: 'group',
    label: 'Recruitment',
    parentTo: 'recruitment',
    roles: ['company_admin', 'talent_acquisition', 'employee'],
    children: [
      { to: 'recruitment', label: 'Requisitions' },
      { to: 'recruitment/postings', label: 'Job postings' },
      { to: 'recruitment/pipeline', label: 'Pipeline' },
      { to: 'recruitment/interviews', label: 'Interviews' },
      { to: 'recruitment/offers', label: 'Offers' },
      { to: 'recruitment/candidate-portal', label: 'Candidate portal' },
      { to: 'recruitment/tracking', label: 'Tracking' },
      { to: 'workflows', label: 'Approval', roles: [...RECRUITMENT_ADMIN_ROLES] },
    ],
  },
  { to: 'performance', label: 'Performance', roles: [...HR_OPS_ADMIN_ROLES] },
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
        roles: [...LD_ADMIN_ROLES],
      },
      {
        to: 'learning/scores',
        label: 'Training scores',
        roles: [...LD_ADMIN_ROLES],
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
      { to: 'surveys?tab=responses', label: 'Responses & Analysis', roles: [...SURVEYS_HR_ADMIN_ROLES] },
      { to: 'surveys?tab=plans', label: 'Action Plans', roles: [...SURVEYS_HR_ADMIN_ROLES, 'employee'] },
      { to: 'surveys?tab=trends', label: 'Satisfaction Trends', roles: [...SURVEYS_HR_ADMIN_ROLES] },
      { to: 'surveys?tab=my', label: 'My Surveys', roles: ['employee'] },
    ],
  },
  { to: 'legal', label: 'Legal', roles: ALL_MEMBERS },
  { to: 'inbox', label: 'Inbox', roles: ALL_MEMBERS },
  { to: 'progress', label: 'Progress', roles: ALL_MEMBERS },
  {
    to: 'analytics',
    label: 'Analytics',
    roles: [...HR_NON_EMPLOYEE_ROLES],
  },
  { to: 'certification', label: 'Certification', roles: ALL_MEMBERS },
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
