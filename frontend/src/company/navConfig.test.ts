import { describe, expect, it } from 'vitest'
import { canListAllActivityLogs } from './companyAccess'
import { companyNavItems, type NavResolvedItem } from './navConfig'

function findGroup(items: NavResolvedItem[], label: string) {
  const item = items.find((n) => n.label === label)
  return item && item.kind === 'group' ? item : undefined
}

describe('companyNavItems', () => {
  it('does not include HR Ops, Exports, Webhooks, Scenarios, or SSO in the sidebar', () => {
    const admin = companyNavItems('co1', {
      id: 'm1',
      user_id: 'u1',
      company_id: 'co1',
      role: 'company_admin',
      status: 'active',
      modules_access_json: null,
    })
    const removed = ['HR Ops', 'Exports', 'Webhooks', 'Scenarios', 'SSO (stubs)']
    for (const label of removed) {
      expect(admin.some((n) => n.kind === 'link' && n.label === label)).toBe(false)
    }
    const empGroup = findGroup(admin, 'Employees')
    expect(empGroup).toBeDefined()
    expect(empGroup?.children.map((c) => c.label)).toEqual([
      'Employee profile management',
      'Lifecycle events',
    ])

    const emp = companyNavItems('co1', {
      id: 'm2',
      user_id: 'u2',
      company_id: 'co1',
      role: 'employee',
      status: 'active',
      modules_access_json: null,
    })
    for (const label of removed) {
      expect(emp.some((n) => n.kind === 'link' && n.label === label)).toBe(false)
    }
    expect(emp.some((n) => n.kind === 'link' && n.label === 'Organization')).toBe(true)
  })

  it('shows Performance for HR Operations and company admin only', () => {
    const hr = companyNavItems('co1', {
      id: 'm1',
      user_id: 'u1',
      company_id: 'co1',
      role: 'hr_ops',
      status: 'active',
      modules_access_json: null,
    })
    expect(hr.some((n) => n.label === 'Performance')).toBe(true)

    const admin = companyNavItems('co1', {
      id: 'm1b',
      user_id: 'u1b',
      company_id: 'co1',
      role: 'company_admin',
      status: 'active',
      modules_access_json: null,
    })
    expect(admin.some((n) => n.label === 'Performance')).toBe(true)

    for (const role of ['employee', 'ld_performance', 'talent_acquisition', 'compensation_analytics'] as const) {
      const nav = companyNavItems('co1', {
        id: 'm2',
        user_id: 'u2',
        company_id: 'co1',
        role,
        status: 'active',
        modules_access_json: null,
      })
      expect(nav.some((n) => n.label === 'Performance')).toBe(false)
    }
  })

  it('hides Team goals for employees when showTeamGoals is false', () => {
    const membership = {
      id: 'm2',
      user_id: 'u2',
      company_id: 'co1',
      role: 'employee' as const,
      status: 'active' as const,
      modules_access_json: null,
    }
    const withTeam = companyNavItems('co1', membership)
    expect(withTeam.some((n) => n.label === 'Team goals')).toBe(true)

    const withoutTeam = companyNavItems('co1', membership, { showTeamGoals: false })
    expect(withoutTeam.some((n) => n.label === 'Team goals')).toBe(false)
  })

  it('hides Team goals for hr_ops when showTeamGoals is false', () => {
    const membership = {
      id: 'm3',
      user_id: 'u3',
      company_id: 'co1',
      role: 'hr_ops' as const,
      status: 'active' as const,
      modules_access_json: null,
    }
    const withTeam = companyNavItems('co1', membership)
    expect(withTeam.some((n) => n.label === 'Team goals')).toBe(true)
    const withoutTeam = companyNavItems('co1', membership, { showTeamGoals: false })
    expect(withoutTeam.some((n) => n.label === 'Team goals')).toBe(false)
  })

  it('exposes Payroll sub-items for admins and only Payslips for employees', () => {
    const admin = companyNavItems('co1', {
      id: 'm1',
      user_id: 'u1',
      company_id: 'co1',
      role: 'company_admin',
      status: 'active',
      modules_access_json: null,
    })
    const payroll = findGroup(admin, 'Payroll')
    expect(payroll).toBeDefined()
    expect(payroll?.children.length).toBe(7)
    expect(payroll?.children.map((c) => c.label)).toContain('Salary structures')
    expect(payroll?.children.map((c) => c.label)).toEqual([
      'Salary structures',
      'Grade structure',
      'Increment',
      'Reimbursements',
      'Pay runs',
      'Payslips',
      'Reconciliation',
    ])
    expect(payroll?.children.some((c) => c.to.includes('tab=payslips'))).toBe(true)

    const benefits = findGroup(admin, 'Benefits')
    expect(benefits?.children.map((c) => c.label)).toEqual(['Plans', 'Enrollments'])

    const emp = companyNavItems('co1', {
      id: 'm2',
      user_id: 'u2',
      company_id: 'co1',
      role: 'employee',
      status: 'active',
      modules_access_json: null,
    })
    const payrollEmp = findGroup(emp, 'Payroll')
    expect(payrollEmp?.children.length).toBe(1)
    expect(payrollEmp?.children[0]?.label).toBe('Payslips')
  })

  it('exposes Engagement & Surveys sub-items for HR vs employee', () => {
    const admin = companyNavItems('co1', {
      id: 'm1',
      user_id: 'u1',
      company_id: 'co1',
      role: 'hr_ops',
      status: 'active',
      modules_access_json: null,
    })
    const eng = findGroup(admin, 'Engagement & Surveys')
    expect(eng?.children.map((c) => c.label)).toEqual([
      'Surveys',
      'Responses & Analysis',
      'Action Plans',
      'Satisfaction Trends',
    ])
    expect(eng?.children.some((c) => c.to.includes('tab=responses'))).toBe(true)

    const emp = companyNavItems('co1', {
      id: 'm2',
      user_id: 'u2',
      company_id: 'co1',
      role: 'employee',
      status: 'active',
      modules_access_json: null,
    })
    const engEmp = findGroup(emp, 'Engagement & Surveys')
    expect(engEmp?.children.map((c) => c.label)).toEqual(['Surveys', 'Action Plans', 'My Surveys'])
  })
})

