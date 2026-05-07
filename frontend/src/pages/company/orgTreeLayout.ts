/** Pure helpers for grade-banded org chart layout. */

export type OrgChartPosition = {
  id: string
  name: string
  grade: number
  reports_to_id: string | null
}

/** Optional fields used to group cards into department containers in the UI. */
export type OrgGroupingFields = {
  department_id?: string | null
  department_name?: string | null
  bucket?: string
}

/** One grade band inside a single department container. */
export type DeptGradeRow<T> = {
  layer: number
  nodes: T[]
}

/** One department: all grades for that org unit in one visual box, senior grades first. */
export type DepartmentBlock<T> = {
  key: string
  label: string
  gradeRows: DeptGradeRow<T>[]
}

export type GradeDepartmentSlice<T> = {
  key: string
  label: string
  nodes: T[]
}

/**
 * One cell in a grade row.
 *
 * `card`        — department has roles at this exact grade.
 * `placeholder` — department is active at this grade (within its contiguous
 *                 min..max grade range) but has no role at this exact grade;
 *                 the renderer keeps an empty slot so the column stays
 *                 vertically aligned with the cards above and below.
 * `absent`      — outside the department's active range; not emitted at all.
 */
export type GradeRowCell<T> =
  | { kind: 'card'; columnIndex: number; key: string; label: string; nodes: T[] }
  | { kind: 'placeholder'; columnIndex: number; key: string; label: string }

export type GradeDepartmentRow<T> = {
  grade: number
  cells: GradeRowCell<T>[]
}

export function hasValidInCompanyParent<T extends { id: string; reports_to_id: string | null }>(
  p: T,
  byId: Map<string, T>,
): boolean {
  return p.reports_to_id != null && p.reports_to_id !== p.id && byId.has(p.reports_to_id)
}

function compareByName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

export function departmentKey(p: OrgChartPosition & OrgGroupingFields): string {
  if (p.department_id) return `dep:${p.department_id}`
  if (p.bucket === 'c_suite') return 'dep:csuite'
  if (p.bucket === 'temporary') return 'dep:temporary'
  return 'dep:none'
}

function departmentLabel(p: OrgChartPosition & OrgGroupingFields): string {
  const n = p.department_name?.trim()
  if (n) return n
  if (p.bucket === 'c_suite') return 'C-suite'
  if (p.bucket === 'temporary') return 'Temporary'
  return 'Unassigned'
}

/** Panels that anchor the hierarchy: dedicated C-suite group, then departmental roles still marked C-suite placement. */
function csuiteDeptSortTier<T extends OrgChartPosition & OrgGroupingFields>(block: DepartmentBlock<T>): number {
  if (block.key === 'dep:csuite') return 0
  if (block.gradeRows.some((r) => r.nodes.some((n) => (n.bucket ?? '') === 'c_suite'))) return 1
  return 2
}

/**
 * Build a DFS visitation order from the reports_to forest.
 *
 * Roots (no valid in-company parent) are visited alphabetically; children of
 * each manager are visited alphabetically. Cycles and self-reports are treated
 * as additional roots so the walk always terminates and every node is indexed.
 *
 * The returned map gives each id a monotonically increasing slot, so sorting a
 * grade row by these slots places every direct report immediately to the right
 * of (and clustered with) their manager's column.
 */
export function computeManagerColumnOrder<T extends OrgChartPosition>(
  positions: T[],
  byId: Map<string, T>,
): Map<string, number> {
  const childrenByParent = new Map<string | null, T[]>()
  const validParentId = (p: T): string | null => {
    if (!p.reports_to_id) return null
    if (p.reports_to_id === p.id) return null
    if (!byId.has(p.reports_to_id)) return null
    return p.reports_to_id
  }
  for (const p of positions) {
    const pid = validParentId(p)
    const list = childrenByParent.get(pid)
    if (list) list.push(p)
    else childrenByParent.set(pid, [p])
  }
  for (const list of childrenByParent.values()) list.sort(compareByName)

  const order = new Map<string, number>()
  let cursor = 0
  const visited = new Set<string>()
  const dfs = (node: T): void => {
    if (visited.has(node.id)) return
    visited.add(node.id)
    order.set(node.id, cursor++)
    const kids = childrenByParent.get(node.id)
    if (!kids) return
    for (const child of kids) dfs(child)
  }

  for (const root of childrenByParent.get(null) ?? []) dfs(root)
  // Any leftover (cycle members, self-references) become extra roots so they
  // still get an order and never crash the renderer.
  for (const p of [...positions].sort(compareByName)) {
    if (!visited.has(p.id)) dfs(p)
  }
  return order
}

