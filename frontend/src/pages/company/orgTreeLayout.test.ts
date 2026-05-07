import { describe, expect, it } from 'vitest'
import {
  buildDepartmentOrgLayout,
  buildGradeDepartmentLayout,
  computeManagerColumnOrder,
  hasValidInCompanyParent,
  partitionDepartmentPillars,
  type DepartmentBlock,
} from './orgTreeLayout'

type P = {
  id: string
  name: string
  grade: number
  reports_to_id: string | null
}

function node(id: string, name: string, grade: number, reports_to_id: string | null): P {
  return { id, name, grade, reports_to_id }
}

/** All grade rows in visual order (one department after another). */
function flattenGradeRows<T>(departments: DepartmentBlock<T>[]) {
  return departments.flatMap((d) => d.gradeRows.map((gr) => ({ layer: gr.layer, nodes: gr.nodes })))
}

describe('hasValidInCompanyParent', () => {
  it('returns false when reports_to_id is null', () => {
    const p = node('a', 'A', 1, null)
    const byId = new Map<string, P>([['a', p]])
    expect(hasValidInCompanyParent(p, byId)).toBe(false)
  })

  it('returns false when self-reports', () => {
    const p = node('a', 'A', 1, 'a')
    const byId = new Map<string, P>([['a', p]])
    expect(hasValidInCompanyParent(p, byId)).toBe(false)
  })

  it('returns false when parent id is missing', () => {
    const p = node('b', 'B', 1, 'ghost')
    const byId = new Map<string, P>([['b', p]])
    expect(hasValidInCompanyParent(p, byId)).toBe(false)
  })

  it('returns true when parent exists in company set', () => {
    const a = node('a', 'A', 1, null)
    const b = node('b', 'B', 2, 'a')
    const byId = new Map<string, P>([
      ['a', a],
      ['b', b],
    ])
    expect(hasValidInCompanyParent(b, byId)).toBe(true)
  })
})

describe('computeManagerColumnOrder', () => {
  it('orders descendants right after their root, alphabetical between roots', () => {
    const a = node('a', 'Alice', 1, null)
    const c = node('c', 'Cara', 5, 'a')
    const b = node('b', 'Bob', 1, null)
    const byId = new Map<string, P>([['a', a], ['b', b], ['c', c]])
    const order = computeManagerColumnOrder([c, b, a], byId)
    expect(order.get('a')).toBeLessThan(order.get('c')!)
    expect(order.get('c')).toBeLessThan(order.get('b')!)
  })

  it('puts siblings of the same manager consecutive in the order', () => {
    const m = node('m', 'M', 1, null)
    const x = node('x', 'X', 5, 'm')
    const y = node('y', 'Y', 5, 'm')
    const z = node('z', 'Z', 5, 'm')
    const byId = new Map<string, P>([['m', m], ['x', x], ['y', y], ['z', z]])
    const order = computeManagerColumnOrder([z, y, x, m], byId)
    expect(order.get('m')).toBe(0)
    const slots = [order.get('x')!, order.get('y')!, order.get('z')!].sort((p, q) => p - q)
    expect(slots).toEqual([1, 2, 3])
  })

  it('treats self-reports as roots without infinite recursion', () => {
    const a = node('a', 'A', 1, 'a')
    const byId = new Map<string, P>([['a', a]])
    const order = computeManagerColumnOrder([a], byId)
    expect(order.get('a')).toBe(0)
  })

  it('breaks cycles by treating leftover nodes as additional roots', () => {
    const a = node('a', 'A', 1, 'b')
    const b = node('b', 'B', 1, 'a')
    const byId = new Map<string, P>([['a', a], ['b', b]])
    const order = computeManagerColumnOrder([b, a], byId)
    expect(order.size).toBe(2)
    expect(new Set([order.get('a'), order.get('b')])).toEqual(new Set([0, 1]))
  })
})

