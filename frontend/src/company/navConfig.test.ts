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
    expect(admin.some((n) => n.kind === 'link' && n.label === 'Webhooks')).toBe(true)
    const empGroup = admin.find((n) => n.kind === 'group' && n.label === 'Employees')
    expect(empGroup?.kind).toBe('group')
    if (empGroup?.kind === 'group') {
      expect(empGroup.children.map((c) => c.label)).toEqual([
        'Employee profile management',
        'Lifecycle events',
      ])
    }

    const emp = companyNavItems('co1', {
      id: 'm2',
      user_id: 'u2',
      company_id: 'co1',
      role: 'employee',
      status: 'active',
      modules_access_json: null,
    })
    expect(emp.some((n) => n.kind === 'link' && n.label === 'Webhooks')).toBe(false)
    expect(emp.some((n) => n.kind === 'link' && n.label === 'Organization')).toBe(true)
  })
})

describe('canListAllActivityLogs', () => {
  it('allows HR analytics roles', () => {
    expect(canListAllActivityLogs('hr_ops')).toBe(true)
    expect(canListAllActivityLogs('employee')).toBe(false)
  })
})
