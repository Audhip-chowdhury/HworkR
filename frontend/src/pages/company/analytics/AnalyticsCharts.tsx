/**
 * AnalyticsCharts — all dashboard chart components, powered by Recharts.
 * ResponsiveContainer keeps every chart flush to its tile with no letterboxing.
 */
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
} from 'recharts'
import c from './AnalyticsCharts.module.css'

// ── Design tokens ──────────────────────────────────────────────────────────

const PRIMARY = 'var(--color-primary)'
const SECONDARY = 'var(--color-secondary)'
const ACCENT = 'var(--color-accent)'
const MUTED = 'var(--text-muted)'
const BORDER = 'var(--border)'

const PALETTE = [PRIMARY, SECONDARY, ACCENT, '#5dade2', '#48c9b0', '#f0b27a'] as const

// ── Axis defaults ──────────────────────────────────────────────────────────

const AXIS_STYLE = { fontSize: 12, fill: MUTED, fontFamily: 'system-ui, sans-serif' }
const TICK_LINE = false
const AXIS_LINE: React.SVGProps<SVGLineElement> = { stroke: BORDER }

// ── Formatters ─────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-01" → "Jan 2026", "2026-1" → "Jan 2026", already "Jan 2026" → unchanged */
function fmtMonth(raw: string): string {
  const s = String(raw).trim()
  if (s.length >= 6 && s[4] === '-') {
    const m = parseInt(s.slice(5, 7), 10)
    return `${MONTH_NAMES[m - 1] ?? s.slice(5)} ${s.slice(0, 4)}`
  }
  return s
}

function shortNum(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 10_000) return `${(v / 1_000).toFixed(0)}k`
  return String(v)
}

// ── Types ──────────────────────────────────────────────────────────────────

type Point = { month: string; count: number }
type LabeledVal = { label: string; value: number }

// ── Monthly Trend — AREA chart (new hire trend) ────────────────────────────

