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
  const placement =
    p.bucket === 'c_suite'
      ? 'C-suite'
      : p.bucket === 'temporary'
        ? 'Temporary'
        : p.department_name ?? 'Dept'

  return (
    <li className={styles.treeLi}>
      <div className={styles.nodeRow}>
        <span className={styles.nodeName}>{p.name}</span>
        <span className={styles.nodeMeta}>grade {p.grade}</span>
        <span className={styles.nodePlacement}>{placement}</span>
        {works ? (
          <span className={styles.worksWith} title="Works with">
            ↔ {works.name}
          </span>
        ) : null}
      </div>
      {kids.length > 0 ? (
        <ul className={styles.treeNested}>
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
        Built from <strong>Reports to</strong>. Lower grade sorts above among siblings. C-suite
        bucket roots list before department roles, then temporary. Dotted: works with.
      </p>
      {positions.length === 0 ? (
        <p className={styles.empty}>No positions yet.</p>
      ) : (
        <ul className={styles.tree}>
          <li className={styles.root}>
            <span className={styles.rootLabel}>{companyName}</span>
            <ul className={styles.treeNested}>
              {roots.map((p) => (
                <Node key={p.id} p={p} byId={byId} all={positions} />
              ))}
            </ul>
          </li>
        </ul>
      )}
    </div>
  )
}
