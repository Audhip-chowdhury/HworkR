/** Page titles keyed by first path segment(s) after /company/:id/ */

export function companySectionTitle(pathAfterCompany: string): { title: string; subtitle?: string } {
  const parts = pathAfterCompany.split('/').filter(Boolean)
  const key =
    parts[0] === 'integrations' && parts[1] === 'sso'
      ? 'integrations/sso'
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
    'my-goals': {
      title: 'My review goals',
      subtitle: 'Fill targets and achievements for notified review cycles',
    },
    'team-goals': {
      title: 'Team goals review',
      subtitle: "Rate and comment on your direct reports' goals",
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
    employees: { title: 'Employees', subtitle: 'Employee records and lifecycle' },
    members: { title: 'Members', subtitle: 'Company membership administration' },
    'hr-ops': { title: 'HR operations', subtitle: 'Leave, balances, attendance, holidays, and policy' },
    performance: { title: 'Performance', subtitle: 'Cycles, goals, assessments, PIPs' },
    learning: { title: 'Learning', subtitle: 'Courses, assignments, completions, skills' },
    payroll: { title: 'Payroll', subtitle: 'Salary structures, pay runs, payslips' },
    benefits: { title: 'Benefits', subtitle: 'Plans and enrollments' },
    surveys: { title: 'Surveys', subtitle: 'Engagement surveys and responses' },
    inbox: { title: 'Inbox', subtitle: 'Tasks requiring your action' },
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
