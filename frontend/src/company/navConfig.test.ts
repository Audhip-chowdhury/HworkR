import { describe, expect, it } from 'vitest'
import { companyNavItems, canListAllActivityLogs } from './navConfig'

describe('companyNavItems', () => {
  it('includes webhooks only for company_admin', () => {
    const admin = companyNavItems('co1', {
      id: 'm1',
      user_id: 'u1',
      company_id: 'co1',
      role: 'company_admin',
      status: 'active',
      modules_access_json: null,
    })
    expect(admin.some((n) => n.label === 'Webhooks')).toBe(true)

    const emp = companyNavItems('co1', {
      id: 'm2',
      user_id: 'u2',
      company_id: 'co1',
      role: 'employee',
      status: 'active',
      modules_access_json: null,
    })
    expect(emp.some((n) => n.label === 'Webhooks')).toBe(false)
    expect(emp.some((n) => n.label === 'Organization')).toBe(true)
  })

  it('shows Performance only for hr_ops', () => {
    const hr = companyNavItems('co1', {
      id: 'm1',
      user_id: 'u1',
      company_id: 'co1',
      role: 'hr_ops',
      status: 'active',
      modules_access_json: null,
    })
    expect(hr.some((n) => n.label === 'Performance')).toBe(true)

    for (const role of ['employee', 'company_admin', 'ld_performance'] as const) {
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
})

describe('canListAllActivityLogs', () => {
  it('allows HR analytics roles', () => {
    expect(canListAllActivityLogs('hr_ops')).toBe(true)
    expect(canListAllActivityLogs('employee')).toBe(false)
  })
})
