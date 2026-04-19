import ws from './PayrollWorksheet.module.css'

const fmt = (n: number | undefined) =>
  n === undefined || Number.isNaN(n) ? '—' : new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export type ReconciliationField = 'headcount' | 'total_gross' | 'total_deductions' | 'total_net'

const ROWS: { key: ReconciliationField; label: string; headcount?: boolean }[] = [
  { key: 'headcount', label: 'Total headcount', headcount: true },
  { key: 'total_gross', label: 'Total gross salary' },
  { key: 'total_deductions', label: 'Total deductions' },
  { key: 'total_net', label: 'Total net pay' },
]

export type ReconciliationWorksheetProps = {
  departmentName: string
  payPeriodLabel: string
  form: Record<ReconciliationField, string>
  setField: (key: ReconciliationField, value: string) => void
  fieldOk: Partial<Record<ReconciliationField, boolean>>
  showValidationColors: boolean
  engineExpected: { headcount: number; total_gross: number; total_deductions: number; total_net: number } | null
  showEngineColumn: boolean
  engineLoading: boolean
  onToggleEngineColumn: (show: boolean) => void
  readOnly?: boolean
}

function inputClass(
  name: ReconciliationField,
  showValidationColors: boolean,
  fieldOk: Partial<Record<ReconciliationField, boolean>>,
): string {
  if (!showValidationColors) return ws.input
  const ok = fieldOk[name]
  if (ok === undefined) return ws.input
  return `${ws.input} ${ok ? ws.inputSimOk : ws.inputSimBad}`
}

function engineVal(
  key: ReconciliationField,
  engineExpected: ReconciliationWorksheetProps['engineExpected'],
): number | undefined {
  if (!engineExpected) return undefined
  return engineExpected[key]
}

export function ReconciliationWorksheet({
  departmentName,
  payPeriodLabel,
  form,
  setField,
  fieldOk,
  showValidationColors,
  engineExpected,
  showEngineColumn,
  engineLoading,
  onToggleEngineColumn,
  readOnly = false,
}: ReconciliationWorksheetProps) {
  return (
    <div className={ws.sheet}>
      <div className={ws.sheetInner}>
        <div className={ws.toolbar}>
          <label className={ws.toggleLabel}>
            <input
              type="checkbox"
              checked={showEngineColumn}
              disabled={readOnly}
              onChange={(e) => onToggleEngineColumn(e.target.checked)}
            />
            Show engine column
          </label>
        </div>

        <h2 className={ws.docTitle}>Payroll reconciliation (practice)</h2>
        <p className={ws.docSubtitle}>
          {readOnly ? (
            <>
              <strong>View only</strong> — roll-up totals for this pay run. Enter values and validate are available to HR / compensation roles.
            </>
          ) : (
            <>
              Enter roll-up totals from the saved payslips for this department and month. Use <strong>Validate</strong> to check your figures
              against the system (within tolerance). This exercise does not affect salary release.
            </>
          )}
        </p>

        <div className={ws.metaGrid}>
          <div>
            <div className={ws.metaLabel}>Department</div>
            <div className={ws.metaValue}>{departmentName}</div>
          </div>
          <div>
            <div className={ws.metaLabel}>Pay period</div>
            <div className={ws.metaValue}>{payPeriodLabel}</div>
          </div>
        </div>

        <div className={ws.tableWrap}>
          <table className={ws.table}>
            <thead>
              <tr>
                <th className={ws.rowLabel}>Field</th>
                <th>{readOnly ? 'View (₹S / count)' : 'Learner input'}</th>
                {showEngineColumn ? <th className={ws.engineCol}>Engine value</th> : null}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(({ key, label, headcount }) => (
                <tr key={key}>
                  <td className={ws.rowLabel}>{label}</td>
                  <td className={ws.inputCell}>
                    <input
                      className={inputClass(key, showValidationColors, fieldOk)}
                      inputMode={headcount ? 'numeric' : 'decimal'}
                      value={form[key]}
                      readOnly={readOnly}
                      disabled={readOnly}
                      onChange={(e) => setField(key, e.target.value)}
                      autoComplete="off"
                    />
                  </td>
                  {showEngineColumn ? (
                    <td className={ws.engineCell}>
                      {engineLoading ? (
                        <span className={ws.engineLoading}>…</span>
                      ) : (
                        <span className={engineExpected ? '' : ws.engineEmpty}>
                          {engineExpected ? (
                            <span className={ws.engineValue}>
                              {headcount ? String(Math.round(engineVal(key, engineExpected) ?? 0)) : fmt(engineVal(key, engineExpected))}
                            </span>
                          ) : (
                            '—'
                          )}
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}
