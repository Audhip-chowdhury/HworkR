import type { CSSProperties, PointerEvent as PointerEventHandler } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import {
  buildDepartmentOrgLayout,
  departmentKey,
  hasValidInCompanyParent,
  partitionDepartmentPillars,
  type DepartmentBlock,
} from './orgTreeLayout'
import { downloadOrgChartA4Pdf, rasterSizeFromDataUrl } from './orgChartPdfExport'
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
  positions: PositionNode[] | null | undefined
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

/* ---------- SVG overlay: cross-dept reporting + works-with ---------- */

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number }
type XY = { x: number; y: number }

const SVG_NS = 'http://www.w3.org/2000/svg'
const CROSS_REPORT_STROKE = '#64748b'
const CROSS_REPORT_WIDTH = '1.1'
const WORKS_WITH_LINE_STROKE = '#92400e'
const WORKS_WITH_LINE_WIDTH = '1.1'
const CROSS_FANOUT = 22

/** UI and `zoom` CSS use clean 10% steps (50% … 175%). */
const CHART_ZOOM_MIN_PCT = 50
const CHART_ZOOM_MAX_PCT = 175
const CHART_ZOOM_STEP_PCT = 10

function clampChartZoomPct(raw: number): number {
  const stepped = Math.round(raw / CHART_ZOOM_STEP_PCT) * CHART_ZOOM_STEP_PCT
  return Math.min(CHART_ZOOM_MAX_PCT, Math.max(CHART_ZOOM_MIN_PCT, stepped))
}