describe('canListAllActivityLogs', () => {
  it('allows only HR Operations and company admin to search any member audit trail', () => {
    expect(canListAllActivityLogs('hr_ops')).toBe(true)
    expect(canListAllActivityLogs('company_admin')).toBe(true)
    expect(canListAllActivityLogs('talent_acquisition')).toBe(false)
    expect(canListAllActivityLogs('ld_performance')).toBe(false)
    expect(canListAllActivityLogs('compensation_analytics')).toBe(false)
    expect(canListAllActivityLogs('employee')).toBe(false)
  })
})

describe('role-based nav (HR split)', () => {
  it('shows leave approvals and balance tracker only for hr_ops', () => {
    const ta = companyNavItems('co1', {
      id: 'm-ta',
      user_id: 'u-ta',
      company_id: 'co1',
      role: 'talent_acquisition',
      status: 'active',
      modules_access_json: null,
    })
    const leave = findGroup(ta, 'Leave')
    expect(leave).toBeDefined()
    const labels = leave?.children.map((c) => c.label) ?? []
    expect(labels).toContain('Leave policies')
    expect(labels).not.toContain('Leave approvals')
    expect(labels).not.toContain('Leave balance tracker')

    const admin = companyNavItems('co1', {
      id: 'm-admin',
      user_id: 'u-admin',
      company_id: 'co1',
      role: 'company_admin',
      status: 'active',
      modules_access_json: null,
    })
    const adminLeave = findGroup(admin, 'Leave')
    const adminLabels = adminLeave?.children.map((c) => c.label) ?? []
    expect(adminLabels).not.toContain('Leave approvals')
    expect(adminLabels).not.toContain('Leave balance tracker')

    const hrOps = companyNavItems('co1', {
      id: 'm-hr',
      user_id: 'u-hr',
      company_id: 'co1',
      role: 'hr_ops',
      status: 'active',
      modules_access_json: null,
    })
    const hrLeave = findGroup(hrOps, 'Leave')
    const hrLabels = hrLeave?.children.map((c) => c.label) ?? []
    expect(hrLabels).toContain('Leave approvals')
    expect(hrLabels).toContain('Leave balance tracker')
  })

  it('shows Employees only for HR Ops and company admin', () => {
    const ta = companyNavItems('co1', {
      id: 'm1',
      user_id: 'u1',
      company_id: 'co1',
      role: 'talent_acquisition',
      status: 'active',
      modules_access_json: null,
    })
    expect(ta.some((n) => n.kind === 'group' && n.label === 'Employees')).toBe(false)

    const hr = companyNavItems('co1', {
      id: 'm2',
      user_id: 'u2',
      company_id: 'co1',
      role: 'hr_ops',
      status: 'active',
      modules_access_json: null,
    })
    expect(hr.some((n) => n.kind === 'group' && n.label === 'Employees')).toBe(true)
  })

  it('shows Approval only for recruitment and company admin', () => {
    const hr = companyNavItems('co1', {
      id: 'm1',
      user_id: 'u1',
      company_id: 'co1',
      role: 'hr_ops',
      status: 'active',
      modules_access_json: null,
    })
    expect(hr.some((n) => n.kind === 'link' && n.label === 'Approval')).toBe(false)

    const ta = companyNavItems('co1', {
      id: 'm2',
      user_id: 'u2',
      company_id: 'co1',
      role: 'talent_acquisition',
      status: 'active',
      modules_access_json: null,
    })
    const recruitmentGroup = ta.find((n) => n.kind === 'group' && n.label === 'Recruitment')
    expect(recruitmentGroup?.kind === 'group' && recruitmentGroup.children.some((c) => c.label === 'Approval')).toBe(true)
  })
})
