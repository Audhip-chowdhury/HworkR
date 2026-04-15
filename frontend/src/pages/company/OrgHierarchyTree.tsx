import type { CSSProperties } from 'react'
import styles from './OrgHierarchyTree.module.css'

export type PositionNode = {
  id: string
  name: string
  department_id: string | null
  department_name: string | null
  bucket: string
  grade: number
  reports_to_id: string | null
  works_with_id: string | null
}

type Props = {
  companyName: string
  positions: PositionNode[]
}

function bucketOrder(b: string): number {
  if (b === 'c_suite') return 0
  if (b === 'none') return 1
  return 2
}

function sortRoots(a: PositionNode, b: PositionNode): number {
  const bo = bucketOrder(a.bucket) - bucketOrder(b.bucket)
  if (bo !== 0) return bo
  if (a.grade !== b.grade) return a.grade - b.grade
  return a.name.localeCompare(b.name)
}

function childrenOf(parentId: string | null, all: PositionNode[]): PositionNode[] {
  return all
    .filter((p) => p.reports_to_id === parentId)
    .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name))
}

function placementText(p: PositionNode): string {
  if (p.bucket === 'c_suite') return 'C-suite'
  if (p.bucket === 'temporary') return 'Temporary'
  return p.department_name ?? 'Department'
}

function branchColorFor(p: PositionNode): string {
  if (p.bucket === 'c_suite') return '#6d28d9'
  if (p.bucket === 'temporary') return '#b45309'
  return '#0f766e'
}

function Node({
  p,
  byId,
  all,
}: {
  p: PositionNode
  byId: Map<string, PositionNode>
  all: PositionNode[]
}) {
  const kids = childrenOf(p.id, all)
  const works = p.works_with_id ? byId.get(p.works_with_id) : undefined
  const nodeStyle = {
    '--branch-color': branchColorFor(p),
  } as CSSProperties

  return (
    <li className={styles.treeNode} style={nodeStyle}>
      <div className={styles.nodeCard}>
        <span className={styles.nodeName}>{p.name}</span>
        <span className={styles.nodeMeta}>Grade {p.grade}</span>
        <span className={styles.nodePlacement}>{placementText(p)}</span>
        {works ? (
          <span className={styles.worksWith} title="Works with">
            ↔ {works.name}
          </span>
        ) : null}
      </div>
      {kids.length > 0 ? (
        <ul className={styles.childrenRow}>
          {kids.map((c) => (
            <Node key={c.id} p={c} byId={byId} all={all} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function OrgHierarchyTree({ companyName, positions }: Props) {
  const byId = new Map(positions.map((p) => [p.id, p]))
  const roots = positions.filter((p) => !p.reports_to_id).sort(sortRoots)

  return (
    <div className={styles.wrap}>
      <h3 className={styles.title}>Reporting hierarchy</h3>
      <p className={styles.hint}>
        Top-down tree built from <strong>Reports to</strong>. Branch colors: green (department),
        purple (C-suite), amber (temporary).
      </p>
      {positions.length === 0 ? (
        <p className={styles.empty}>No positions yet.</p>
      ) : (
        <div className={styles.tree}>
          <div className={styles.rootPill}>{companyName}</div>
          <ul className={styles.childrenRow}>
            {roots.map((p) => (
              <Node key={p.id} p={p} byId={byId} all={positions} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