function chartFullscreenElement(): Element | null {
  const d = document as Document & { webkitFullscreenElement?: Element | null }
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

async function toggleChartFullscreen(el: HTMLElement): Promise<void> {
  const active = chartFullscreenElement()
  const docAny = document as Document & { webkitExitFullscreen?: () => Promise<void> }
  try {
    if (active === el) {
      if (document.exitFullscreen) await document.exitFullscreen()
      else await docAny.webkitExitFullscreen?.()
    } else {
      const anyEl = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
      if (el.requestFullscreen) await el.requestFullscreen()
      else await Promise.resolve(anyEl.webkitRequestFullscreen?.())
    }
  } catch {
    /* user denied or API unsupported */
  }
}

function isChartPanExcludedTarget(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false
  return Boolean(t.closest('button, a, input, select, textarea, [role="button"]'))
}

function appendOrthoPolyline(
  svg: SVGSVGElement,
  points: XY[],
  stroke: string,
  strokeWidth: string,
  dashArray?: string,
): void {
  if (points.length < 2) return
  const pl = document.createElementNS(SVG_NS, 'polyline')
  pl.setAttribute('points', points.map((pt) => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join(' '))
  pl.setAttribute('fill', 'none')
  pl.setAttribute('stroke', stroke)
  pl.setAttribute('stroke-width', strokeWidth)
  pl.setAttribute('stroke-linejoin', 'miter')
  pl.setAttribute('stroke-linecap', 'butt')
  pl.setAttribute('stroke-miterlimit', '8')
  if (dashArray) pl.setAttribute('stroke-dasharray', dashArray)
  svg.appendChild(pl)
}

const FOOT_ROWS_EPS = 4

/** Bottom-center of the dept block panel — outbound when satellites sit below this pillar row. */
function deptBlockBottomCenter(blockEl: HTMLElement, wrap: HTMLElement, wrapRect: DOMRect): XY {
  const b = elementBoxRelative(blockEl, wrap, wrapRect)
  return { x: b.left + b.width / 2, y: b.bottom }
}

/** Single cross-dept Z-route parent → child; `laneYOffset` tweaks shared bus height when bundled. */
function reportingConnectorPoints(parent: XY, child: XY, opts: { laneYOffset: number }): XY[] {
  const oy = opts.laneYOffset
  if (parent.y < child.y - 4) {
    const lane = parent.y + Math.max(20, (child.y - parent.y) * 0.5) + oy
    return [
      { x: parent.x, y: parent.y },
      { x: parent.x, y: lane },
      { x: child.x, y: lane },
      { x: child.x, y: child.y },
    ]
  }
  if (parent.y > child.y + 4) {
    const lane = child.y + Math.max(20, (parent.y - child.y) * 0.5) + oy
    return [
      { x: parent.x, y: parent.y },
      { x: parent.x, y: lane },
      { x: child.x, y: lane },
      { x: child.x, y: child.y },
    ]
  }
  const dipY = parent.y + 36 + oy
  return [
    { x: parent.x, y: parent.y },
    { x: parent.x, y: dipY },
    { x: child.x, y: dipY },
    { x: child.x, y: child.y },
  ]
}

/**
 * Vertical trunk → horizontal **bus bar** → stubs down each child dept top.
 * Matches inner tree-bus “fan-out” visually when multiple cross-depts share one anchor.
 */
function appendCrossDeptBundle(svg: SVGSVGElement, parentPort: XY, childPorts: XY[]): void {
  if (childPorts.length === 0) return
  if (childPorts.length === 1) {
    appendOrthoPolyline(
      svg,
      reportingConnectorPoints(parentPort, childPorts[0], { laneYOffset: 0 }),
      CROSS_REPORT_STROKE,
      CROSS_REPORT_WIDTH,
    )
    return
  }
  const xs = [parentPort.x, ...childPorts.map((q) => q.x)]
  const minChildY = Math.min(...childPorts.map((q) => q.y))

  let busY: number
  if (parentPort.y < minChildY - FOOT_ROWS_EPS) {
    const span = minChildY - parentPort.y
    busY = parentPort.y + Math.max(24, Math.min(span * 0.44, span - 14))
    busY = Math.min(busY, minChildY - 12)
  } else if (Math.max(...childPorts.map((q) => q.y)) < parentPort.y - FOOT_ROWS_EPS) {
    const maxCy = Math.max(...childPorts.map((q) => q.y))
    const span = parentPort.y - maxCy
    busY = maxCy + Math.max(24, Math.min(span * 0.44, span - 14))
    busY = Math.max(busY, maxCy + 12)
    busY = Math.min(busY, parentPort.y - 12)
  } else {
    const minCy = Math.min(...childPorts.map((q) => q.y))
    busY = Math.max(parentPort.y, minCy) + CROSS_FANOUT * 1.15
  }

  const pad = 10
  const lo = Math.min(...xs) - pad
  const hi = Math.max(...xs) + pad

  appendOrthoPolyline(
    svg,
    [{ x: parentPort.x, y: parentPort.y }, { x: parentPort.x, y: busY }],
    CROSS_REPORT_STROKE,
    CROSS_REPORT_WIDTH,
  )
  appendOrthoPolyline(svg, [{ x: lo, y: busY }, { x: hi, y: busY }], CROSS_REPORT_STROKE, CROSS_REPORT_WIDTH)

  const n = childPorts.length
  for (let i = 0; i < childPorts.length; i++) {
    const c = childPorts[i]
    const fan = n > 1 ? (i - (n - 1) / 2) * 7 : 0
    appendOrthoPolyline(svg, [{ x: c.x + fan, y: busY }, { x: c.x + fan, y: c.y }], CROSS_REPORT_STROKE, CROSS_REPORT_WIDTH)
  }
}

/** Works-with (cross-dept): exit downward from each header, meet on a shared lane. */
function worksWithBetweenHeaders(a: XY, b: XY): XY[] {
  const dipY = Math.max(a.y, b.y) + 18
  return [
    { x: a.x, y: a.y },
    { x: a.x, y: dipY },
    { x: b.x, y: dipY },
    { x: b.x, y: b.y },
  ]
}

function worksWithConnectorPoints(boxA: Box, boxB: Box): XY[] {
  const cxa = boxA.left + boxA.width / 2
  const cxb = boxB.left + boxB.width / 2
  const left = cxa <= cxb ? boxA : boxB
  const right = cxa <= cxb ? boxB : boxA
  const x1 = left.right
  const x2 = right.left
  const y1 = left.top + left.height / 2
  const y2 = right.top + right.height / 2

  if (x2 > x1 + 4) {
    const midX = (x1 + x2) / 2
    return [
      { x: x1, y: y1 },
      { x: midX, y: y1 },
      { x: midX, y: y2 },
      { x: x2, y: y2 },
    ]
  }

  const ax = left.left + left.width / 2
  const bx = right.left + right.width / 2
  const topL = Math.min(left.top, right.top)
  const bridgeY = topL - 24
  return [
    { x: ax, y: left.top },
    { x: ax, y: bridgeY },
    { x: bx, y: bridgeY },
    { x: bx, y: right.top },
  ]
}

function hasValidWorksWithPeer<T extends { id: string; works_with_id: string | null }>(
  p: T,
  byId: Map<string, T>,
): boolean {
  return p.works_with_id != null && p.works_with_id !== p.id && byId.has(p.works_with_id)
}

function deptPortDomId(kind: 'hdr' | 'block', deptKey: string): string {
  return `org-dept-${kind}-${encodeURIComponent(deptKey)}`
}

function elementBoxRelative(el: HTMLElement, wrap: HTMLElement, wrapRect: DOMRect): Box {
  const r = el.getBoundingClientRect()
  const left = r.left - wrapRect.left + wrap.scrollLeft
  const top = r.top - wrapRect.top + wrap.scrollTop
  return {
    left,
    top,
    right: left + r.width,
    bottom: top + r.height,
    width: r.width,
    height: r.height,
  }
}

/** Bottom-center of the dept header bar — the "exit" port for outbound lines. */
function deptHdrBottomCenter(hdrEl: HTMLElement, wrap: HTMLElement, wrapRect: DOMRect): XY {
  const b = elementBoxRelative(hdrEl, wrap, wrapRect)
  return { x: b.left + b.width / 2, y: b.bottom }
}

/** Top-center of the dept block panel — the "entry" port for inbound lines. */
function deptBlockTopCenter(blockEl: HTMLElement, wrap: HTMLElement, wrapRect: DOMRect): XY {
  const b = elementBoxRelative(blockEl, wrap, wrapRect)
  return { x: b.left + b.width / 2, y: b.top }
}

function NodeCard({ p, byId }: { p: PositionNode; byId: Map<string, PositionNode> }) {
  const works = p.works_with_id ? byId.get(p.works_with_id) : undefined
  const reports = p.reports_to_id ? byId.get(p.reports_to_id) : undefined
  const cardStyle = { '--branch-color': branchColorFor(p) } as CSSProperties
  const showReportLink = reports && hasValidInCompanyParent(p, byId)
  const showWorksLink = works && hasValidWorksWithPeer(p, byId)

  return (
    <div className={styles.nodeCard} style={cardStyle}>
      <div className={styles.nodeCardTop}>
        <span className={styles.gradeBadge} aria-label={`Grade ${p.grade}`}>
          G{p.grade}
        </span>
        <span className={styles.nodeName}>{p.name}</span>
      </div>
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
      {showWorksLink ? (
        <a
          className={styles.worksWithLink}
          title="Works with"
          href={`#org-node-${works!.id}`}
          onClick={(e) => {
            e.preventDefault()
            document.getElementById(`org-node-${works!.id}`)?.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
              inline: 'nearest',
            })
          }}
        >
          ↔ {works!.name}
        </a>
      ) : works ? (
        <span className={styles.worksWith} title="Works with (peer not on chart)">
          ↔ {works.name}
        </span>
      ) : null}
    </div>
  )
}