describe('buildDepartmentOrgLayout', () => {
  it('groups roots of one department into the same top hierarchy layer', () => {
    const a = node('a', 'CEO', 1, null)
    const b = node('b', 'Mgr', 12, null)
    const c = node('c', 'Exec', 38, null)
    const { departments } = buildDepartmentOrgLayout([c, a, b])
    expect(departments).toHaveLength(1)
    const rows = flattenGradeRows(departments)
    expect(rows.map((r) => r.layer)).toEqual([0])
  })

  it('keeps two independent roots in the same hierarchy layer', () => {
    const ceo = node('ceo', 'CEO', 1, null)
    const cs = node('cs', 'Customer Support', 11, null)
    const { departments, rowIndexById } = buildDepartmentOrgLayout([ceo, cs])
    expect(departments).toHaveLength(1)
    expect(flattenGradeRows(departments)).toHaveLength(1)
    expect(rowIndexById.get('ceo')).toBe(0)
    expect(rowIndexById.get('cs')).toBe(0)
  })

  it('places a child below its manager layer even when grade is more senior', () => {
    const hrExec = node('hrx', 'HR Executive', 38, null)
    const ceO = node('ceo2', 'ceO', 11, 'hrx')
    const { departments, rowIndexById } = buildDepartmentOrgLayout([hrExec, ceO])
    const rows = flattenGradeRows(departments)
    expect(rows.map((r) => r.layer)).toEqual([0, 1])
    expect(rowIndexById.get('hrx')).toBe(0)
    expect(rowIndexById.get('ceo2')).toBe(1)
    const childLayer = rows.find((r) => r.layer === 1)!
    expect(childLayer.nodes.map((n) => n.id)).toEqual(['ceo2'])
  })

  it('clusters two children of the same manager next to each other in their row', () => {
    const mgr = node('mgr', 'Manager', 1, null)
    const other = node('other', 'Other Root', 1, null)
    const otherKid1 = node('ok1', 'A Kid', 5, 'other')
    const otherKid2 = node('ok2', 'B Kid', 5, 'other')
    const childA = node('a', 'Alpha', 5, 'mgr')
    const childB = node('b', 'Beta', 5, 'mgr')
    const { departments } = buildDepartmentOrgLayout([childB, otherKid2, otherKid1, childA, other, mgr])
    const row1 = flattenGradeRows(departments).find((r) => r.layer === 1)!
    const ids = row1.nodes.map((n) => n.id)
    const aIdx = ids.indexOf('a')
    const bIdx = ids.indexOf('b')
    const ok1Idx = ids.indexOf('ok1')
    const ok2Idx = ids.indexOf('ok2')
    expect(Math.abs(aIdx - bIdx)).toBe(1)
    expect(Math.abs(ok1Idx - ok2Idx)).toBe(1)
    // Each manager's children stay contiguous (no foreign card splits them).
    const mgrSpan = [Math.min(aIdx, bIdx), Math.max(aIdx, bIdx)] as const
    const otherSpan = [Math.min(ok1Idx, ok2Idx), Math.max(ok1Idx, ok2Idx)] as const
    expect(mgrSpan[1] - mgrSpan[0]).toBe(1)
    expect(otherSpan[1] - otherSpan[0]).toBe(1)
    expect(mgrSpan[0] < otherSpan[0] || otherSpan[0] < mgrSpan[0]).toBe(true)
  })

  it('orders a row by DFS, not pure alphabetical', () => {
    const root1 = node('a', 'Alice Root', 1, null)
    const root2 = node('b', 'Bob Root', 1, null)
    const childOfA = node('c', 'Zeta Child', 5, 'a')
    const childOfB = node('d', 'Mira Child', 5, 'b')
    const { departments } = buildDepartmentOrgLayout([childOfB, childOfA, root2, root1])
    const row1 = flattenGradeRows(departments).find((r) => r.layer === 1)!
    expect(row1.nodes.map((n) => n.id)).toEqual(['c', 'd'])
  })

  it('rowIndexById covers every position', () => {
    const a = node('a', 'A', 1, null)
    const b = node('b', 'B', 5, 'a')
    const c = node('c', 'C', 5, 'a')
    const { rowIndexById } = buildDepartmentOrgLayout([a, b, c])
    expect(rowIndexById.get('a')).toBe(0)
    expect(rowIndexById.get('b')).toBe(1)
    expect(rowIndexById.get('c')).toBe(1)
  })

  it('keeps one department container with every grade band inside when department_id matches', () => {
    const eng = {
      id: 'e',
      name: 'E',
      grade: 10,
      reports_to_id: null,
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'department',
    }
    const fin = {
      id: 'f',
      name: 'F',
      grade: 15,
      reports_to_id: null,
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'department',
    }
    const { departments } = buildDepartmentOrgLayout([fin, eng])
    expect(departments).toHaveLength(1)
    expect(departments[0]!.label).toBe('Engineering')
    expect(departments[0]!.gradeRows.map((r) => r.layer)).toEqual([0])
  })

  it('returns gradeRows ascending by grade so seniors render at the top of each department box', () => {
    const cto = {
      id: 'cto',
      name: 'CTO',
      grade: 5,
      reports_to_id: null,
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'c_suite',
    }
    const swe = {
      id: 'swe',
      name: 'SWE II',
      grade: 28,
      reports_to_id: 'cto',
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'department',
    }
    const intern = {
      id: 'i',
      name: 'Intern',
      grade: 35,
      reports_to_id: 'swe',
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'department',
    }
    const vp = {
      id: 'vp',
      name: 'VP Eng',
      grade: 10,
      reports_to_id: 'cto',
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'department',
    }
    // Pass them deliberately out of order; the layout should still ascend.
    const { departments } = buildDepartmentOrgLayout([intern, swe, vp, cto])
    expect(departments).toHaveLength(1)
    const layers = departments[0]!.gradeRows.map((r) => r.layer)
    expect(layers).toEqual([-1, 1, 2])
    // Strictly ascending and matches sorted copy.
    expect(layers).toEqual([...layers].sort((a, b) => a - b))
  })

  it('pins c_suite to the top layer inside a department box, then follows reports_to depth', () => {
    const cto = {
      id: 'cto',
      name: 'CTO',
      grade: 5,
      reports_to_id: null as string | null,
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'c_suite',
    }
    const mgr = {
      id: 'mgr',
      name: 'Eng Manager',
      grade: 15,
      reports_to_id: 'cto',
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'department',
    }
    const ic = {
      id: 'ic',
      name: 'Engineer',
      grade: 28,
      reports_to_id: 'mgr',
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'department',
    }
    const { departments } = buildDepartmentOrgLayout([ic, mgr, cto])
    expect(departments).toHaveLength(1)
    expect(departments[0]!.gradeRows.map((r) => r.layer)).toEqual([-1, 1, 2])
  })

  it('keeps C-suite panels first: dedicated C-suite strip, then other C-suite placements, then the rest', () => {
    const ceo = {
      id: 'ceo',
      name: 'CEO',
      grade: 1,
      reports_to_id: null as string | null,
      bucket: 'c_suite',
    }
    const cfo = {
      id: 'cfo',
      name: 'CFO',
      grade: 5,
      reports_to_id: 'ceo',
      department_id: 'df',
      department_name: 'Finance',
      bucket: 'c_suite',
    }
    const vpEng = {
      id: 'vp',
      name: 'VP Eng',
      grade: 10,
      reports_to_id: 'ceo',
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'department',
    }
    const { departments } = buildDepartmentOrgLayout([vpEng, cfo, ceo])
    expect(departments.map((d) => d.key)).toEqual(['dep:csuite', 'dep:df', 'dep:de1'])
  })

  it('uses separate department containers when department_id differs', () => {
    const eng = {
      id: 'e',
      name: 'E',
      grade: 10,
      reports_to_id: null,
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'department',
    }
    const fin = {
      id: 'f',
      name: 'F',
      grade: 10,
      reports_to_id: null,
      department_id: 'df',
      department_name: 'Finance',
      bucket: 'department',
    }
    const { departments } = buildDepartmentOrgLayout([fin, eng])
    expect(departments).toHaveLength(2)
    expect(departments.map((d) => d.label).sort()).toEqual(['Engineering', 'Finance'])
    for (const d of departments) {
      expect(d.gradeRows).toHaveLength(1)
      expect(d.gradeRows[0]!.nodes).toHaveLength(1)
    }
  })
})