export function MonthlyTrendBarChart({ points, yLabel }: { points: Point[]; yLabel: string }) {
  if (!points.length) return <p className={c.mutedEmpty}>No trend data yet.</p>

  const data = points.map((p) => ({ month: fmtMonth(p.month), count: p.count }))

  return (
    <div className={c.chartFrame}>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 18, right: 16, left: 0, bottom: 60 }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.22} />
              <stop offset="95%" stopColor={PRIMARY} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ ...AXIS_STYLE, fontSize: 11 }}
            tickLine={TICK_LINE}
            axisLine={AXIS_LINE}
            angle={-40}
            textAnchor="end"
            interval={0}
            height={64}
            padding={{ left: 24, right: 24 }}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={TICK_LINE}
            axisLine={false}
            tickFormatter={shortNum}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 10, style: { ...AXIS_STYLE, fontSize: 11 } }}
            width={44}
          />
          <Tooltip labelFormatter={(l) => String(l)} />
          <Area
            type="monotone"
            dataKey="count"
            name={yLabel}
            stroke={PRIMARY}
            strokeWidth={2.5}
            fill="url(#areaGrad)"
            dot={{ r: 4, fill: PRIMARY, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
            label={{ position: 'top', style: { fontSize: 11, fill: 'var(--text-primary)', fontWeight: 600 } }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Monthly Trend — LINE chart (applications trend) ────────────────────────

export function MonthlyTrendLineChart({ points, yLabel }: { points: Point[]; yLabel: string }) {
  if (!points.length) return <p className={c.mutedEmpty}>No trend data yet.</p>

  const data = points.map((p) => ({ month: fmtMonth(p.month), count: p.count }))

  return (
    <div className={c.chartFrame}>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 18, right: 16, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ ...AXIS_STYLE, fontSize: 11 }}
            tickLine={TICK_LINE}
            axisLine={AXIS_LINE}
            angle={-40}
            textAnchor="end"
            interval={0}
            height={64}
            padding={{ left: 24, right: 24 }}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={TICK_LINE}
            axisLine={false}
            tickFormatter={shortNum}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 10, style: { ...AXIS_STYLE, fontSize: 11 } }}
            width={44}
          />
          <Tooltip labelFormatter={(l) => String(l)} />
          <Line
            type="monotone"
            dataKey="count"
            name={yLabel}
            stroke={SECONDARY}
            strokeWidth={2.5}
            dot={{ r: 4, fill: SECONDARY, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
            label={{ position: 'top', style: { fontSize: 11, fill: 'var(--text-primary)', fontWeight: 600 } }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Vertical Bar Chart (leave types) ──────────────────────────────────────

export function LabeledBarChart({
  items,
  yLabel,
  emptyLabel = 'No data yet.',
}: {
  items: LabeledVal[]
  yLabel: string
  emptyLabel?: string
}) {
  if (!items.length) return <p className={c.mutedEmpty}>{emptyLabel}</p>

  return (
    <div className={c.chartFrame}>
      <ResponsiveContainer width="100%" height={Math.max(220, 80 + items.length * 36)}>
        <BarChart data={items} margin={{ top: 18, right: 16, left: 0, bottom: 52 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ ...AXIS_STYLE, fontSize: 11 }}
            tickLine={TICK_LINE}
            axisLine={AXIS_LINE}
            angle={-30}
            textAnchor="end"
            interval={0}
            height={58}
            padding={{ left: 20, right: 20 }}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={TICK_LINE}
            axisLine={false}
            tickFormatter={shortNum}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 10, style: { ...AXIS_STYLE, fontSize: 11 } }}
            width={44}
          />
          <Tooltip />
          <Bar dataKey="value" name={yLabel} radius={[4, 4, 0, 0]} maxBarSize={56}>
            {items.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
            <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: 'var(--text-primary)', fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Horizontal Bar Chart (dept, course) ───────────────────────────────────

export function HorizontalBarChart({
  items,
  xLabel,
  emptyLabel = 'No data yet.',
}: {
  items: LabeledVal[]
  xLabel: string
  emptyLabel?: string
  formatValue?: (v: number) => string
  maxHeightPx?: number
}) {
  if (!items.length) return <p className={c.mutedEmpty}>{emptyLabel}</p>

  const rowH = 32
  const height = Math.max(200, items.length * rowH + 80)

  return (
    <div className={c.chartFrame}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={items} layout="vertical" margin={{ top: 8, right: 52, left: 4, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} horizontal={false} />
          <XAxis
            type="number"
            tick={{ ...AXIS_STYLE, fontSize: 11 }}
            tickLine={TICK_LINE}
            axisLine={AXIS_LINE}
            tickFormatter={shortNum}
            label={{ value: xLabel, position: 'insideBottom', offset: -6, style: { ...AXIS_STYLE, fontSize: 11 } }}
            height={34}
            padding={{ left: 0, right: 20 }}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ ...AXIS_STYLE, fontSize: 11 }}
            tickLine={TICK_LINE}
            axisLine={false}
            width={110}
          />
          <Tooltip />
          <Bar dataKey="value" name={xLabel} radius={[0, 4, 4, 0]} maxBarSize={22}>
            {items.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
            <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: 'var(--text-primary)', fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Pie Chart (location, diversity — small number of categories) ───────────

export function PieDonutChart({
  items,
  emptyLabel = 'No data yet.',
}: {
  items: LabeledVal[]
  emptyLabel?: string
}) {
  if (!items.length) return <p className={c.mutedEmpty}>{emptyLabel}</p>

  const RADIAN = Math.PI / 180
  const renderLabel = (props: PieLabelRenderProps) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, name, value } = props
    if (cx == null || cy == null || midAngle == null || innerRadius == null || outerRadius == null) return null
    const cxN = Number(cx), cyN = Number(cy), midN = Number(midAngle)
    const inR = Number(innerRadius), outR = Number(outerRadius)
    const radius = inR + (outR - inR) * 1.42
    const x = cxN + radius * Math.cos(-midN * RADIAN)
    const y = cyN + radius * Math.sin(-midN * RADIAN)
    return (
      <text
        x={x}
        y={y}
        textAnchor={x > cxN ? 'start' : 'end'}
        dominantBaseline="central"
        style={{ fontSize: 11, fill: 'var(--text-primary)', fontWeight: 500, fontFamily: 'system-ui, sans-serif' }}
      >
        {String(name)} ({value})
      </text>
    )
  }

  return (
    <div className={c.chartFrame}>
      <ResponsiveContainer width="100%" height={230}>
        <PieChart>
          <Pie
            data={items}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={80}
            innerRadius={36}
            paddingAngle={3}
            labelLine={false}
            label={renderLabel}
          >
            {items.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} strokeWidth={0} />
            ))}
          </Pie>
          <Tooltip />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Radial Bar Chart (grade / level — 2–5 items) ──────────────────────────

export function RadialBarViz({
  items,
  emptyLabel = 'No data yet.',
}: {
  items: LabeledVal[]
  emptyLabel?: string
}) {
  if (!items.length) return <p className={c.mutedEmpty}>{emptyLabel}</p>

  const max = Math.max(1, ...items.map((i) => i.value))
  const data = items.map((item, i) => ({
    name: item.label,
    value: item.value,
    fill: PALETTE[i % PALETTE.length],
    // Recharts radialBar uses `value` as the data, max sets scale
    pct: Math.round((item.value / max) * 100),
  }))

  return (
    <div className={c.chartFrame}>
      <ResponsiveContainer width="100%" height={220}>
        <RadialBarChart
          data={data}
          cx="50%"
          cy="50%"
          innerRadius="20%"
          outerRadius="90%"
          barSize={18}
          startAngle={90}
          endAngle={-270}
        >
          <RadialBar
            dataKey="value"
            background={{ fill: 'color-mix(in srgb, var(--border) 60%, transparent)' }}
            label={{ position: 'insideStart', fill: '#fff', fontSize: 11, fontWeight: 700 }}
          />
          <Legend
            iconSize={9}
            layout="vertical"
            verticalAlign="middle"
            align="right"
            wrapperStyle={{ fontSize: 11, paddingLeft: 8 }}
            formatter={(value: string) => {
              const item = data.find((d) => d.name === value)
              return `${value}${item ? ` (${item.value})` : ''}`
            }}
          />
          <Tooltip />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Training Completion Donut ──────────────────────────────────────────────

export function TrainingCompletionDonut({
  assignments,
  completions,
  label = 'assignments',
}: {
  assignments: number
  completions: number
  label?: string
}) {
  if (assignments <= 0) return <p className={c.mutedEmpty}>No {label} to chart yet.</p>

  const pct = Math.min(100, Math.max(0, (completions / assignments) * 100))
  const remaining = Math.max(0, assignments - completions)
  const pieData = [
    { name: 'Done', value: completions },
    { name: 'Remaining', value: remaining },
  ]

  return (
    <div className={c.donutWrap}>
      <div style={{ position: 'relative', width: 130, height: 130, flexShrink: 0 }}>
        <PieChart width={130} height={130}>
          <Pie
            data={pieData}
            cx={60}
            cy={60}
            innerRadius={44}
            outerRadius={60}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            strokeWidth={0}
          >
            <Cell fill={PRIMARY} />
            <Cell fill={BORDER} />
          </Pie>
        </PieChart>
        <div className={c.donutCenter}>
          <span className={c.donutCenterPct}>{pct.toFixed(0)}%</span>
          <span className={c.donutCenterSub}>{completions}/{assignments}</span>
        </div>
      </div>
      <div className={c.donutLegend}>
        <div>
          <strong>Completion</strong> rate across all training {label} in scope for this company.
        </div>
        <div className={c.mutedLine}>Done = {completions}, remaining = {remaining}.</div>
      </div>
    </div>
  )
}

// ── Pipeline Funnel ────────────────────────────────────────────────────────

const FUNNEL_COLORS = [PRIMARY, SECONDARY, ACCENT, '#5dade2', '#48c9b0', '#f0b27a'] as const

export function PipelineFunnel({ stages }: { stages: Array<{ label: string; value: number }> }) {
  if (!stages.length) return <p className={c.mutedEmpty}>No pipeline data yet.</p>

      const ordered = [...stages].sort((a, b) => b.value - a.value)
  const ref = Math.max(1, ordered[0]?.value ?? 1)

  return (
    <div className={c.funnel} aria-label="Recruitment pipeline by stage">
      {ordered.map((s, i) => {
        // Cap at 62% so label always has room; minimum 10% for visibility
        const wPct = Math.max(10, Math.min(62, (s.value / ref) * 62))
        return (
          <div key={s.label} className={c.funnelRow}>
            <div
              className={c.funnelBlock}
              style={{ width: `${wPct}%`, minWidth: 48, background: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }}
            >
              {s.value}
            </div>
            <div className={c.funnelLabel} title={s.label}>
              {s.label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Stacked Proportion Bar (payroll mix) ───────────────────────────────────

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0)
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`
}

export function StackedProportionBar({
  title,
  items,
  formatAmount,
}: {
  title: string
  items: Array<{ label: string; amount: number }>
  formatAmount: (n: number) => string
}) {
  const total = sum(items.map((i) => Math.abs(i.amount)))
  if (!items.length || total <= 0) return <p className={c.stackedEmpty}>No lines to show.</p>

  return (
    <div className={c.stackedRow}>
      <p className={c.stackedLabel}>
        {title} — share of {formatAmount(total)}
      </p>
      <div className={c.stackedBar} role="img" aria-label={title}>
        {items.map((it, i) => {
          const w = (Math.abs(it.amount) / total) * 100
          return (
            <div
              key={`${it.label}-${i}`}
              className={c.stackedSeg}
              style={{
                width: `${w}%`,
                background: `linear-gradient(180deg, ${PALETTE[i % PALETTE.length]}, color-mix(in srgb, var(--color-primary) 60%, #000))`,
              }}
              title={`${it.label}: ${formatAmount(it.amount)} (${w.toFixed(1)}%)`}
            >
              {w >= 5 ? (
                <span>
                  {truncate(it.label, 14)}
                  <br />
                  <span style={{ fontSize: '0.65rem', opacity: 0.9 }}>{w.toFixed(0)}%</span>
                </span>
              ) : w >= 0.5 ? (
                <span style={{ fontSize: '0.6rem', opacity: 0.85 }}>·</span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