/**
 * One node of the recursive in-department tree. Renders the card, then (if it has
 * same-department direct reports) a vertical stub + a `branchRow` of child trees.
 * The horizontal "bus" is drawn by per-child CSS pseudo elements (see
 * `.childWrap::after` in the stylesheet).
 */
function TreeNode({
  node,
  directReports,
  childrenByParent,
  inDept,
  byId,
}: {
  node: PositionNode
  directReports: PositionNode[]
  childrenByParent: Map<string, PositionNode[]>
  inDept: (id: string) => boolean
  byId: Map<string, PositionNode>
}) {
  return (
    <div className={styles.treeNode}>
      <div id={`org-node-${node.id}`} className={styles.nodeAnchor}>
        <NodeCard p={node} byId={byId} />
      </div>
      {directReports.length > 0 ? (
        <>
          <div className={styles.connectorDown} aria-hidden />
          <div className={styles.branchRow}>
            {directReports.map((c) => {
              const grandChildren = (childrenByParent.get(c.id) ?? []).filter((g) => inDept(g.id))
              return (
                <div key={c.id} className={styles.childWrap}>
                  <TreeNode
                    node={c}
                    directReports={grandChildren}
                    childrenByParent={childrenByParent}
                    inDept={inDept}
                    byId={byId}
                  />
                </div>
              )
            })}
          </div>
        </>
      ) : null}
    </div>
  )
}

