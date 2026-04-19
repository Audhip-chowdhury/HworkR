/** Page titles keyed by first path segment(s) after /company/:id/ */

export function companySectionTitle(pathAfterCompany: string): { title: string; subtitle?: string } {
  const parts = pathAfterCompany.split('/').filter(Boolean)
  const key =
    parts[0] === 'integrations' && parts[1] === 'sso'
      ? 'integrations/sso'
      : parts[0] === 'employees' && parts[1]
        ? `employees/${parts[1]}`
        : parts[0] === 'my-goals' && parts[1]
          ? `my-goals/${parts[1]}`
          : parts[0] === 'leave' && parts[1]
            ? `leave/${parts[1]}`
            : parts[0] === 'recruitment' && parts[1] === 'tracking'
              ? 'recruitment/tracking'
              : parts[0] === 'learning' && parts[1]
            ? `learning/${parts[1]}`
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
    'my-goals': {
      title: 'My review goals',
      subtitle: 'Fill targets and achievements for notified review cycles',
    },
    'my-goals/peer-review': {
      title: 'Peer review',
      subtitle: 'Colleagues at your grade who report to the same manager (works-with cohort)',
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
    'recruitment/tracking': {
      title: 'Candidate activity',
      subtitle: 'Pipeline transitions and application events',
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
    performance: { title: 'Performance', subtitle: 'Review cycles, goal tracking, assessments, PIPs' },
    learning: {
      title: 'Learning and Development',
      subtitle: 'Training courses, assignments, and scores',
    },
    'learning/assignments': {
      title: 'Training assignment',
      subtitle: 'Assigned courses, watch training videos, and completion status',
    },
    'learning/catalog': {
      title: 'Course catalog management',
      subtitle: 'Create courses and assign them to all employees',
    },
    'learning/scores': {
      title: 'Training scores',
      subtitle: 'Per-course employee scores and completion tracking',
    },
    payroll: { title: 'Payroll', subtitle: 'Salary structures, grade bands, pay runs, reconciliation, payslips' },
    benefits: { title: 'Benefits', subtitle: 'Plans and enrollments' },
    surveys: { title: 'Engagement & Surveys', subtitle: 'Pulse surveys, responses, action plans, and satisfaction trends' },
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
