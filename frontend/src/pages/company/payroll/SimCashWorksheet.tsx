import type { SimCashFormField } from '../../../api/compensationApi'
import ws from './PayrollWorksheet.module.css'

const fmt = (n: number | undefined) =>
  n === undefined || Number.isNaN(n) ? '—' : new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export const FIELD_LABELS: Record<SimCashFormField, string> = {
  basic: 'Basic salary',
  hra: 'HRA',
  conveyance: 'Conveyance allowance',
  medical: 'Medical allowance',
  lta: 'LTA',
  special_allowance: 'Special allowance',
  performance_bonus: 'Performance bonus',
  gross: 'Gross salary',
  pf_employee: 'PF (employee)',
  esi_employee: 'ESI (employee)',
  professional_tax: 'Professional tax',
  tds: 'TDS',
  loan_recovery: 'Loan recovery',
  leave_deduction: 'Leave deduction',
  other_deductions: 'Other deductions',
  total_deductions: 'Total deductions',
  net: 'Net pay',
}

const EARNINGS_KEYS: SimCashFormField[] = [
  'basic',
  'hra',
  'conveyance',
  'medical',
  'lta',
  'special_allowance',
  'performance_bonus',
  'gross',
]

const DEDUCTION_KEYS: SimCashFormField[] = [
  'pf_employee',
  'esi_employee',
  'professional_tax',
  'tds',
  'loan_recovery',
  'leave_deduction',
  'other_deductions',
  'total_deductions',
  'net',
]

export type SimCashWorksheetProps = {
  employeeName: string
  employeeCode: string
  payPeriodLabel: string
  ctcAnnual: number | null
  bonusPct: number | null
  form: Record<SimCashFormField, string>
  setField: (key: SimCashFormField, value: string) => void
  /** Optional: e.g. refetch engine when loan/other blur (debounced fetch may make this unnecessary). */
  onLoanOtherBlur?: () => void
  fieldOk: Partial<Record<SimCashFormField, boolean>>
  showValidationColors: boolean
  engineExpected: Record<string, number> | null
  employerExpected: Record<string, number> | null
  showEngineColumn: boolean
  engineLoading: boolean
  onToggleEngineColumn: (show: boolean) => void
  /** When true, inputs are display-only (e.g. company admin viewing a payslip). */
  readOnly?: boolean
  /** Read-only lines shown in Deductions (e.g. benefits premium from enrollments). */
  extraDeductionLines?: { label: string; amount: number }[]
  /** Read-only lines shown in Earnings (e.g. reimbursements total). */
  extraEarningLines?: { label: string; amount: number }[]
}

function inputClass(
  name: SimCashFormField,
  showValidationColors: boolean,
  fieldOk: Partial<Record<SimCashFormField, boolean>>,
): string {
  if (!showValidationColors) return ws.input
  const ok = fieldOk[name]
  if (ok === undefined) return ws.input
  return `${ws.input} ${ok ? ws.inputSimOk : ws.inputSimBad}`
}

