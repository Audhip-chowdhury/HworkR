import type { AnalyticsDashboard } from '../../../api/analyticsApi'

export type ReportSectionMeta = {
  id: string
  category: string
  title: string
  /** CSV rows (no header row required); first column often a label. */
  rows: (d: AnalyticsDashboard) => string[][]
}

function esc(cell: string): string {
  if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`
  return cell
}

export const ANALYTICS_REPORT_SECTIONS: ReportSectionMeta[] = [
  {
    id: 'hc_summary',
    category: 'Headcount',
    title: 'Headcount summary',
    rows: (d) => [
      ['Metric', 'Value'],
      ['Total employees', String(d.headcount.total)],
      ['Active employees', String(d.headcount.active)],
      ['Hires (last 12 months)', String(d.headcount.hires_last_12_months)],
    ],
  },
  {
    id: 'hc_status',
    category: 'Headcount',
    title: 'Employees by status',
    rows: (d) => [['Status', 'Count'], ...Object.entries(d.headcount.by_status).map(([k, v]) => [k, String(v)])],
  },
  {
    id: 'hc_dept',
    category: 'Headcount',
    title: 'Headcount by department',
    rows: (d) => [
      ['Department', 'Count'],
      ...d.headcount.by_department.map((r) => [r.department, String(r.count)]),
    ],
  },
  {
    id: 'hc_loc',
    category: 'Headcount',
    title: 'Headcount by location',
    rows: (d) => [
      ['Location', 'Count'],
      ...d.headcount.by_location.map((r) => [r.location, String(r.count)]),
    ],
  },
  {
    id: 'hc_grade',
    category: 'Headcount',
    title: 'Headcount by grade / level',
    rows: (d) => [['Grade / level', 'Count'], ...d.headcount.by_grade.map((r) => [r.grade, String(r.count)])],
  },
  {
    id: 'hc_hire_trend',
    category: 'Headcount',
    title: 'New hire trend (by month)',
    rows: (d) => [
      ['Month', 'Hires recorded'],
      ...d.headcount.new_hires_trend_monthly.map((r) => [r.month, String(r.count)]),
    ],
  },
  {
    id: 'attrition',
    category: 'Attrition',
    title: 'Attrition snapshot',
    rows: (d) => [
      ['Metric', 'Value'],
      ['Separated headcount', String(d.attrition.separated_headcount)],
      ['Attrition rate %', d.attrition.attrition_rate_percent == null ? '' : String(d.attrition.attrition_rate_percent)],
      ['Definition', d.attrition.note],
    ],
  },
  {
    id: 'diversity',
    category: 'Diversity',
    title: 'Gender distribution (profile JSON)',
    rows: (d) => {
      if (!d.diversity.gender || !Object.keys(d.diversity.gender).length) {
        return [['Note', 'No gender fields found on employee profiles.']]
      }
      return [['Gender', 'Count'], ...Object.entries(d.diversity.gender).map(([k, v]) => [k, String(v)])]
    },
  },
  {
    id: 'rec_summary',
    category: 'Recruitment',
    title: 'Recruitment summary',
    rows: (d) => [
      ['Metric', 'Value'],
      ['Open postings', String(d.recruitment.open_postings)],
      ['Applications', String(d.recruitment.applications)],
      ['Offers', String(d.recruitment.offers)],
      ['Accepted offers', String(d.recruitment.accepted_offers)],
      ['Avg time to fill (days)', d.recruitment.avg_time_to_fill_days == null ? '' : String(d.recruitment.avg_time_to_fill_days)],
      ['Median time to fill (days)', d.recruitment.median_time_to_fill_days == null ? '' : String(d.recruitment.median_time_to_fill_days)],
      ['Avg cost per hire (offer comp)', d.recruitment.avg_cost_per_hire == null ? '' : String(d.recruitment.avg_cost_per_hire)],
    ],
  },
  {
    id: 'rec_pipeline',
    category: 'Recruitment',
    title: 'Pipeline by stage',
    rows: (d) => [
      ['Stage', 'Applications'],
      ...d.recruitment.pipeline_by_stage.map((r) => [r.stage, String(r.count)]),
    ],
  },
  {
    id: 'rec_app_trend',
    category: 'Recruitment',
    title: 'Applications (last ~6 months, by month)',
    rows: (d) => [
      ['Month', 'Applications'],
      ...d.recruitment.applications_trend_monthly.map((r) => [r.month, String(r.count)]),
    ],
  },
  {
    id: 'leave_summary',
    category: 'Leave',
    title: 'Leave summary',
    rows: (d) => [
      ['Metric', 'Value'],
      ['Pending requests', String(d.leave.pending_requests)],
      ['Approved requests', String(d.leave.approved_requests)],
      ['Balance snapshot year', String(d.leave.year)],
    ],
  },
  {
    id: 'leave_by_type',
    category: 'Leave',
    title: 'Approved leave by type',
    rows: (d) => [
      ['Type', 'Requests', 'Approx. calendar days'],
      ...d.leave.by_type.map((r) => [r.type, String(r.requests), String(r.approx_calendar_days)]),
    ],
  },
  {
    id: 'leave_balances',
    category: 'Leave',
    title: 'Leave balances (sum by type, current year)',
    rows: (d) => [
      ['Type', 'Total balance'],
      ...d.leave.balance_by_type_year.map((r) => [r.type, String(r.total_balance)]),
    ],
  },
  {
    id: 'learning_summary',
    category: 'Learning',
    title: 'Training summary',
    rows: (d) => [
      ['Metric', 'Value'],
      ['Assignments', String(d.learning.training_assignments)],
      ['Completions', String(d.learning.training_completions)],
      ['Completion rate %', d.learning.completion_rate_percent == null ? '' : String(d.learning.completion_rate_percent)],
    ],
  },
  {
    id: 'learning_courses',
    category: 'Learning',
    title: 'Completions by course',
    rows: (d) => [
      ['Course', 'Completions'],
      ...d.learning.completion_by_course.map((r) => [r.course, String(r.completions)]),
    ],
  },
  {
    id: 'payroll_latest',
    category: 'Payroll',
    title: 'Latest pay run & totals',
    rows: (d) => {
      if (!d.payroll.latest_run || !d.payroll.totals) {
        return [['Note', 'No pay run or payslip data available.']]
      }
      const r = d.payroll.latest_run
      const t = d.payroll.totals
      return [
        ['Metric', 'Value'],
        ['Pay run id', r.id],
        ['Period', `${r.year}-${String(r.month).padStart(2, '0')}`],
        ['Status', r.status],
        ['Run kind', r.run_kind],
        ['Label', r.run_label ?? ''],
        ['Payslip count', String(t.payslip_count)],
        ['Gross total', String(t.gross)],
        ['Net total', String(t.net)],
      ]
    },
  },
  {
    id: 'payroll_earnings',
    category: 'Payroll',
    title: 'Earnings breakdown (latest run)',
    rows: (d) => {
      if (!d.payroll.earnings_breakdown.length) {
        return [['Note', 'No earnings lines in payslips for the latest run.']]
      }
      return [
        ['Component', 'Amount'],
        ...d.payroll.earnings_breakdown.map((r) => [r.component, String(r.amount)]),
      ]
    },
  },
  {
    id: 'payroll_deductions',
    category: 'Payroll',
    title: 'Deductions breakdown (latest run)',
    rows: (d) => {
      if (!d.payroll.deductions_breakdown.length) {
        return [['Note', 'No deduction lines in payslips for the latest run.']]
      }
      return [
        ['Component', 'Amount'],
        ...d.payroll.deductions_breakdown.map((r) => [r.component, String(r.amount)]),
      ]
    },
  },
]

export function buildCustomReportCsv(sections: ReportSectionMeta[], selectedIds: Set<string>, data: AnalyticsDashboard): string {
  const lines: string[] = []
  const ts = new Date().toISOString().slice(0, 19)
  lines.push(['Report', 'HworkR analytics (custom export)'].map(esc).join(','))
  lines.push(['Generated (UTC)', ts].map(esc).join(','))
  lines.push('')
  for (const s of sections) {
    if (!selectedIds.has(s.id)) continue
    lines.push(['Section', s.title].map(esc).join(','))
    for (const row of s.rows(data)) {
      lines.push(row.map(esc).join(','))
    }
    lines.push('')
  }
  return `\uFEFF${lines.join('\n')}`
}

export function previewReportRows(sections: ReportSectionMeta[], selectedIds: Set<string>, data: AnalyticsDashboard, maxRows: number): string[][] {
  const out: string[][] = []
  for (const s of sections) {
    if (!selectedIds.has(s.id)) continue
    out.push([`— ${s.title} —`])
    for (const row of s.rows(data)) {
      out.push(row)
      if (out.length >= maxRows) return out
    }
    out.push([])
  }
  return out
}
