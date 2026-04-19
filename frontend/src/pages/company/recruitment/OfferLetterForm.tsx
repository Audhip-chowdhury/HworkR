import type { ReactNode } from 'react'
import type { EmployeeSummary } from '../../../api/employeesApi'
import styles from './OfferLetterForm.module.css'

export type EmploymentType = 'full_time' | 'contract' | 'part_time'
export type WorkMode = 'onsite' | 'remote' | 'hybrid'
export type PayFrequency = 'monthly' | 'biweekly' | 'weekly'

export type OfferLetterFormValues = {
  candidateFullName: string
  letterDate: string
  candidateAddressEmail: string
  jobTitle: string
  departmentId: string
  reportingManagerEmployeeId: string
  employmentType: EmploymentType
  workMode: WorkMode
  annualCtc: string
  fixedVariableSplit: string
  payFrequency: PayFrequency
  bonusIncentive: string
  stockEsop: string
  dateOfJoining: string
  offerExpiry: string
  probation: string
  noticePeriod: string
  backgroundVerification: string
  confidentialityNda: string
  nonCompete: string
  documentsOnJoining: string
  companyName: string
  includeLogoSeal: boolean
  candidateSignatureLine: string
}

export const defaultOfferLetterValues = (letterDate: string): OfferLetterFormValues => ({
  candidateFullName: '',
  letterDate,
  candidateAddressEmail: '',
  jobTitle: '',
  departmentId: '',
  reportingManagerEmployeeId: '',
  employmentType: 'full_time',
  workMode: 'hybrid',
  annualCtc: '',
  fixedVariableSplit: '70% fixed / 30% variable',
  payFrequency: 'monthly',
  bonusIncentive: '',
  stockEsop: '',
  dateOfJoining: '',
  offerExpiry: '',
  probation: '6 months',
  noticePeriod: 'During probation: 15 days. After confirmation: 60 days.',
  backgroundVerification:
    'This offer is contingent upon satisfactory completion of background and reference checks in line with company policy.',
  confidentialityNda: '',
  nonCompete: '',
  documentsOnJoining: 'Government ID, education certificates, prior employment relieving letters, bank details, tax declarations.',
  companyName: '',
  includeLogoSeal: true,
  candidateSignatureLine:
    'I have read and understood the terms above. I accept this offer of employment.',
})

type Dept = { id: string; name: string }

type Props = {
  values: OfferLetterFormValues
  onChange: (patch: Partial<OfferLetterFormValues>) => void
  departments: Dept[]
  managers: EmployeeSummary[]
  /** Shown under fields when pre-filled from application/org data */
  hints: Partial<Record<keyof OfferLetterFormValues, string>>
  companyLogoUrl: string | null
}

function Field({
  label,
  required,
  hint,
  children,
  full,
}: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
  full?: boolean
}) {
  return (
    <div className={`${styles.field} ${full ? styles.fieldFull : ''}`}>
      <label className={styles.label}>
        {required ? <span className={styles.req}>* </span> : null}
        {label}
      </label>
      {children}
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  )
}