/**
 * Hierarchy depth in the reports_to forest.
 *
 * Root (no valid in-company parent) => depth 0.
 * Child => parent depth + 1.
 * Cycles/self references are tolerated and treated as roots (depth 0).
 */
export function computeReportingDepth<T extends OrgChartPosition>(
  positions: T[],
  byId: Map<string, T>,
): Map<string, number> {
  const memo = new Map<string, number>()
  const visiting = new Set<string>()

  const depthOf = (id: string): number => {
    const cached = memo.get(id)
    if (cached != null) return cached
    const p = byId.get(id)
    if (!p) return 0
    const pid = p.reports_to_id
    if (!pid || pid === id || !byId.has(pid)) {
      memo.set(id, 0)
      return 0
    }
    if (visiting.has(id)) {
      memo.set(id, 0)
      return 0
    }
    visiting.add(id)
    const d = depthOf(pid) + 1
    visiting.delete(id)
    memo.set(id, d)
    return d
  }

  for (const p of positions) depthOf(p.id)
  return memo
}

/** First manager in chain (starting from `lead`) who reports directly to the CEO — their dept key anchors satellites. */
function anchorPrimaryDeptKeyForSatellite<T extends OrgChartPosition & OrgGroupingFields>(
  lead: T,
  byId: Map<string, T>,
  ceoId: string,
): string | null {
  let curr: T | undefined = lead
  for (let i = 0; i < 512; i += 1) {
    const pid = curr.reports_to_id
    if (!pid || !byId.has(pid)) return null
    if (pid === ceoId) return departmentKey(curr)
    curr = byId.get(pid)
    if (!curr) return null
  }
  return null
}

/**
 * Split departmental pillars after `buildDepartmentOrgLayout`:
 *
 * - **Primary** pillars: shallowest roles in that department include someone who reports *directly* to the CEO.
 * - **Satellites**: every other dept is placed **under** the primary pillar belonging to their CEO‑direct ancestor
 *   (e.g. Support under Customer Success because Support Lead rolls up through the VP Customer Success role).
 *
 * `departments` order is preserved inside `primaryOrdered`.
 */
export function partitionDepartmentPillars<T extends OrgChartPosition & OrgGroupingFields>(
  positions: T[],
  departments: DepartmentBlock<T>[],
): {
  primaryOrdered: DepartmentBlock<T>[]
  satellitesByAnchorPrimary: Map<string, DepartmentBlock<T>[]>
  ceoId: string | null
} {
  const list = Array.isArray(positions) ? positions : []
  const byId = new Map(list.map((p) => [p.id, p]))
  const depth = computeReportingDepth(list, byId)

  const depth0 = list.filter((p) => (depth.get(p.id) ?? 0) === 0)
  const ceoCandidates = depth0.filter((p) => (p.bucket ?? '') === 'c_suite').sort((a, b) => {
    if (a.grade !== b.grade) return a.grade - b.grade
    return compareByName(a, b)
  })
  const ceoId =
    ceoCandidates[0]?.id ??
    [...depth0].sort((a, b) => compareByName(a, b))[0]?.id ??
    null

  const primaryKeys = new Set<string>()
  const satelliteOf = new Map<string, string>()
  const blockByKey = new Map(departments.map((d) => [d.key, d]))

  if (!ceoId) {
    return {
      primaryOrdered: departments.filter((d) => d.key !== 'dep:csuite'),
      satellitesByAnchorPrimary: new Map(),
      ceoId: null,
    }
  }

  for (const block of departments) {
    if (block.key === 'dep:csuite') continue
    const members = block.gradeRows.flatMap((r) => r.nodes)
    if (members.length === 0) continue
    const minD = Math.min(...members.map((m) => depth.get(m.id) ?? 9_999))
    const tops = members
      .filter((m) => (depth.get(m.id) ?? 9_999) === minD)
      .sort((a, b) => compareByName(a, b))

    const isPrimary = tops.some((t) => t.reports_to_id === ceoId)
    if (isPrimary || tops.length === 0) {
      primaryKeys.add(block.key)
      continue
    }

    const lead = tops[0]!
    const anchor = anchorPrimaryDeptKeyForSatellite(lead, byId, ceoId)
    const safeAnchor =
      anchor && anchor !== block.key && anchor !== 'dep:csuite' ? anchor : null
    if (safeAnchor != null && blockByKey.has(safeAnchor)) {
      satelliteOf.set(block.key, safeAnchor)
    } else {
      primaryKeys.add(block.key)
    }
  }

  for (const [satKey, ancKey] of satelliteOf) {
    if (!primaryKeys.has(ancKey)) {
      satelliteOf.delete(satKey)
      primaryKeys.add(satKey)
    }
  }

  const satellitesByAnchorPrimary = new Map<string, DepartmentBlock<T>[]>()

  const primaryOrdered = departments.filter((d) => primaryKeys.has(d.key) && d.key !== 'dep:csuite')

  for (const pk of primaryKeys) {
    if (pk === 'dep:csuite') continue
    satellitesByAnchorPrimary.set(pk, [])
  }
  for (const [satKey, ancKey] of satelliteOf) {
    const blk = blockByKey.get(satKey)
    if (!blk) continue
    satellitesByAnchorPrimary.get(ancKey)?.push(blk)
  }
  for (const arr of satellitesByAnchorPrimary.values()) {
    arr.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  }

  return { primaryOrdered, satellitesByAnchorPrimary, ceoId }
}