/** Cached `parent_id -> children[]` map for the whole company, ordered by name. */
function useChildrenByParentLookup(
  byId: Map<string, PositionNode>,
): Map<string, PositionNode[]> {
  return useMemo(() => {
    const out = new Map<string, PositionNode[]>()
    for (const p of byId.values()) {
      const pid = p.reports_to_id
      if (!pid || pid === p.id || !byId.has(pid)) continue
      const arr = out.get(pid)
      if (arr) arr.push(p)
      else out.set(pid, [p])
    }
    for (const arr of out.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    }
    return out
  }, [byId])
}

function DepartmentBlockView({
  dept,
  byId,
}: {
  dept: DepartmentBlock<PositionNode>
  byId: Map<string, PositionNode>
}) {
  /* Tree roots inside this department = members whose manager is missing or in a
   * different department (e.g. CTO whose manager CEO lives in dep:csuite). */
  const childrenByParent = useChildrenByParentLookup(byId)
  const members = useMemo(() => dept.gradeRows.flatMap((r) => r.nodes), [dept])
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members])

  const roots = useMemo(() => {
    return members
      .filter((m) => {
        const pid = m.reports_to_id
        if (!pid || pid === m.id) return true
        const parent = byId.get(pid)
        if (!parent) return true
        return departmentKey(parent) !== dept.key || !memberIds.has(parent.id)
      })
      .sort((a, b) => {
        if (a.grade !== b.grade) return a.grade - b.grade
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      })
  }, [members, memberIds, byId, dept.key])

  const inDept = useCallback((id: string) => memberIds.has(id), [memberIds])
  const childrenInDept = useCallback(
    (parentId: string): PositionNode[] =>
      (childrenByParent.get(parentId) ?? []).filter((c) => memberIds.has(c.id)),
    [childrenByParent, memberIds],
  )

  return (
    <div id={deptPortDomId('block', dept.key)} className={styles.deptBlock}>
      <div id={deptPortDomId('hdr', dept.key)} className={styles.deptBlockHeader}>
        {dept.label}
      </div>
      <div className={styles.deptTreeStack}>
        {roots.map((root) => (
          <TreeNode
            key={root.id}
            node={root}
            directReports={childrenInDept(root.id)}
            childrenByParent={childrenByParent}
            inDept={inDept}
            byId={byId}
          />
        ))}
      </div>
    </div>
  )
}

function splitSatellitesLeftRight<T>(blocks: DepartmentBlock<T>[]) {
  if (blocks.length <= 1) return { single: blocks[0], left: [] as typeof blocks, right: [] as typeof blocks }
  const left = blocks.filter((_, i) => i % 2 === 0)
  const right = blocks.filter((_, i) => i % 2 === 1)
  return { single: undefined, left, right }
}