export function OfferLetterForm({ values, onChange, departments, managers, hints, companyLogoUrl }: Props) {
  const set = onChange

  return (
    <div className={styles.wrap}>
      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Candidate details</h4>
        <div className={styles.grid2}>
          <Field label="Candidate full name" required hint={hints.candidateFullName}>
            <input
              className={styles.input}
              value={values.candidateFullName}
              onChange={(e) => set({ candidateFullName: e.target.value })}
              autoComplete="name"
            />
          </Field>
          <Field label="Date of the letter" required>
            <input
              className={styles.input}
              type="date"
              value={values.letterDate}
              onChange={(e) => set({ letterDate: e.target.value })}
            />
          </Field>
          <Field label="Candidate address / email" full hint={hints.candidateAddressEmail}>
            <textarea
              className={styles.textarea}
              style={{ minHeight: 56 }}
              value={values.candidateAddressEmail}
              onChange={(e) => set({ candidateAddressEmail: e.target.value })}
              placeholder="Mailing address and/or email for the letter"
            />
          </Field>
        </div>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Role details</h4>
        <div className={styles.grid2}>
          <Field label="Job title / designation" required hint={hints.jobTitle}>
            <input
              className={styles.input}
              value={values.jobTitle}
              onChange={(e) => set({ jobTitle: e.target.value })}
            />
          </Field>
          <Field label="Department" required hint={hints.departmentId}>
            <select
              className={styles.select}
              value={values.departmentId}
              onChange={(e) => set({ departmentId: e.target.value })}
            >
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reporting manager" hint={hints.reportingManagerEmployeeId}>
            <select
              className={styles.select}
              value={values.reportingManagerEmployeeId}
              onChange={(e) => set({ reportingManagerEmployeeId: e.target.value })}
            >
              <option value="">— Select manager (optional) —</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name} ({m.employee_code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Employment type" required>
            <select
              className={styles.select}
              value={values.employmentType}
              onChange={(e) => set({ employmentType: e.target.value as EmploymentType })}
            >
              <option value="full_time">Full-time</option>
              <option value="contract">Contract</option>
              <option value="part_time">Part-time</option>
            </select>
          </Field>
          <Field label="Work location / mode" required>
            <select
              className={styles.select}
              value={values.workMode}
              onChange={(e) => set({ workMode: e.target.value as WorkMode })}
            >
              <option value="onsite">Onsite</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </Field>
        </div>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Compensation</h4>
        <div className={styles.grid2}>
          <Field label="Annual CTC / gross salary" required>
            <input
              className={styles.input}
              value={values.annualCtc}
              onChange={(e) => set({ annualCtc: e.target.value })}
              placeholder="e.g. INR 18,00,000 or USD 120,000"
            />
          </Field>
          <Field label="Fixed vs variable split" required>
            <input
              className={styles.input}
              value={values.fixedVariableSplit}
              onChange={(e) => set({ fixedVariableSplit: e.target.value })}
            />
          </Field>
          <Field label="Pay frequency" required>
            <select
              className={styles.select}
              value={values.payFrequency}
              onChange={(e) => set({ payFrequency: e.target.value as PayFrequency })}
            >
              <option value="monthly">Monthly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="weekly">Weekly</option>
            </select>
          </Field>
          <Field label="Bonus / incentive structure" full>
            <textarea
              className={styles.textarea}
              value={values.bonusIncentive}
              onChange={(e) => set({ bonusIncentive: e.target.value })}
              placeholder="Performance bonus, sales incentive, etc."
            />
          </Field>
          <Field label="Stock / ESOP grant (if applicable)" full>
            <textarea
              className={styles.textarea}
              value={values.stockEsop}
              onChange={(e) => set({ stockEsop: e.target.value })}
              placeholder="Units, vesting schedule, or N/A"
            />
          </Field>
        </div>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Joining & terms</h4>
        <div className={styles.grid2}>
          <Field label="Date of joining" required hint={hints.dateOfJoining}>
            <input
              className={styles.input}
              type="date"
              value={values.dateOfJoining}
              onChange={(e) => set({ dateOfJoining: e.target.value })}
            />
          </Field>
          <Field label="Offer expiry / acceptance deadline" required>
            <input
              className={styles.input}
              type="date"
              value={values.offerExpiry}
              onChange={(e) => set({ offerExpiry: e.target.value })}
            />
          </Field>
          <Field label="Probation period & duration" required full>
            <input
              className={styles.input}
              value={values.probation}
              onChange={(e) => set({ probation: e.target.value })}
            />
          </Field>
          <Field label="Notice period (during & post probation)" required full>
            <textarea
              className={styles.textarea}
              value={values.noticePeriod}
              onChange={(e) => set({ noticePeriod: e.target.value })}
            />
          </Field>
        </div>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Conditions & compliance</h4>
        <div className={styles.grid2}>
          <Field label="Background verification clause" required full>
            <textarea
              className={styles.textarea}
              value={values.backgroundVerification}
              onChange={(e) => set({ backgroundVerification: e.target.value })}
            />
          </Field>
          <Field label="Confidentiality / NDA reference" full>
            <textarea
              className={styles.textarea}
              value={values.confidentialityNda}
              onChange={(e) => set({ confidentialityNda: e.target.value })}
              placeholder="Reference to employee confidentiality agreement if applicable"
            />
          </Field>
          <Field label="Non-compete / moonlighting policy" full>
            <textarea
              className={styles.textarea}
              value={values.nonCompete}
              onChange={(e) => set({ nonCompete: e.target.value })}
            />
          </Field>
          <Field label="Documents to be submitted on joining" full>
            <textarea
              className={styles.textarea}
              value={values.documentsOnJoining}
              onChange={(e) => set({ documentsOnJoining: e.target.value })}
            />
          </Field>
        </div>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Sign-off</h4>
        <div className={styles.grid2}>
          <Field label="Company name (letterhead)" required hint={hints.companyName}>
            <input
              className={styles.input}
              value={values.companyName}
              onChange={(e) => set({ companyName: e.target.value })}
            />
          </Field>
          <Field label="Logo & seal on document" required>
            <div className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={values.includeLogoSeal}
                onChange={(e) => set({ includeLogoSeal: e.target.checked })}
                id="offer-logo-seal"
              />
              <label htmlFor="offer-logo-seal" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                Include company logo and authorized signatory seal block on the offer PDF / letter.
              </label>
            </div>
            {companyLogoUrl ? (
              <div style={{ marginTop: 8 }}>
                <span className={styles.hint}>Current logo preview (from company profile):</span>
                <div>
                  <img src={companyLogoUrl} alt="" className={styles.logoThumb} />
                </div>
              </div>
            ) : (
              <span className={styles.hint}>No logo uploaded yet — upload under company branding if needed.</span>
            )}
          </Field>
          <Field label="Candidate acceptance / signature line" required full>
            <textarea
              className={styles.textarea}
              value={values.candidateSignatureLine}
              onChange={(e) => set({ candidateSignatureLine: e.target.value })}
            />
          </Field>
        </div>
      </section>
    </div>
  )
}