describe('buildGradeDepartmentLayout', () => {
  it('emits a placeholder cell at grades inside the department active range with no card, and omits it outside', () => {
    const senior = {
      id: 's',
      name: 'Senior',
      grade: 5,
      reports_to_id: null,
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'department',
    }
    const junior = {
      id: 'j',
      name: 'Junior',
      grade: 28,
      reports_to_id: 's',
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'department',
    }
    const otherTop = {
      id: 'o1',
      name: 'Top Other',
      grade: 1,
      reports_to_id: null,
      department_id: 'do',
      department_name: 'Ops',
      bucket: 'department',
    }
    const otherMid = {
      id: 'o2',
      name: 'Mid Other',
      grade: 15,
      reports_to_id: 'o1',
      department_id: 'do',
      department_name: 'Ops',
      bucket: 'department',
    }
    const otherBottom = {
      id: 'o3',
      name: 'Bottom Other',
      grade: 38,
      reports_to_id: 'o2',
      department_id: 'do',
      department_name: 'Ops',
      bucket: 'department',
    }

    const { rows, departmentColumns } = buildGradeDepartmentLayout([
      senior,
      junior,
      otherTop,
      otherMid,
      otherBottom,
    ])

    const eng = departmentColumns.find((d) => d.key === 'dep:de1')!
    expect(eng.minGrade).toBe(5)
    expect(eng.maxGrade).toBe(28)

    const cellsByGrade = new Map(rows.map((r) => [r.grade, r.cells]))

    // G1: outside Engineering's [5, 28] range -> Engineering omitted entirely.
    expect(cellsByGrade.get(1)!.some((c) => c.key === 'dep:de1')).toBe(false)
    // G5: card for Engineering.
    expect(cellsByGrade.get(5)!.find((c) => c.key === 'dep:de1')!.kind).toBe('card')
    // G15: inside [5, 28] but no Engineering card -> placeholder.
    expect(cellsByGrade.get(15)!.find((c) => c.key === 'dep:de1')!.kind).toBe('placeholder')
    // G28: card for Engineering.
    expect(cellsByGrade.get(28)!.find((c) => c.key === 'dep:de1')!.kind).toBe('card')
    // G38: outside Engineering's range -> Engineering omitted entirely.
    expect(cellsByGrade.get(38)!.some((c) => c.key === 'dep:de1')).toBe(false)
  })

  it('keeps the same columnIndex for one department across every grade row it appears in', () => {
    const ceo = {
      id: 'ceo',
      name: 'CEO',
      grade: 1,
      reports_to_id: null,
      bucket: 'c_suite',
    }
    const eng5 = {
      id: 'e5',
      name: 'CTO',
      grade: 5,
      reports_to_id: 'ceo',
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'c_suite',
    }
    const eng10 = {
      id: 'e10',
      name: 'VP Eng',
      grade: 10,
      reports_to_id: 'e5',
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'department',
    }
    const eng28 = {
      id: 'e28',
      name: 'SWE II',
      grade: 28,
      reports_to_id: 'e10',
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'department',
    }
    const fin5 = {
      id: 'f5',
      name: 'CFO',
      grade: 5,
      reports_to_id: 'ceo',
      department_id: 'df',
      department_name: 'Finance',
      bucket: 'c_suite',
    }

    const { rows } = buildGradeDepartmentLayout([ceo, eng5, eng10, eng28, fin5])

    const engCells = rows.flatMap((r) => r.cells.filter((c) => c.key === 'dep:de1'))
    const finCells = rows.flatMap((r) => r.cells.filter((c) => c.key === 'dep:df'))
    expect(engCells.length).toBeGreaterThan(0)
    expect(finCells.length).toBeGreaterThan(0)
    expect(new Set(engCells.map((c) => c.columnIndex)).size).toBe(1)
    expect(new Set(finCells.map((c) => c.columnIndex)).size).toBe(1)
  })

  it('puts CEO (no department_id) in the synthetic c_suite column and keeps other c_suite roles in their led-department column', () => {
    const ceo = {
      id: 'ceo',
      name: 'CEO',
      grade: 1,
      reports_to_id: null,
      bucket: 'c_suite',
    }
    const cfo = {
      id: 'cfo',
      name: 'CFO',
      grade: 5,
      reports_to_id: 'ceo',
      department_id: 'df',
      department_name: 'Finance',
      bucket: 'c_suite',
    }
    const vpEng = {
      id: 'vp',
      name: 'VP Eng',
      grade: 10,
      reports_to_id: 'ceo',
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'department',
    }

    const { rows, departmentColumns } = buildGradeDepartmentLayout([ceo, cfo, vpEng])

    expect(departmentColumns.map((d) => d.key)).toEqual(['dep:csuite', 'dep:df', 'dep:de1'])
    expect(departmentColumns[0]!.label).toBe('C-suite')
    expect(departmentColumns[1]!.label).toBe('Finance')
    expect(departmentColumns[2]!.label).toBe('Engineering')

    const g1 = rows.find((r) => r.grade === 1)!
    expect(g1.cells.map((c) => c.key)).toEqual(['dep:csuite'])
    expect(g1.cells[0]!.kind).toBe('card')

    const g5 = rows.find((r) => r.grade === 5)!
    const finCell = g5.cells.find((c) => c.key === 'dep:df')!
    expect(finCell.kind).toBe('card')
    expect(g5.cells.some((c) => c.key === 'dep:csuite')).toBe(false)

    const g10 = rows.find((r) => r.grade === 10)!
    const engCell = g10.cells.find((c) => c.key === 'dep:de1')!
    expect(engCell.kind).toBe('card')
    expect(g10.cells.some((c) => c.key === 'dep:csuite')).toBe(false)
  })

  it('returns cells in ascending columnIndex order within a row', () => {
    const ceo = { id: 'ceo', name: 'CEO', grade: 1, reports_to_id: null, bucket: 'c_suite' }
    const cfo = {
      id: 'cfo',
      name: 'CFO',
      grade: 5,
      reports_to_id: 'ceo',
      department_id: 'df',
      department_name: 'Finance',
      bucket: 'c_suite',
    }
    const cto = {
      id: 'cto',
      name: 'CTO',
      grade: 5,
      reports_to_id: 'ceo',
      department_id: 'de1',
      department_name: 'Engineering',
      bucket: 'c_suite',
    }
    const { rows } = buildGradeDepartmentLayout([cto, cfo, ceo])
    const g5 = rows.find((r) => r.grade === 5)!
    const indices = g5.cells.map((c) => c.columnIndex)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
  })
})