export function OrgHierarchyTree({ companyName, positions }: Props) {
  const safePositions = Array.isArray(positions) ? positions : []
  const { departments, byId } = useMemo(
    () => buildDepartmentOrgLayout(safePositions),
    [safePositions],
  )
  /* CEO-only strip (dep:csuite) + primary pillars (someone at min depth reports to CEO).
   * Other departments hang under their CEO-direct leader’s pillar, left/right. */
  const { topDepartments, primaryOrdered, satellitesByAnchorPrimary } = useMemo(() => {
    const csuiteOnly = departments.filter((d) => d.key === 'dep:csuite')
    const { primaryOrdered: primary, satellitesByAnchorPrimary: sats } = partitionDepartmentPillars(
      safePositions,
      departments,
    )
    return { topDepartments: csuiteOnly, primaryOrdered: primary, satellitesByAnchorPrimary: sats }
  }, [departments, safePositions])

  const panelRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const rootPillRef = useRef<HTMLSpanElement>(null)
  const crossLinkSvgRef = useRef<SVGSVGElement>(null)
  const overlayRafRef = useRef(0)
  const panningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, sl: 0, st: 0 })

  const [chartZoomPct, setChartZoomPct] = useState(50)
  const [chartFullscreen, setChartFullscreen] = useState(false)
  const chartZoom = chartZoomPct / 100

  const centerChartOnCompany = useCallback(() => {
    const wrap = wrapRef.current
    const pill = rootPillRef.current
    if (!wrap || !pill || safePositions.length === 0) return
    const wr = wrap.getBoundingClientRect()
    const pr = pill.getBoundingClientRect()
    const pillCenterX = pr.left - wr.left + wrap.scrollLeft + pr.width / 2
    const target = pillCenterX - wrap.clientWidth / 2
    const maxScroll = Math.max(0, wrap.scrollWidth - wrap.clientWidth)
    wrap.scrollLeft = Math.max(0, Math.min(target, maxScroll))
  }, [safePositions.length])

  const drawCrossDeptOverlay = useCallback(() => {
    const wrap = wrapRef.current
    const svg = crossLinkSvgRef.current
    if (!wrap || !svg || safePositions.length === 0) return

    const w = Math.max(1, wrap.scrollWidth)
    svg.setAttribute('width', String(w))
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const wrapRect = wrap.getBoundingClientRect()

    const nodeBoxFor = (id: string): Box | null => {
      const el = document.getElementById(`org-node-${id}`)
      if (!el) return null
      return elementBoxRelative(el, wrap, wrapRect)
    }

    const crossByParent = new Map<string, PositionNode[]>()
    for (const child of safePositions) {
      const pid = child.reports_to_id
      if (!pid || pid === child.id || !byId.has(pid)) continue
      const parent = byId.get(pid)!
      if (departmentKey(parent) === departmentKey(child)) continue
      const arr = crossByParent.get(pid)
      if (arr) arr.push(child)
      else crossByParent.set(pid, [child])
    }
    for (const children of crossByParent.values()) {
      children.sort((a, b) => a.id.localeCompare(b.id))
      const pid = children[0]?.reports_to_id
      if (!pid) continue
      const parentMgr = byId.get(pid)
      if (!parentMgr) continue
      const pHdr = document.getElementById(deptPortDomId('hdr', departmentKey(parentMgr)))
      const pBlock = document.getElementById(deptPortDomId('block', departmentKey(parentMgr)))
      if (!pHdr || !pBlock) continue

      const parentBoxPb = elementBoxRelative(pBlock, wrap, wrapRect)
      const allChildBlocksBelow =
        children.length > 0 &&
        children.every((ch) => {
          const el = document.getElementById(deptPortDomId('block', departmentKey(ch)))
          if (!el) return false
          return elementBoxRelative(el, wrap, wrapRect).top >= parentBoxPb.bottom - FOOT_ROWS_EPS
        })
      const parentPort: XY = allChildBlocksBelow
        ? deptBlockBottomCenter(pBlock, wrap, wrapRect)
        : deptHdrBottomCenter(pHdr, wrap, wrapRect)

      const childPorts: XY[] = []
      for (const child of children) {
        const cBlock = document.getElementById(deptPortDomId('block', departmentKey(child)))
        if (!cBlock) continue
        childPorts.push(deptBlockTopCenter(cBlock, wrap, wrapRect))
      }
      if (childPorts.length === 0) continue
      childPorts.sort((a, b) => a.x - b.x)
      appendCrossDeptBundle(svg, parentPort, childPorts)
    }

    const worksPairKeys = new Set<string>()
    for (const p of safePositions) {
      if (!hasValidWorksWithPeer(p, byId)) continue
      const peerId = p.works_with_id!
      const peer = byId.get(peerId)
      if (!peer) continue
      const key = p.id < peerId ? `${p.id}:${peerId}` : `${peerId}:${p.id}`
      if (worksPairKeys.has(key)) continue
      worksPairKeys.add(key)
      const ka = departmentKey(p)
      const kb = departmentKey(peer)
      let pts: XY[] | null = null
      if (ka !== kb) {
        const ha = document.getElementById(deptPortDomId('hdr', ka))
        const hb = document.getElementById(deptPortDomId('hdr', kb))
        if (!ha || !hb) continue
        const a = deptHdrBottomCenter(ha, wrap, wrapRect)
        const b = deptHdrBottomCenter(hb, wrap, wrapRect)
        pts = worksWithBetweenHeaders(a, b)
      } else {
        const ba = nodeBoxFor(p.id)
        const bb = nodeBoxFor(peerId)
        if (!ba || !bb) continue
        pts = worksWithConnectorPoints(ba, bb)
      }
      if (!pts) continue
      appendOrthoPolyline(svg, pts, WORKS_WITH_LINE_STROKE, WORKS_WITH_LINE_WIDTH, '7 9')
    }
  }, [safePositions, byId])

  const scheduleOverlayDraw = useCallback(() => {
    cancelAnimationFrame(overlayRafRef.current)
    overlayRafRef.current = requestAnimationFrame(() => {
      overlayRafRef.current = 0
      drawCrossDeptOverlay()
    })
  }, [drawCrossDeptOverlay])

  useEffect(() => {
    const panel = panelRef.current
    const syncFs = () => setChartFullscreen(panel != null && chartFullscreenElement() === panel)
    document.addEventListener('fullscreenchange', syncFs)
    document.addEventListener('webkitfullscreenchange', syncFs)
    syncFs()
    return () => {
      document.removeEventListener('fullscreenchange', syncFs)
      document.removeEventListener('webkitfullscreenchange', syncFs)
    }
  }, [])

  const onChartPointerDown = useCallback((e: PointerEventHandler<HTMLDivElement>) => {
    if (e.button !== 0) return
    if (isChartPanExcludedTarget(e.target)) return
    const wrap = wrapRef.current
    if (!wrap) return
    panningRef.current = true
    panStartRef.current = { x: e.clientX, y: e.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop }
    wrap.classList.add(styles.panning)
    wrap.setPointerCapture(e.pointerId)
  }, [])

  const onChartPointerMove = useCallback((e: PointerEventHandler<HTMLDivElement>) => {
    if (!panningRef.current) return
    const wrap = wrapRef.current
    if (!wrap) return
    const st = panStartRef.current
    wrap.scrollLeft = st.sl - (e.clientX - st.x)
    wrap.scrollTop = st.st - (e.clientY - st.y)
  }, [])

  const endChartPan = useCallback((e: PointerEventHandler<HTMLDivElement>) => {
    if (!panningRef.current) return
    panningRef.current = false
    const wrap = wrapRef.current
    wrap?.classList.remove(styles.panning)
    try {
      wrap?.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }, [])

  const onChartLostPointerCapture = useCallback(() => {
    panningRef.current = false
    wrapRef.current?.classList.remove(styles.panning)
  }, [])

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || safePositions.length === 0) return
    drawCrossDeptOverlay()
    const onScroll = () => scheduleOverlayDraw()
    wrap.addEventListener('scroll', onScroll, { passive: true })
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        scheduleOverlayDraw()
        requestAnimationFrame(() => centerChartOnCompany())
      })
      ro.observe(wrap)
    }
    return () => {
      wrap.removeEventListener('scroll', onScroll)
      ro?.disconnect()
      cancelAnimationFrame(overlayRafRef.current)
    }
  }, [drawCrossDeptOverlay, scheduleOverlayDraw, safePositions.length, chartZoomPct, centerChartOnCompany])

  useLayoutEffect(() => {
    if (safePositions.length === 0) return
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => centerChartOnCompany())
    })
    return () => window.cancelAnimationFrame(id)
  }, [safePositions.length, chartZoomPct, centerChartOnCompany])

  const handleExportPrintPdf = useCallback(async () => {
    const node = wrapRef.current
    if (!node) return
    try {
      drawCrossDeptOverlay()
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
      const w = Math.max(1, node.scrollWidth)
      const h = Math.max(1, node.scrollHeight)
      const computedBg =
        typeof window !== 'undefined' ? window.getComputedStyle(node).backgroundColor : ''

      const pngDataUrl = await toPng(node, {
        cacheBust: true,
        filter: () => true,
        width: w,
        height: h,
        pixelRatio: 2,
        backgroundColor:
          computedBg && computedBg !== 'rgba(0, 0, 0, 0)' && computedBg !== 'transparent'
            ? computedBg
            : '#f8f9fa',
      })

      const { w: iw, h: ih } = await rasterSizeFromDataUrl(pngDataUrl)
      const safeName = companyName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'org'
      downloadOrgChartA4Pdf({
        companyName,
        pngDataUrl,
        imagePixelW: iw,
        imagePixelH: ih,
        fileStem: safeName,
      })
    } catch (err) {
      console.error('Failed to export org chart PDF', err)
    }
  }, [companyName, drawCrossDeptOverlay])

  return (
    <div ref={panelRef} className={styles.chartShell}>
      <div className={styles.treeHeader}>
        <h3 className={styles.title}>Organizational chart</h3>
        <div className={styles.chartHeaderActions}>
          <div className={styles.zoomCluster} role="group" aria-label="Chart zoom">
            <button
              type="button"
              className={styles.zoomBtn}
              aria-label="Zoom out"
              title="Zoom out"
              disabled={chartZoomPct <= CHART_ZOOM_MIN_PCT}
              onClick={() =>
                setChartZoomPct((p) => clampChartZoomPct(p - CHART_ZOOM_STEP_PCT))
              }
            >
              −
            </button>
            <span className={styles.zoomLabel}>{chartZoomPct}%</span>
            <button
              type="button"
              className={styles.zoomBtn}
              aria-label="Zoom in"
              title="Zoom in"
              disabled={chartZoomPct >= CHART_ZOOM_MAX_PCT}
              onClick={() =>
                setChartZoomPct((p) => clampChartZoomPct(p + CHART_ZOOM_STEP_PCT))
              }
            >
              +
            </button>
          </div>
          <button
            type="button"
            className={styles.fullscreenBtn}
            aria-label={chartFullscreen ? 'Exit full screen' : 'Enter full screen'}
            title={chartFullscreen ? 'Exit full screen' : 'Full screen'}
            aria-pressed={chartFullscreen}
            onClick={() => {
              const el = panelRef.current
              if (el) void toggleChartFullscreen(el)
            }}
          >
            {chartFullscreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none">
                <path
                  d="M9 14H5v4M15 14h4v4M9 10H5V6M15 10h4V6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none">
                <path
                  d="M9 21H5v-4M9 3H5v4M21 14v4h-4M21 10V6h-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
          <button
            type="button"
            className={styles.downloadBtn}
            aria-label="Download printable PDF (A4 portrait)"
            title="Download A4 portrait PDF for printing"
            onClick={() => void handleExportPrintPdf()}
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
      </div>
      {safePositions.length === 0 ? (
        <p className={styles.empty}>No positions yet.</p>
      ) : (
        <div
          ref={wrapRef}
          className={styles.treeChartWrap}
          title="Drag to pan the chart"
          onPointerDown={onChartPointerDown}
          onPointerMove={onChartPointerMove}
          onPointerUp={endChartPan}
          onPointerCancel={endChartPan}
          onLostPointerCapture={onChartLostPointerCapture}
        >
          <div className={styles.zoomCanvas} style={{ zoom: chartZoom } as CSSProperties}>
            <div className={styles.treeBody}>
            <div className={styles.rootPillRow}>
              <span
                ref={rootPillRef}
                id="org-chart-company-root"
                className={styles.rootPill}
              >
                {companyName}
              </span>
            </div>
            <div className={styles.treeChartColumn}>
              <div className={styles.topBandRow}>
                {topDepartments.map((dept) => (
                  <DepartmentBlockView key={dept.key} dept={dept} byId={byId} />
                ))}
              </div>
              <div className={styles.departmentMainRow}>
                {primaryOrdered.map((dept) => {
                  const satellites = satellitesByAnchorPrimary.get(dept.key) ?? []
                  const { single, left, right } = splitSatellitesLeftRight(satellites)
                  return (
                    <div key={dept.key} className={styles.pillarCluster}>
                      <div className={styles.pillarPrimary}>
                        <DepartmentBlockView dept={dept} byId={byId} />
                      </div>
                      {single ? (
                        <div className={styles.pillarSatelliteSingle}>
                          <DepartmentBlockView dept={single} byId={byId} />
                        </div>
                      ) : left.length + right.length > 0 ? (
                        <div className={styles.pillarSatelliteBand}>
                          <div className={styles.pillarSatelliteSide}>
                            {left.map((sat) => (
                              <DepartmentBlockView key={sat.key} dept={sat} byId={byId} />
                            ))}
                          </div>
                          <div className={`${styles.pillarSatelliteSide} ${styles.pillarSatelliteSideRight}`}>
                            {right.map((sat) => (
                              <DepartmentBlockView key={sat.key} dept={sat} byId={byId} />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
            </div>
          </div>
          <svg ref={crossLinkSvgRef} className={styles.linkSvgLayer} aria-hidden />
        </div>
      )}
    </div>
  )
}