/**
 * One container per department, with every grade band for that department stacked
 * inside it (senior grades at the top). Within each grade row, cards follow the
 * global manager-column order.
 *
 * Visual row index (for connectors) increases top-to-bottom through every grade
 * sub-row, in department order.
 */
export function buildDepartmentOrgLayout<T extends OrgChartPosition & OrgGroupingFields>(positions: T[]): {
  departments: DepartmentBlock<T>[]
  rowIndexById: Map<string, number>
  byId: Map<string, T>
} {
  const list = Array.isArray(positions) ? positions : []
  const byId = new Map(list.map((p) => [p.id, p]))
  const order = computeManagerColumnOrder(list, byId)
  const depth = computeReportingDepth(list, byId)
  const orderOf = (n: T): number => order.get(n.id) ?? Number.MAX_SAFE_INTEGER

  const byDeptKey = new Map<string, T[]>()
  for (const p of list) {
    const k = departmentKey(p)
    const arr = byDeptKey.get(k)
    if (arr) arr.push(p)
    else byDeptKey.set(k, [p])
  }

  const blocks: DepartmentBlock<T>[] = []
  for (const [key, members] of byDeptKey) {
    const groupedByLayer = new Map<number, T[]>()
    for (const p of members) {
      // C-suite always occupies the top-most rows in each department box.
      const hierarchyLayer = p.bucket === 'c_suite' ? -1 : depth.get(p.id) ?? 0
      const r = groupedByLayer.get(hierarchyLayer)
      if (r) r.push(p)
      else groupedByLayer.set(hierarchyLayer, [p])
    }

    const gradeRows: DeptGradeRow<T>[] = [...groupedByLayer.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([layer, nodes]) => ({
        layer,
        nodes: [...nodes].sort((a, b) => {
          const oa = orderOf(a)
          const ob = orderOf(b)
          if (oa !== ob) return oa - ob
          if (a.grade !== b.grade) return a.grade - b.grade
          return compareByName(a, b)
        }),
      }))

    const sortedMembers = [...members].sort(compareByName)
    const label = departmentLabel(sortedMembers[0]!)
    blocks.push({ key, label, gradeRows })
  }

  blocks.sort((a, b) => {
    const tierA = csuiteDeptSortTier(a)
    const tierB = csuiteDeptSortTier(b)
    if (tierA !== tierB) return tierA - tierB

    const minA = Math.min(...a.gradeRows.flatMap((r) => r.nodes).map((n) => orderOf(n)))
    const minB = Math.min(...b.gradeRows.flatMap((r) => r.nodes).map((n) => orderOf(n)))
    if (minA !== minB) return minA - minB

    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  })

  const rowIndexById = new Map<string, number>()
  let rowIdx = 0
  for (const block of blocks) {
    for (const gr of block.gradeRows) {
      for (const n of gr.nodes) rowIndexById.set(n.id, rowIdx)
      rowIdx += 1
    }
  }

  return { departments: blocks, rowIndexById, byId }
}

