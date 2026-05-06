import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getAnalyticsDashboard, type AnalyticsDashboard } from '../../../api/analyticsApi'
import { downloadExport } from '../../../api/exportsApi'
import base from '../CompanyWorkspacePage.module.css'
import styles from './AnalyticsPage.module.css'
import {
  ANALYTICS_REPORT_SECTIONS,
  buildCustomReportCsv,
  previewReportRows,
} from './analyticsReportBuilder'
import {
  HorizontalBarChart,
  LabeledBarChart,
  MonthlyTrendBarChart,
  MonthlyTrendLineChart,
  PieDonutChart,
  PipelineFunnel,
  RadialBarViz,
  StackedProportionBar,
  TrainingCompletionDonut,
} from './AnalyticsCharts'
import { formatChartMonthLabel } from './analyticsMonthFormat'

type BarItem = { label: string; count: number }

const EXPORT_LINKS: Array<{ path: string; filename: string; label: string; hint: string }> = [
  { path: '/analytics/export/employees.csv', filename: 'employees.csv', label: 'Employees', hint: 'Codes, departments, status, hire dates' },
  { path: '/exports/recruitment/applications.csv', filename: 'applications.csv', label: 'Applications', hint: 'Full applicant pipeline export' },
  { path: '/exports/recruitment/requisitions.csv', filename: 'requisitions.csv', label: 'Requisitions', hint: 'Open and historical reqs' },
  { path: '/exports/recruitment/offers.csv', filename: 'offers.csv', label: 'Offers', hint: 'Compensation snapshots where captured' },
  { path: '/exports/leave/requests.csv', filename: 'leave-requests.csv', label: 'Leave requests', hint: 'All leave rows with dates and status' },
  { path: '/exports/learning/training-assignments.csv', filename: 'training-assignments.csv', label: 'Training assignments', hint: 'Per-employee course assignments' },
  { path: '/exports/learning/training-completions.csv', filename: 'training-completions.csv', label: 'Training completions', hint: 'Completion timestamps and scores' },
]

