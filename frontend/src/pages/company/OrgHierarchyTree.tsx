import type { CSSProperties } from 'react'
import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { toPng } from 'html-to-image'
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

function hasValidInCompanyParent(p: PositionNode, byId: Map<string, PositionNode>): boolean {
  return (
    p.reports_to_id != null &&
    p.reports_to_id !== p.id &&
    byId.has(p.reports_to_id)
  )
}

function sortInGrade(a: PositionNode, b: PositionNode): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

function sortSibling(a: PositionNode, b: PositionNode): number {
  if (a.grade !== b.grade) return a.grade - b.grade
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

/** Lanes (0..maxFan-1) under a manager: spread siblings, center a single child in the shared band. */
function computeBranchSlots(
  byId: Map<string, PositionNode>,
  positions: PositionNode[],
): { maxFan: number; bById: Map<string, number> } {
  const direct: Map<string, PositionNode[]> = new Map()
  for (const p of positions) {
    if (p.reports_to_id == null || p.reports_to_id === p.id || !byId.has(p.reports_to_id)) {
      continue
    }
    const m = p.reports_to_id
    if (!direct.has(m)) direct.set(m, [])
    direct.get(m)!.push(p)
  }
  for (const [, list] of direct) {
    list.sort(sortSibling)
  }
  const maxFan = Math.max(1, ...[...direct.values()].map((l) => l.length))
  const bById = new Map<string, number>()

  for (const p of positions) {
    if (p.reports_to_id == null || p.reports_to_id === p.id || !byId.has(p.reports_to_id)) {
      bById.set(p.id, maxFan > 1 ? Math.max(0, Math.floor((maxFan - 1) / 2)) : 0)
      continue
    }
    const sibs = direct.get(p.reports_to_id)
    if (!sibs || sibs.length === 0) {
      bById.set(p.id, 0)
      continue
    }
    const k = sibs.length
    const i = sibs.findIndex((x) => x.id === p.id)
    if (k === 1) {
      bById.set(p.id, Math.max(0, Math.floor((maxFan - 1) / 2)))
    } else {
      bById.set(
        p.id,
        Math.round((i * (maxFan - 1)) / (k - 1)),
      )
    }
  }

  return { maxFan, bById }
}

/** One sub-lane for the “spread” row (C-suite +1) so one card per column; depth uses maxFan lanes. */
function subLaneCountForGrade(g: number, gFan: number | null, maxFan: number): number {
  if (gFan != null && g === gFan) return 1
  return maxFan
}

/**
 * Shared grid width: enough columns to fit the widest grade row, so each band lines up vertically.
 * First “fan-out” from the most senior row uses spread columns; all other levels inherit the manager’s column
 * so people sit in the same vertical slot as their manager.
 */
function computeColumnLayout(
  map: Map<number, PositionNode[]>,
  sortedGrades: number[],
  byId: Map<string, PositionNode>,
  positions: PositionNode[],
): { C: number; colById: Map<string, number>; gFan: number | null } {
  if (positions.length === 0) {
    return { C: 1, colById: new Map(), gFan: null }
  }

  const minG = sortedGrades[0]!
  const C = Math.max(1, ...sortedGrades.map((g) => (map.get(g) ?? []).length))

  let gFan: number | null = null
  for (const p of positions) {
    if (p.reports_to_id == null || p.reports_to_id === p.id || !byId.has(p.reports_to_id)) continue
    const m = byId.get(p.reports_to_id)!
    if (m.grade === minG) {
      gFan = gFan == null ? p.grade : Math.min(gFan, p.grade)
    }
  }

  const colById = new Map<string, number>()

  for (const g of sortedGrades) {
    const list = map.get(g) ?? []
    for (const p of list) {
      const noInCompanyManager =
        p.reports_to_id == null || p.reports_to_id === p.id || !byId.has(p.reports_to_id)

      if (noInCompanyManager) {
        if (g === minG) {
          const roots = (map.get(minG) ?? [])
            .filter(
              (x) => x.reports_to_id == null || x.reports_to_id === x.id || !byId.has(x.reports_to_id),
            )
            .sort(sortInGrade)
          const idx = roots.findIndex((x) => x.id === p.id)
          if (idx < 0) {
            colById.set(p.id, Math.max(0, Math.floor((C - 1) / 2)))
          } else if (roots.length <= 1) {
            colById.set(p.id, Math.max(0, Math.floor((C - 1) / 2)))
          } else {
            const col = Math.round((idx * (C - 1)) / (roots.length - 1))
            colById.set(p.id, col)
          }
        } else {
          colById.set(p.id, Math.max(0, Math.floor((C - 1) / 2)))
        }
        continue
      }

      const m = byId.get(p.reports_to_id)!

      if (gFan != null && m.grade === minG && g === gFan) {
        const sibs = list.filter((x) => x.reports_to_id === p.reports_to_id).sort(sortInGrade)
        const idx = sibs.findIndex((x) => x.id === p.id)
        if (sibs.length <= 1) {
          colById.set(p.id, Math.max(0, Math.floor((C - 1) / 2)))
        } else {
          const col = Math.round((idx * (C - 1)) / (sibs.length - 1))
          colById.set(p.id, col)
        }
        continue
      }

      const mCol = colById.get(m.id)
      colById.set(p.id, mCol != null ? mCol : Math.max(0, Math.floor((C - 1) / 2)))
    }
  }

  return { C, colById, gFan }
}

/**
 * Child top center (cx, childTop) from parent bottom center (px, parentBottom).
 * Smooth cubic; vertical end tangents. Works for large or small vertical gaps.
 */
function strokeReportingLink(
  ctx: CanvasRenderingContext2D,
  childX: number,
  childTopY: number,
  parentX: number,
  parentBottomY: number,
): void {
  const gap = childTopY - parentBottomY
  if (gap < -1) {
    return
  }
  if (gap < 0.5) {
    ctx.beginPath()
    ctx.moveTo(parentX, parentBottomY)
    ctx.lineTo(childX, childTopY)
    ctx.stroke()
    return
  }

  const p = Math.max(4, Math.min(88, gap * 0.4, gap / 2 - 0.5))

  ctx.beginPath()
  ctx.moveTo(parentX, parentBottomY)
  ctx.bezierCurveTo(
    parentX,
    parentBottomY + p,
    childX,
    childTopY - p,
    childX,
    childTopY,
  )
  ctx.stroke()
}

function NodeCard({ p, byId }: { p: PositionNode; byId: Map<string, PositionNode> }) {
  const works = p.works_with_id ? byId.get(p.works_with_id) : undefined
  const reports = p.reports_to_id ? byId.get(p.reports_to_id) : undefined
  const cardStyle = { '--branch-color': branchColorFor(p) } as CSSProperties
  const showReportLink = reports && hasValidInCompanyParent(p, byId)

  return (
    <div className={styles.nodeCard} style={cardStyle}>
      <span className={styles.nodeName}>{p.name}</span>
      <span className={styles.nodeMetaLine}>
        <span className={styles.nodePlacementInline}>{placementText(p)}</span>
        {showReportLink ? (
          <a
            className={styles.reportsToLink}
            href={`#org-node-${reports.id}`}
            onClick={(e) => {
              e.preventDefault()
              document.getElementById(`org-node-${reports.id}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'nearest',
              })
            }}
          >
            → {reports.name}
          </a>
        ) : null}
      </span>
      {works ? (
        <span className={styles.worksWith} title="Works with">
          ↔ {works.name}
        </span>
      ) : null}
    </div>
  )
}

export function OrgHierarchyTree({ companyName, positions }: Props) {
  const byId = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions])

  const orgLayout = useMemo(() => {
    const map = new Map<number, PositionNode[]>()
    for (const p of positions) {
      const g = p.grade
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(p)
    }
    const grades = Array.from(map.keys()).sort((a, b) => a - b)
    for (const g of grades) {
      const list = map.get(g) ?? []
      list.sort(sortInGrade)
    }
    const colResult = computeColumnLayout(map, grades, byId, positions)
    const { maxFan, bById } = computeBranchSlots(byId, positions)
    return { map, grades, ...colResult, maxFan, bById }
  }, [positions, byId])

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodeBoxRefs = useRef(new Map<string, HTMLDivElement>())

  const setNodeBoxRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodeBoxRefs.current.set(id, el)
    else nodeBoxRefs.current.delete(id)
  }, [])

  const drawLinks = useCallback(() => {
    const root = wrapRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return

    const vp = root.getBoundingClientRect()
    if (vp.width < 2 || vp.height < 2) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(vp.width * dpr)
    const h = Math.round(vp.height * dpr)
    canvas.width = w
    canvas.height = h
    canvas.style.width = `${vp.width}px`
    canvas.style.height = `${vp.height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, vp.width, vp.height)
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.9)'
    ctx.lineWidth = 1.75
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    const rel = (el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      return {
        left: r.left - vp.left,
        top: r.top - vp.top,
        right: r.right - vp.left,
        bottom: r.bottom - vp.top,
        width: r.width,
        height: r.height,
      }
    }

    for (const p of positions) {
      if (!p.reports_to_id) continue
      if (p.reports_to_id === p.id) continue
      if (!byId.has(p.reports_to_id)) continue
      const childBox = nodeBoxRefs.current.get(p.id)
      const parentBox = nodeBoxRefs.current.get(p.reports_to_id)
      if (!childBox || !parentBox) continue

      const cr = rel(childBox)
      const pr = rel(parentBox)
      const cx = cr.left + cr.width / 2
      const cy = cr.top
      const px = pr.left + pr.width / 2
      const py = pr.bottom
      strokeReportingLink(ctx, cx, cy, px, py)
    }
  }, [positions, byId])

  useLayoutEffect(() => {
    drawLinks()
  }, [drawLinks, orgLayout])

  useLayoutEffect(() => {
    const root = wrapRef.current
    if (!root) return
    const ro = new ResizeObserver(() => drawLinks())
    ro.observe(root)
    return () => ro.disconnect()
  }, [drawLinks])

  const handleDownloadPng = useCallback(async () => {
    const node = wrapRef.current
    if (!node) return
    drawLinks()
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    try {
      const png = await toPng(node, { pixelRatio: 2, cacheBust: true, filter: () => true })
      const safeName = companyName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'org'
      const a = document.createElement('a')
      a.download = `${safeName}-reporting-by-grade.png`
      a.href = png
      a.click()
    } catch (err) {
      console.error('Failed to export org chart PNG', err)
    }
  }, [companyName, drawLinks])

  return (
    <div className={styles.wrap}>
      <div className={styles.treeHeader}>
        <h3 className={styles.title}>Reporting by grade</h3>
        <button
          type="button"
          className={styles.downloadBtn}
          aria-label="Download as PNG"
          title="Download as PNG"
          onClick={() => void handleDownloadPng()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none">
            <path
              d="M12 3v12m0 0l4-4m-4 4L8 11M5 21h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <p className={styles.hint}>
        Each <strong>horizontal row</strong> is one <strong>grade (G)</strong> — more senior (lower G) is higher. New
        people appear in the row for their grade. <strong>Lines</strong> show <strong>Reports to</strong>. A manager
        can sit on a different row from their team when grades differ.
      </p>
      {positions.length === 0 ? (
        <p className={styles.empty}>No positions yet.</p>
      ) : (
        <div ref={wrapRef} className={styles.gradeTableWrap}>
          <canvas ref={canvasRef} className={styles.linkCanvas} aria-hidden />
          <div className={styles.gradeTable}>
            <div className={styles.rootPillRow}>
              <span className={styles.rootPill}>{companyName}</span>
            </div>
            {orgLayout.grades.map((g) => {
              const row = orgLayout.map.get(g) ?? []
              const { C, colById, gFan, maxFan, bById } = orgLayout
              const mLanes = subLaneCountForGrade(g, gFan, maxFan)
              return (
                <section
                  key={`g-${g}`}
                  className={styles.gradeRow}
                  aria-label={`Grade ${g}`}
                >
                  <div className={styles.gradeRuler}>G{g}</div>
                  <div
                    className={styles.gradeRowGrid}
                    style={{ gridTemplateColumns: `repeat(${C}, minmax(0, 1fr))` } as CSSProperties}
                  >
                    {Array.from({ length: C }, (_, c) => {
                      const inCol = row
                        .filter((p) => (colById.get(p.id) ?? 0) === c)
                        .sort(sortInGrade)
                      return (
                        <div key={`g-${g}-c-${c}`} className={styles.orgCol}>
                          <div
                            className={styles.orgSubGrid}
                            style={
                              { gridTemplateColumns: `repeat(${mLanes}, minmax(0, 1fr))` } as CSSProperties
                            }
                          >
                            {Array.from({ length: mLanes }, (_, b) => {
                              const inSlot =
                                mLanes === 1
                                  ? inCol
                                  : inCol
                                      .filter((p) => (bById.get(p.id) ?? 0) === b)
                                      .sort(sortInGrade)
                              return (
                                <div key={`g-${g}-c-${c}-b-${b}`} className={styles.orgSubCell}>
                                  {inSlot.map((p) => (
                                    <div
                                      key={p.id}
                                      id={`org-node-${p.id}`}
                                      ref={(el) => setNodeBoxRef(p.id, el)}
                                      className={styles.nodeAnchor}
                                    >
                                      <NodeCard p={p} byId={byId} />
                                    </div>
                                  ))}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
