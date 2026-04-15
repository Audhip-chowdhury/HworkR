/** Page titles keyed by first path segment(s) after /company/:id/ */

export function companySectionTitle(pathAfterCompany: string): { title: string; subtitle?: string } {
  const parts = pathAfterCompany.split('/').filter(Boolean)
  const key =
    parts[0] === 'integrations' && parts[1] === 'sso'
      ? 'integrations/sso'
      : parts[0] === 'employees' && parts[1]
        ? `employees/${parts[1]}`
        : parts[0] === 'leave' && parts[1]
          ? `leave/${parts[1]}`
          : parts[0] === 'audits' && parts[1] === 'policies' && parts[2] === 'publish'
            ? 'audits/policies/publish'
            : parts[0] === 'audits' && parts[1]
              ? `audits/${parts[1]}`
              : parts[0] || 'dashboard'

  const map: Record<string, { title: string; subtitle?: string }> = {
    dashboard: {
      title: 'Workspace dashboard',
      subtitle: 'Pending actions, score summary, and activity',
    },
    'my-profile': {
      title: 'My profile',
      subtitle: 'Personal employee record',
    },
    org: {
      title: 'Organizational structure',
      subtitle: 'Departments, positions, and reporting hierarchy',
    },
    workflows: {
      title: 'Workflows',
      subtitle: 'Templates and approval instances',
    },
    recruitment: {
      title: 'Recruitment',
      subtitle: 'ATS pipeline, interviews, and offers',
    },
    'employees/profile': {
      title: 'Employee profile management',
      subtitle: 'Directory, personal info, job info, and document management',
    },
    'employees/lifecycle': {
      title: 'Lifecycle events',
      subtitle: 'Onboarding checklist, transfers, promotions, terminations, and rehires',
    },
    'leave/policies': {
      title: 'Leave policies',
      subtitle: 'Types, allocations, and carry-forward rules',
    },
    'leave/holidays': {
      title: 'Holiday calendar',
      subtitle: 'Company holidays for the year',
    },
    'leave/approvals': {
      title: 'Leave approvals',
      subtitle: 'Pending and submitted requests by employee',
    },
    'leave/request': {
      title: 'Leave request',
      subtitle: 'Balances, calendar, and submit time off',
    },
    'leave/balances': {
      title: 'Leave balance tracker',
      subtitle: 'Per-employee leave totals by type',
    },
    'audits/trail': {
      title: 'Audit trail',
      subtitle: 'Activity and system audit entries by user',
    },
    'audits/policies': {
      title: 'Policy documents',
      subtitle: 'Download and acknowledge company policies',
    },
    'audits/policies/publish': {
      title: 'Publish policy',
      subtitle: 'Upload a new policy for all members to acknowledge',
    },
    members: { title: 'Members', subtitle: 'Company membership administration' },
    'hr-ops': { title: 'HR operations', subtitle: 'Leave, balances, attendance, holidays, and policy' },
    performance: { title: 'Performance', subtitle: 'Cycles, goals, assessments, PIPs' },
    learning: { title: 'Learning', subtitle: 'Courses, assignments, completions, skills' },
    payroll: { title: 'Payroll', subtitle: 'Salary structures, pay runs, payslips' },
    benefits: { title: 'Benefits', subtitle: 'Plans and enrollments' },
    surveys: { title: 'Surveys', subtitle: 'Engagement surveys and responses' },
    inbox: { title: 'Inbox', subtitle: 'Tasks requiring your action' },
    progress: {
      title: 'Progress',
      subtitle: 'Your certification readiness across Employee, Audit, and Leave',
    },
    analytics: { title: 'Analytics', subtitle: 'Company dashboard metrics' },
    tracking: {
      title: 'Tracking & score',
      subtitle: 'Activity logs and scoring',
    },
    certification: {
      title: 'Certification',
      subtitle: 'Tracks, progress, certificates',
    },
    exports: {
      title: 'Exports',
      subtitle: 'CSV downloads',
    },
    webhooks: {
      title: 'Webhooks',
      subtitle: 'Outbound event subscriptions',
    },
    scenarios: {
      title: 'Scenarios',
      subtitle: 'Synthetic HR signals for demos',
    },
    'integrations/sso': {
      title: 'SSO integrations',
      subtitle: 'OIDC/SAML contract stubs',
    },
  }

  if (key === 'workflows' && parts.length >= 2) {
    return {
      title: 'Workflow instance',
      subtitle: 'Approve or reject steps',
    }
  }

  return map[key] ?? { title: 'Company workspace' }
}