describe('partitionDepartmentPillars', () => {
  it('places a department that rolls up through CTO under Engineering', () => {
    const ceo = { id: 'ceo', name: 'CEO', grade: 1, reports_to_id: null, bucket: 'c_suite' as const }
    const cto = {
      id: 'cto',
      name: 'CTO',
      grade: 5,
      reports_to_id: 'ceo',
      department_id: 'eng',
      department_name: 'Engineering',
      bucket: 'c_suite' as const,
    }
    const vpProduct = {
      id: 'vpP',
      name: 'VP Product',
      grade: 10,
      reports_to_id: 'cto',
      department_id: 'prod',
      department_name: 'Product',
      bucket: 'none' as const,
    }
    const positions = [ceo, cto, vpProduct]
    const { departments } = buildDepartmentOrgLayout(positions as never)
    const { primaryOrdered, satellitesByAnchorPrimary } = partitionDepartmentPillars(positions as never, departments)

    const primaryKeys = new Set(primaryOrdered.map((d) => d.key))
    expect(primaryKeys.has('dep:eng')).toBe(true)
    expect(primaryKeys.has('dep:prod')).toBe(false)

    const underEng = satellitesByAnchorPrimary.get('dep:eng') ?? []
    expect(underEng).toHaveLength(1)
    expect(underEng[0]!.key).toBe('dep:prod')
  })

  it('places Support under Customer Success when Support Lead reports to VP CS', () => {
    const ceo = { id: 'ceo', name: 'CEO', grade: 1, reports_to_id: null, bucket: 'c_suite' as const }
    const vpCs = {
      id: 'vpCs',
      name: 'VP CS',
      grade: 5,
      reports_to_id: 'ceo',
      department_id: 'cs',
      department_name: 'Customer Success',
      bucket: 'c_suite' as const,
    }
    const supportLead = {
      id: 'supL',
      name: 'Support Lead',
      grade: 15,
      reports_to_id: 'vpCs',
      department_id: 'sup',
      department_name: 'Support',
      bucket: 'none' as const,
    }
    const positions = [ceo, vpCs, supportLead]
    const { departments } = buildDepartmentOrgLayout(positions as never)
    const { primaryOrdered, satellitesByAnchorPrimary } = partitionDepartmentPillars(positions as never, departments)

    expect(primaryOrdered.some((d) => d.key === 'dep:cs')).toBe(true)
    expect(primaryOrdered.some((d) => d.key === 'dep:sup')).toBe(false)

    const underCs = satellitesByAnchorPrimary.get('dep:cs') ?? []
    expect(underCs).toHaveLength(1)
    expect(underCs[0]!.key).toBe('dep:sup')
  })
})