export function AnalyticsPage() {
  const { companyId = '' } = useParams()
  const [data, setData] = useState<AnalyticsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportErr, setExportErr] = useState<string | null>(null)
  const [reportSelection, setReportSelection] = useState<Set<string>>(() => new Set(['hc_summary', 'rec_summary', 'learning_summary']))
  const [toolsTab, setToolsTab] = useState<'report' | 'export'>('report')

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    void getAnalyticsDashboard(companyId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [companyId])

  const deptBars = useMemo<BarItem[]>(
    () => (data ? data.headcount.by_department.map((d) => ({ label: d.department, count: d.count })) : []),
    [data],
  )
  const locBars = useMemo<BarItem[]>(
    () => (data ? data.headcount.by_location.map((d) => ({ label: d.location, count: d.count })) : []),
    [data],
  )
  const gradeBars = useMemo<BarItem[]>(
    () => (data ? data.headcount.by_grade.map((d) => ({ label: d.grade, count: d.count })) : []),
    [data],
  )
  const stageBars = useMemo<BarItem[]>(
    () => (data ? data.recruitment.pipeline_by_stage.map((d) => ({ label: d.stage, count: d.count })) : []),
    [data],
  )

  const toggleReport = useCallback((id: string, on: boolean) => {
    setReportSelection((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const selectAllReport = useCallback(() => {
    setReportSelection(new Set(ANALYTICS_REPORT_SECTIONS.map((s) => s.id)))
  }, [])

  const clearReport = useCallback(() => setReportSelection(new Set()), [])

  const downloadCustomCsv = useCallback(() => {
    if (!companyId || !data || reportSelection.size === 0) return
    const csv = buildCustomReportCsv(ANALYTICS_REPORT_SECTIONS, reportSelection, data)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics-custom-report-${companyId.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [companyId, data, reportSelection])

  async function runServerExport(path: string, filename: string) {
    if (!companyId) return
    setExportErr(null)
    setExportBusy(true)
    try {
      await downloadExport(companyId, path, filename)
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setExportBusy(false)
    }
  }

  const previewRows = useMemo(() => {
    if (!data) return []
    return previewReportRows(ANALYTICS_REPORT_SECTIONS, reportSelection, data, 80)
  }, [data, reportSelection])

  const reportByCategory = useMemo(() => {
    const m = new Map<string, typeof ANALYTICS_REPORT_SECTIONS>()
    for (const s of ANALYTICS_REPORT_SECTIONS) {
      const arr = m.get(s.category) ?? []
      arr.push(s)
      m.set(s.category, arr)
    }
    return m
  }, [])

  const formatPayrollAmount = useCallback((n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 }), [])

  return (
    <div className={base.org}>
      <header>
        <h2 className={styles.pageH2}>Analytics</h2>
        <p className={styles.intro}>
          Pre-built dashboards use live company data (employees, org, recruitment, leave, learning, and payroll where present).
          Use <strong>Reports & exports</strong> below to build a custom CSV or download raw tables for Excel.
        </p>
      </header>

      {error ? <p className={base.error}>{error}</p> : null}
      {loading ? <p className={base.muted}>Loading analytics…</p> : null}

      {data ? (
        <>
          <section aria-labelledby="dash-heading">
            <h3 id="dash-heading" className={styles.sectionTitle}>
              Dashboard
            </h3>

            {/* ── KPI number strip ──────────────────────────────────── */}
            <div className={styles.kpiStrip}>
              <div className={styles.tile}>
                <p className={styles.tileTitle}>Active headcount</p>
                <p className={styles.tileValue}>{data.headcount.active}</p>
                <p className={styles.tileSub}>
                  {data.headcount.total} total roster · {data.headcount.hires_last_12_months} hires (12 mo.)
                </p>
              </div>
              <div className={styles.tile}>
                <p className={styles.tileTitle}>Attrition rate</p>
                <p className={styles.tileValue}>
                  {data.attrition.attrition_rate_percent != null ? `${data.attrition.attrition_rate_percent}%` : '—'}
                </p>
                <p className={styles.tileSub}>
                  {data.attrition.separated_headcount} separated · rate = separated ÷ (active + separated)
                </p>
              </div>
              <div className={styles.tile}>
                <p className={styles.tileTitle}>Open postings</p>
                <p className={styles.tileValue}>{data.recruitment.open_postings}</p>
                <p className={styles.tileSub}>
                  {data.recruitment.applications} applications · {data.recruitment.accepted_offers} offers accepted
                </p>
              </div>
            </div>

            {/* ── Magazine 2-column ─────────────────────────────────── */}
            <div className={styles.magazine}>

              {/* Left sidebar: smaller visualizations */}
              <div className={styles.magazineLeft}>

                <div className={`${styles.tile} ${styles.tileVizTall}`}>
                  <p className={styles.tileTitle}>Training completion</p>
                  <TrainingCompletionDonut
                    assignments={data.learning.training_assignments}
                    completions={data.learning.training_completions}
                  />
                </div>

                <div className={`${styles.tile} ${styles.tileFunnel}`}>
                  <p className={styles.tileTitle}>Recruitment pipeline</p>
                  <p className={styles.tileSub}>
                    {data.recruitment.open_postings} open · {data.recruitment.applications} applications ·{' '}
                    {data.recruitment.accepted_offers} accepted
                  </p>
                  <PipelineFunnel
                    stages={stageBars.map((b) => ({ label: b.label, value: b.count }))}
                  />
                </div>

                {data.diversity.gender && Object.keys(data.diversity.gender).length > 0 ? (
                  <div className={`${styles.tile} ${styles.tileHBar}`}>
                    <p className={styles.tileTitle}>Diversity (gender)</p>
                    <PieDonutChart
                      items={Object.entries(data.diversity.gender).map(([label, value]) => ({ label, value: Math.round(value) }))}
                      emptyLabel=""
                    />
                  </div>
                ) : null}

                <div className={`${styles.tile} ${styles.tileHBar}`}>
                  <p className={styles.tileTitle}>Training completion by course</p>
                  <HorizontalBarChart
                    items={data.learning.completion_by_course.map((r) => ({ label: r.course, value: r.completions }))}
                    xLabel="Completions"
                    emptyLabel="No completions yet."
                  />
                </div>

              </div>

              {/* Right main: large charts that need width */}
              <div className={styles.magazineRight}>

                <div className={`${styles.tile} ${styles.tileHBar}`}>
                  <p className={styles.tileTitle}>Headcount by department</p>
                  <HorizontalBarChart
                    items={deptBars.map((b) => ({ label: b.label, value: b.count }))}
                    xLabel="Headcount"
                    emptyLabel="No employees or departments yet."
                  />
                </div>

                <div className={`${styles.tile} ${styles.tileHBar}`}>
                  <p className={styles.tileTitle}>Headcount by grade / level</p>
                  <p className={styles.tileSub}>From job catalog grade or level on each employee&apos;s job.</p>
                  <RadialBarViz
                    items={gradeBars.map((b) => ({ label: b.label, value: b.count }))}
                    emptyLabel="No job catalog links on employees yet."
                  />
                </div>

                <div className={`${styles.tile} ${styles.tileHBar}`}>
                  <p className={styles.tileTitle}>Headcount by location</p>
                  <PieDonutChart
                    items={locBars.map((b) => ({ label: b.label, value: b.count }))}
                    emptyLabel="No location assignments yet."
                  />
                </div>

              </div>
            </div>

            {/* ── Trend pair: side-by-side full-width row ────────────── */}
            <div className={styles.trendPair}>
              <div className={`${styles.tile} ${styles.tileChart}`}>
                <p className={styles.tileTitle}>New hire trend (by month)</p>
                <MonthlyTrendBarChart points={data.headcount.new_hires_trend_monthly} yLabel="New hires" />
              </div>
              <div className={`${styles.tile} ${styles.tileChart}`}>
                <p className={styles.tileTitle}>Applications (recent months)</p>
                <MonthlyTrendLineChart points={data.recruitment.applications_trend_monthly} yLabel="Applications" />
              </div>
            </div>

            {/* ── Full-width: Time to fill & cost per hire ──────────── */}
            <div className={`${styles.tile} ${styles.fullRow}`}>
              <p className={styles.tileTitle}>Time to fill & cost per hire</p>
              <p className={styles.tileSub}>
                Accepted offers: posting created → offer response.
              </p>
              <div className={styles.recruitKpiGrid} role="group" aria-label="Recruit KPIs">
                <div className={styles.recruitKpiCell}>
                  <p className={styles.recruitKpiLabel}>Avg. time to fill</p>
                  <p className={styles.recruitKpiValue}>
                    {data.recruitment.avg_time_to_fill_days != null ? `${data.recruitment.avg_time_to_fill_days} d` : '—'}
                  </p>
                </div>
                <div className={styles.recruitKpiCell}>
                  <p className={styles.recruitKpiLabel}>Median</p>
                  <p className={styles.recruitKpiValue}>
                    {data.recruitment.median_time_to_fill_days != null ? `${data.recruitment.median_time_to_fill_days} d` : '—'}
                  </p>
                </div>
                <div className={styles.recruitKpiCell}>
                  <p className={styles.recruitKpiLabel}>Avg. cost / hire</p>
                  <p className={styles.recruitKpiValue}>
                    {data.recruitment.avg_cost_per_hire != null ? data.recruitment.avg_cost_per_hire : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Full-width: Leave ─────────────────────────────────── */}
            <div className={`${styles.tile} ${styles.fullRow}`}>
              <p className={styles.tileTitle}>Leave utilization</p>
              <p className={styles.tileSub}>
                {data.leave.pending_requests} pending · {data.leave.approved_requests} approved · balances summed for{' '}
                {data.leave.year}
              </p>
              {data.leave.by_type.length ? (
                <div className={styles.leaveChartPair}>
                  <div className={styles.leaveSubchart}>
                    <p className={styles.vizSubheading}>Requests by type (approved)</p>
                    <LabeledBarChart
                      items={data.leave.by_type.map((r) => ({ label: r.type, value: r.requests }))}
                      yLabel="Requests"
                      emptyLabel=""
                    />
                  </div>
                  <div className={styles.leaveSubchart}>
                    <p className={styles.vizSubheading}>Approx. calendar days by type</p>
                    <LabeledBarChart
                      items={data.leave.by_type.map((r) => ({
                        label: r.type,
                        value: Math.round((r.approx_calendar_days + Number.EPSILON) * 10) / 10,
                      }))}
                      yLabel="Days (approx.)"
                      emptyLabel=""
                    />
                  </div>
                </div>
              ) : (
                <p className={base.muted}>No approved leave data by type yet.</p>
              )}
            </div>

            {/* ── Full-width: Payroll ───────────────────────────────── */}
            <div className={`${styles.tile} ${styles.fullRow}`}>
              <p className={styles.tileTitle}>Payroll cost breakdown (latest pay run)</p>
              {data.payroll.latest_run && data.payroll.totals ? (
                <>
                  <p className={styles.tileSub}>
                    Period{' '}
                    {formatChartMonthLabel(
                      `${data.payroll.latest_run.year}-${String(data.payroll.latest_run.month).padStart(2, '0')}`,
                    )}{' '}
                    · {data.payroll.latest_run.status} · {data.payroll.totals.payslip_count} payslips · gross{' '}
                    {data.payroll.totals.gross} · net {data.payroll.totals.net}
                  </p>
                  <div className={styles.payrollBarRow}>
                    <StackedProportionBar
                      title="Earnings mix"
                      items={data.payroll.earnings_breakdown.map((r) => ({ label: r.component, amount: r.amount }))}
                      formatAmount={formatPayrollAmount}
                    />
                    <StackedProportionBar
                      title="Deductions mix"
                      items={data.payroll.deductions_breakdown.map((r) => ({ label: r.component, amount: r.amount }))}
                      formatAmount={formatPayrollAmount}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                    <div>
                      <p className={styles.tileSub} style={{ fontWeight: 600 }}>Earnings</p>
                      <div className={styles.tableWrap} style={{ maxHeight: 180 }}>
                        <table className={styles.table}>
                          <thead>
                            <tr><th>Component</th><th>Sum</th></tr>
                          </thead>
                          <tbody>
                            {data.payroll.earnings_breakdown.length ? (
                              data.payroll.earnings_breakdown.map((r) => (
                                <tr key={r.component}><td>{r.component}</td><td>{r.amount}</td></tr>
                              ))
                            ) : (
                              <tr><td colSpan={2}><span className={base.muted}>No earnings lines.</span></td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div>
                      <p className={styles.tileSub} style={{ fontWeight: 600 }}>Deductions</p>
                      <div className={styles.tableWrap} style={{ maxHeight: 180 }}>
                        <table className={styles.table}>
                          <thead>
                            <tr><th>Component</th><th>Sum</th></tr>
                          </thead>
                          <tbody>
                            {data.payroll.deductions_breakdown.length ? (
                              data.payroll.deductions_breakdown.map((r) => (
                                <tr key={r.component}><td>{r.component}</td><td>{r.amount}</td></tr>
                              ))
                            ) : (
                              <tr><td colSpan={2}><span className={base.muted}>No deduction lines.</span></td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <p className={base.muted}>No pay runs or payslips found for this company yet.</p>
              )}
            </div>

          </section>

          <section className={base.card} aria-labelledby="tools-heading">
            <h3 id="tools-heading" className={styles.sectionTitle}>
              Reports & exports
            </h3>
            <p className={styles.sectionHint}>Switch tabs between the custom report builder and server CSV downloads.</p>
            <ul className={styles.toolsTabList} role="tablist" aria-label="Reports and exports">
              <li className={styles.toolsTab} role="presentation">
                <button
                  type="button"
                  id="analytics-tab-report"
                  role="tab"
                  aria-selected={toolsTab === 'report'}
                  aria-controls="analytics-panel-report"
                  className={`${styles.toolsTabBtn} ${toolsTab === 'report' ? styles.toolsTabBtnActive : ''}`}
                  onClick={() => setToolsTab('report')}
                >
                  Custom report builder
                </button>
              </li>
              <li className={styles.toolsTab} role="presentation">
                <button
                  type="button"
                  id="analytics-tab-export"
                  role="tab"
                  aria-selected={toolsTab === 'export'}
                  aria-controls="analytics-panel-export"
                  className={`${styles.toolsTabBtn} ${toolsTab === 'export' ? styles.toolsTabBtnActive : ''}`}
                  onClick={() => setToolsTab('export')}
                >
                  Data export
                </button>
              </li>
            </ul>

            <div
              id="analytics-panel-report"
              role="tabpanel"
              aria-labelledby="analytics-tab-report"
              hidden={toolsTab !== 'report'}
              className={styles.toolsTabPanel}
            >
              <p className={styles.sectionHint} style={{ marginTop: 0 }}>
                Choose metric bundles, preview the shape of the export, then download a UTF-8 CSV (opens cleanly in Excel).
              </p>
              <div className={styles.reportLayout}>
                <div>
                  <div className={styles.reportActions} style={{ marginTop: 0 }}>
                    <button type="button" className={base.btnSm} onClick={selectAllReport}>
                      Select all
                    </button>
                    <button type="button" className={base.btnSm} onClick={clearReport}>
                      Clear
                    </button>
                    <button type="button" className={base.btn} disabled={reportSelection.size === 0} onClick={downloadCustomCsv}>
                      Download custom CSV
                    </button>
                  </div>
                  <p className={styles.mutedNote}>{reportSelection.size} section(s) selected.</p>
                  <div className={styles.reportChecks}>
                    {[...reportByCategory.entries()].map(([cat, secs]) => (
                      <div key={cat}>
                        <p className={styles.reportCat}>{cat}</p>
                        {secs.map((s) => (
                          <label key={s.id} className={styles.checkLine}>
                            <input
                              type="checkbox"
                              checked={reportSelection.has(s.id)}
                              onChange={(e) => toggleReport(s.id, e.target.checked)}
                            />
                            <span>{s.title}</span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className={styles.tileSub} style={{ fontWeight: 600 }}>
                    Preview (truncated)
                  </p>
                  <pre className={styles.previewBox}>{previewRows.map((r) => r.join(' · ')).join('\n')}</pre>
                </div>
              </div>
            </div>

            <div
              id="analytics-panel-export"
              role="tabpanel"
              aria-labelledby="analytics-tab-export"
              hidden={toolsTab !== 'export'}
              className={styles.toolsTabPanel}
            >
              <p className={styles.sectionHint} style={{ marginTop: 0 }}>
                Server-side CSV downloads (same endpoints as the Exports page). Uses your session.
              </p>
              {exportErr ? <p className={base.error}>{exportErr}</p> : null}
              <div className={styles.exportGrid}>
                {EXPORT_LINKS.map((x) => (
                  <div key={x.path}>
                    <button
                      type="button"
                      className={base.btnSm}
                      style={{ width: '100%' }}
                      disabled={exportBusy}
                      onClick={() => void runServerExport(x.path, x.filename)}
                    >
                      {x.label}
                    </button>
                    <p className={styles.mutedNote}>{x.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