export function SimCashWorksheet({
  employeeName,
  employeeCode,
  payPeriodLabel,
  ctcAnnual,
  bonusPct,
  form,
  setField,
  onLoanOtherBlur,
  fieldOk,
  showValidationColors,
  engineExpected,
  employerExpected,
  showEngineColumn,
  engineLoading,
  onToggleEngineColumn,
  readOnly = false,
  extraDeductionLines = [],
  extraEarningLines = [],
}: SimCashWorksheetProps) {
  function engineVal(key: string): number | undefined {
    return engineExpected?.[key]
  }

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
            Show engine reference (watermark column)
          </label>
        </div>

        <h2 className={ws.docTitle}>Salary calculation — SimCash (₹S)</h2>
        <p className={ws.docSubtitle}>
          {readOnly ? (
            <>
              <strong>View only</strong> — saved payslip amounts for this pay run. Editing is done by HR / compensation roles.
            </>
          ) : (
            <>
              Enter monthly amounts in <strong>Your input</strong>. The engine reference column shows what the backend calculates from
              the employee salary structure (for verification).
            </>
          )}
        </p>

        <div className={ws.metaGrid}>
          <div>
            <div className={ws.metaLabel}>Employee</div>
            <div className={ws.metaValue}>
              {employeeName} · {employeeCode}
            </div>
          </div>
          <div>
            <div className={ws.metaLabel}>Pay period</div>
            <div className={ws.metaValue}>{payPeriodLabel}</div>
          </div>
          <div>
            <div className={ws.metaLabel}>Annual CTC</div>
            <div className={ws.metaValue}>{ctcAnnual != null ? `₹S ${fmt(ctcAnnual)} / yr` : '—'}</div>
          </div>
          <div>
            <div className={ws.metaLabel}>Bonus % of CTC</div>
            <div className={ws.metaValue}>{bonusPct != null ? `${(bonusPct * 100).toFixed(2)}%` : '—'}</div>
          </div>
        </div>

        <div className={ws.tableWrap}>
          <table className={ws.table}>
            <thead>
              <tr>
                <th className={ws.rowLabel}>Component</th>
                <th>{readOnly ? 'Recorded (₹S / month)' : 'Your input (₹S / month)'}</th>
                {showEngineColumn ? (
                  <th className={ws.engineCol}>Engine reference</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              <tr className={ws.sectionRow}>
                <td colSpan={showEngineColumn ? 3 : 2}>Earnings</td>
              </tr>
              {EARNINGS_KEYS.map((name) => (
                <tr key={name}>
                  <td className={ws.rowLabel}>{FIELD_LABELS[name]}</td>
                  <td className={ws.inputCell}>
                    <input
                      className={inputClass(name, showValidationColors, fieldOk)}
                      inputMode="decimal"
                      value={form[name]}
                      readOnly={readOnly}
                      disabled={readOnly}
                      onChange={(e) => setField(name, e.target.value)}
                      autoComplete="off"
                    />
                  </td>
                  {showEngineColumn ? (
                    <td className={ws.engineCell}>
                      {engineLoading ? (
                        <span className={ws.engineLoading}>…</span>
                      ) : (
                        <span className={engineExpected ? '' : ws.engineEmpty}>
                          {engineExpected ? <span className={ws.engineValue}>{fmt(engineVal(name))}</span> : '—'}
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
              {extraEarningLines.map((line) => (
                <tr key={`extra-earn-${line.label}`}>
                  <td className={ws.rowLabel}>{line.label}</td>
                  <td className={ws.inputCell}>
                    <span className={ws.engineValue}>₹S {fmt(line.amount)}</span>
                  </td>
                  {showEngineColumn ? (
                    <td className={ws.engineCell}>
                      <span className={ws.engineEmpty}>—</span>
                    </td>
                  ) : null}
                </tr>
              ))}

              <tr className={`${ws.sectionRow} ${ws.employer}`}>
                <td colSpan={showEngineColumn ? 3 : 2}>Employer contributions (from CTC)</td>
              </tr>
              <tr>
                <td className={ws.rowLabel}>PF (employer)</td>
                <td className={ws.inputCell}>
                  <span className={ws.engineEmpty}>—</span>
                </td>
                {showEngineColumn ? (
                  <td className={ws.engineCell}>
                    {engineLoading ? (
                      <span className={ws.engineLoading}>…</span>
                    ) : (
                      fmt(employerExpected?.pf_employer)
                    )}
                  </td>
                ) : null}
              </tr>
              <tr>
                <td className={ws.rowLabel}>ESI (employer)</td>
                <td className={ws.inputCell}>
                  <span className={ws.engineEmpty}>—</span>
                </td>
                {showEngineColumn ? (
                  <td className={ws.engineCell}>
                    {engineLoading ? (
                      <span className={ws.engineLoading}>…</span>
                    ) : (
                      fmt(employerExpected?.esi_employer)
                    )}
                  </td>
                ) : null}
              </tr>
              <tr>
                <td className={ws.rowLabel}>Gratuity (employer)</td>
                <td className={ws.inputCell}>
                  <span className={ws.engineEmpty}>—</span>
                </td>
                {showEngineColumn ? (
                  <td className={ws.engineCell}>
                    {engineLoading ? (
                      <span className={ws.engineLoading}>…</span>
                    ) : (
                      fmt(employerExpected?.gratuity_employer)
                    )}
                  </td>
                ) : null}
              </tr>

              <tr className={ws.sectionRow}>
                <td colSpan={showEngineColumn ? 3 : 2}>Deductions</td>
              </tr>
              {DEDUCTION_KEYS.map((name) => (
                <tr key={name} className={name === 'net' ? ws.netRow : undefined}>
                  <td className={ws.rowLabel}>{FIELD_LABELS[name]}</td>
                  <td className={ws.inputCell}>
                    <input
                      className={inputClass(name, showValidationColors, fieldOk)}
                      inputMode="decimal"
                      value={form[name]}
                      readOnly={readOnly}
                      disabled={readOnly}
                      onChange={(e) => setField(name, e.target.value)}
                      onBlur={
                        !readOnly &&
                        (name === 'loan_recovery' || name === 'leave_deduction' || name === 'other_deductions') &&
                        onLoanOtherBlur
                          ? () => onLoanOtherBlur()
                          : undefined
                      }
                      autoComplete="off"
                    />
                  </td>
                  {showEngineColumn ? (
                    <td className={ws.engineCell}>
                      {engineLoading ? (
                        <span className={ws.engineLoading}>…</span>
                      ) : (
                        <span className={engineExpected ? '' : ws.engineEmpty}>
                          {engineExpected ? <span className={ws.engineValue}>{fmt(engineVal(name))}</span> : '—'}
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
              {extraDeductionLines.map((line) => (
                <tr key={`extra-ded-${line.label}`}>
                  <td className={ws.rowLabel}>{line.label}</td>
                  <td className={ws.inputCell}>
                    <span className={ws.engineValue}>₹S {fmt(line.amount)}</span>
                  </td>
                  {showEngineColumn ? (
                    <td className={ws.engineCell}>
                      <span className={ws.engineEmpty}>—</span>
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

export { EARNINGS_KEYS as WORKSHEET_EARNINGS_KEYS, DEDUCTION_KEYS as WORKSHEET_DEDUCTION_KEYS }
