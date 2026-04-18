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

  it('exposes Payroll sub-items for admins and only Payslips for employees', () => {
    const admin = companyNavItems('co1', {
      id: 'm1',
      user_id: 'u1',
      company_id: 'co1',
      role: 'company_admin',
      status: 'active',
      modules_access_json: null,
    })
    const payroll = admin.find((n) => n.label === 'Payroll')
    expect(payroll?.children?.length).toBe(7)
    expect(payroll?.children?.map((c) => c.label)).toContain('Salary structures')
    expect(payroll?.children?.map((c) => c.label)).toEqual([
      'Salary structures',
      'Grade structure',
      'Increment',
      'Reimbursements',
      'Pay runs',
      'Payslips',
      'Reconciliation',
    ])
    expect(payroll?.children?.some((c) => c.to.includes('tab=payslips'))).toBe(true)

    const benefits = admin.find((n) => n.label === 'Benefits')
    expect(benefits?.children?.map((c) => c.label)).toEqual(['Plans', 'Enrollments'])

    const emp = companyNavItems('co1', {
      id: 'm2',
      user_id: 'u2',
      company_id: 'co1',
      role: 'employee',
      status: 'active',
      modules_access_json: null,
    })
    const payrollEmp = emp.find((n) => n.label === 'Payroll')
    expect(payrollEmp?.children?.length).toBe(1)
    expect(payrollEmp?.children?.[0]?.label).toBe('Payslips')
  })
})

describe('canListAllActivityLogs', () => {
  it('allows HR analytics roles', () => {
    expect(canListAllActivityLogs('hr_ops')).toBe(true)
    expect(canListAllActivityLogs('employee')).toBe(false)
  })
})