/**
 * Grade-first tree flow (G1 at top), with department grouping inside each
 * grade row.
 *
 * Each department has a global `columnIndex` that is shared across every grade
 * row, and an active grade range `[minGrade, maxGrade]` derived from its
 * members. A cell is emitted only when the row's grade falls inside that
 * department's active range:
 *   - in-range with members at this grade        -> `card`
 *   - in-range with no members at this exact grade -> `placeholder` (so the
 *     column stays vertically aligned with the cards above and below)
 *   - outside the active range                   -> not emitted (`absent`)
 */
export function buildGradeDepartmentLayout<T extends OrgChartPosition & OrgGroupingFields>(positions: T[]): {
  rows: GradeDepartmentRow<T>[]
  departmentColumns: Array<{ key: string; label: string; minGrade: number; maxGrade: number }>
  byId: Map<string, T>
} {
  const list = Array.isArray(positions) ? positions : []
  const byId = new Map(list.map((p) => [p.id, p]))
  const order = computeManagerColumnOrder(list, byId)
  const orderOf = (n: T): number => order.get(n.id) ?? Number.MAX_SAFE_INTEGER

  const byDeptAll = new Map<string, T[]>()
  const byGrade = new Map<number, T[]>()
  for (const p of list) {
    const dk = departmentKey(p)
    const all = byDeptAll.get(dk)
    if (all) all.push(p)
    else byDeptAll.set(dk, [p])

    const arr = byGrade.get(p.grade)
    if (arr) arr.push(p)
    else byGrade.set(p.grade, [p])
  }

  const departmentColumns = [...byDeptAll.entries()]
    .map(([key, nodes]) => {
      const sorted = [...nodes].sort((a, b) => {
        const oa = orderOf(a)
        const ob = orderOf(b)
        if (oa !== ob) return oa - ob
        return compareByName(a, b)
      })
      const label = departmentLabel(sorted[0]!)
      const tier = key === 'dep:csuite' ? 0 : nodes.some((n) => n.bucket === 'c_suite') ? 1 : 2
      const minOrder = Math.min(...nodes.map((n) => orderOf(n)))
      const grades = nodes.map((n) => n.grade)
      const minGrade = Math.min(...grades)
      const maxGrade = Math.max(...grades)
      return { key, label, tier, minOrder, minGrade, maxGrade }
    })
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier
      if (a.minOrder !== b.minOrder) return a.minOrder - b.minOrder
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    })
    .map(({ key, label, minGrade, maxGrade }) => ({ key, label, minGrade, maxGrade }))

  const deptIndexByKey = new Map(departmentColumns.map((d, i) => [d.key, i]))

  const rows: GradeDepartmentRow<T>[] = [...byGrade.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([grade, members]) => {
      const byDept = new Map<string, T[]>()
      for (const p of members) {
        const key = departmentKey(p)
        const arr = byDept.get(key)
        if (arr) arr.push(p)
        else byDept.set(key, [p])
      }

      const cards = new Map<string, GradeDepartmentSlice<T>>()
      for (const [key, nodes] of byDept) {
        const sorted = [...nodes].sort((a, b) => {
          const oa = orderOf(a)
          const ob = orderOf(b)
          if (oa !== ob) return oa - ob
          return compareByName(a, b)
        })
        cards.set(key, { key, label: departmentLabel(sorted[0]!), nodes: sorted })
      }

      const cells: GradeRowCell<T>[] = []
      for (const dept of departmentColumns) {
        if (grade < dept.minGrade || grade > dept.maxGrade) continue
        const columnIndex = deptIndexByKey.get(dept.key)!
        const card = cards.get(dept.key)
        if (card) {
          cells.push({
            kind: 'card',
            columnIndex,
            key: card.key,
            label: card.label,
            nodes: card.nodes,
          })
        } else {
          cells.push({
            kind: 'placeholder',
            columnIndex,
            key: dept.key,
            label: dept.label,
          })
        }
      }

      cells.sort((a, b) => a.columnIndex - b.columnIndex)
      return { grade, cells }
    })

  return { rows, departmentColumns, byId }
}
