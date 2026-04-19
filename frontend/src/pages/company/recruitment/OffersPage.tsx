import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { apiFetch } from '../../../api/client'
import { listEmployeeSummaries, type EmployeeSummary } from '../../../api/employeesApi'
import {
  type Application,
  createOffer,
  listApplications,
  listOffers,
  listPostings,
  listRequisitions,
  type JobPosting,
  type Offer,
} from '../../../api/recruitmentApi'
import type { Requisition } from '../../../api/types'
import { useAuth } from '../../../auth/AuthContext'
import {
  defaultOfferLetterValues,
  OfferLetterForm,
  type OfferLetterFormValues,
} from './OfferLetterForm'
import styles from '../CompanyWorkspacePage.module.css'
import offerStyles from './OfferLetterForm.module.css'

function letterDateToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function resolveDepartmentIdForApplication(
  app: Application | undefined,
  postings: JobPosting[],
  requisitions: Requisition[],
): string | null {
  if (!app) return null
  const posting = postings.find((p) => p.id === app.posting_id)
  if (!posting) return null
  const req = requisitions.find((r) => r.id === posting.requisition_id)
  return req?.department_id ?? null
}

function buildCompensationJson(
  values: OfferLetterFormValues,
  meta: {
    application_id: string
    department_name: string | null
    reporting_manager_name: string | null
    job_grade: string | null
  },
): Record<string, unknown> {
  return {
    schema_version: 1,
    offer_letter: {
      candidate: {
        full_name: values.candidateFullName.trim(),
        letter_date: values.letterDate,
        address_or_email: values.candidateAddressEmail.trim() || null,
      },
      role: {
        job_title: values.jobTitle.trim(),
        department_id: values.departmentId || null,
        department_name: meta.department_name,
        reporting_manager_employee_id: values.reportingManagerEmployeeId || null,
        reporting_manager_name: meta.reporting_manager_name,
        employment_type: values.employmentType,
        work_location_mode: values.workMode,
      },
      compensation: {
        annual_ctc: values.annualCtc.trim(),
        fixed_variable_split: values.fixedVariableSplit.trim(),
        pay_frequency: values.payFrequency,
        bonus_incentive: values.bonusIncentive.trim() || null,
        stock_esop: values.stockEsop.trim() || null,
      },
      joining: {
        date_of_joining: values.dateOfJoining,
        offer_expiry: values.offerExpiry,
        probation: values.probation.trim(),
        notice_period: values.noticePeriod.trim(),
      },
      compliance: {
        background_verification: values.backgroundVerification.trim(),
        confidentiality_nda: values.confidentialityNda.trim() || null,
        non_compete: values.nonCompete.trim() || null,
        documents_on_joining: values.documentsOnJoining.trim() || null,
      },
      signoff: {
        company_name: values.companyName.trim(),
        include_logo_seal: values.includeLogoSeal,
        candidate_signature_line: values.candidateSignatureLine.trim(),
      },
    },
    prefill: {
      application_id: meta.application_id,
      job_grade: meta.job_grade,
    },
  }
}

function applicationsEligibleForOffer(
  applications: Application[],
  offerRows: { application_id: string }[],
): Application[] {
  const offered = new Set(offerRows.map((x) => x.application_id))
  return applications.filter((ap) => !offered.has(ap.id))
}

function validateOfferLetter(v: OfferLetterFormValues): string | null {
  if (!v.candidateFullName.trim()) return 'Candidate full name is required.'
  if (!v.letterDate) return 'Date of the letter is required.'
  if (!v.jobTitle.trim()) return 'Job title is required.'
  if (!v.departmentId) return 'Department is required.'
  if (!v.annualCtc.trim()) return 'Annual CTC is required.'
  if (!v.fixedVariableSplit.trim()) return 'Fixed vs variable split is required.'
  if (!v.dateOfJoining) return 'Date of joining is required.'
  if (!v.offerExpiry) return 'Offer expiry / acceptance deadline is required.'
  if (!v.probation.trim()) return 'Probation details are required.'
  if (!v.noticePeriod.trim()) return 'Notice period is required.'
  if (!v.backgroundVerification.trim()) return 'Background verification clause is required.'
  if (!v.companyName.trim()) return 'Company name is required.'
  if (!v.candidateSignatureLine.trim()) return 'Candidate acceptance / signature line is required.'
  return null
}

export function OffersPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const companyRecord = myCompanies.find((c) => c.company.id === companyId)?.company

  const [apps, setApps] = useState<Application[]>([])
  const [offers, setOffers] = useState<any[]>([])
  const [postings, setPostings] = useState<JobPosting[]>([])
  const [requisitions, setRequisitions] = useState<Requisition[]>([])
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([])
  const [managers, setManagers] = useState<EmployeeSummary[]>([])

  const [applicationId, setApplicationId] = useState('')
  const [letter, setLetter] = useState<OfferLetterFormValues>(() => defaultOfferLetterValues(letterDateToday()))

  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const syncLetter = useCallback((patch: Partial<OfferLetterFormValues>) => {
    setLetter((prev) => ({ ...prev, ...patch }))
  }, [])

  const prevAppId = useRef('')

  async function refresh(): Promise<{ apps: Application[]; offers: Offer[] } | undefined> {
    if (!companyId) return undefined
    setLoading(true)
    setError(null)
    try {
      const [a, o, p, r, d, m] = await Promise.all([
        listApplications(companyId),
        listOffers(companyId),
        listPostings(companyId),
        listRequisitions(companyId),
        apiFetch<Array<{ id: string; name: string }>>(`/companies/${companyId}/departments`),
        listEmployeeSummaries(companyId),
      ])
      setApps(a)
      setOffers(o)
      setPostings(p)
      setRequisitions(r)
      setDepartments(d)
      setManagers(m)
      const eligible = applicationsEligibleForOffer(a, o)
      setApplicationId((cur) => {
        if (cur && eligible.some((e) => e.id === cur)) return cur
        return eligible[0]?.id ?? ''
      })
      return { apps: a, offers: o }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load offers')
      return undefined
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [companyId])

  useEffect(() => {
    prevAppId.current = ''
  }, [companyId])

  useEffect(() => {
    const name = companyRecord?.name?.trim() ?? ''
    if (name) syncLetter({ companyName: name })
  }, [companyRecord?.name, syncLetter])

  useEffect(() => {
    if (!applicationId) return
    const app = apps.find((x) => x.id === applicationId)
    if (!app) return
    const deptId = resolveDepartmentIdForApplication(app, postings, requisitions)

    if (prevAppId.current !== applicationId) {
      prevAppId.current = applicationId
      const base = defaultOfferLetterValues(letterDateToday())
      setLetter({
        ...base,
        companyName: companyRecord?.name?.trim() || base.companyName,
        candidateFullName: app.candidate_name?.trim() || '',
        jobTitle: app.posting_title?.trim() || '',
        departmentId: deptId ?? '',
      })
      return
    }

    if (deptId) {
      setLetter((prev) => (prev.departmentId ? prev : { ...prev, departmentId: deptId }))
    }
  }, [applicationId, apps, postings, requisitions, departments, companyRecord?.name])

  const hints = useMemo(() => {
    const app = apps.find((x) => x.id === applicationId)
    const h: Partial<Record<keyof OfferLetterFormValues, string>> = {}
    if (app?.candidate_name?.trim()) h.candidateFullName = 'Pre-filled from candidate profile'
    if (app?.posting_title?.trim()) h.jobTitle = 'Pre-filled from job posting title'
    const deptId = resolveDepartmentIdForApplication(app, postings, requisitions)
    if (deptId && departments.some((d) => d.id === deptId)) {
      h.departmentId = 'Pre-filled from requisition / posting'
    }
    if (companyRecord?.name) h.companyName = 'Pre-filled from your company profile'
    h.candidateAddressEmail = 'Add if not already on file; used on the letter header'
    h.reportingManagerEmployeeId = 'Choose from active employees'
    h.dateOfJoining = 'Also stored as official start date on the offer record'
    return h
  }, [applicationId, apps, postings, requisitions, departments, companyRecord?.name])

  const eligibleApps = useMemo(
    () => applicationsEligibleForOffer(apps, offers),
    [apps, offers],
  )

  async function onCreate() {
    if (!companyId || !applicationId) return
    const err = validateOfferLetter(letter)
    if (err) {
      setError(err)
      return
    }
    const app = apps.find((a) => a.id === applicationId)
    const deptName = letter.departmentId
      ? departments.find((d) => d.id === letter.departmentId)?.name ?? null
      : null
    const mgr = letter.reportingManagerEmployeeId
      ? managers.find((m) => m.id === letter.reportingManagerEmployeeId)
      : null
    setPending(true)
    setError(null)
    try {
      const compensation = buildCompensationJson(letter, {
        application_id: applicationId,
        department_name: deptName,
        reporting_manager_name: mgr?.display_name ?? null,
        job_grade: app?.job_grade ?? null,
      })
      await createOffer(companyId, {
        application_id: applicationId,
        start_date: letter.dateOfJoining || null,
        compensation_json: compensation,
      })
      const refreshed = await refresh()
      prevAppId.current = ''
      if (refreshed) {
        const eligible = applicationsEligibleForOffer(refreshed.apps, refreshed.offers)
        if (eligible.length === 0) {
          const today = letterDateToday()
          setLetter({
            ...defaultOfferLetterValues(today),
            companyName: companyRecord?.name?.trim() || '',
          })
        }
      }
      toast.success(
        'Offer sent successfully. The candidate can review it in their portal; you can track status below.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create offer')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.moduleNav}>
        <Link className={styles.moduleNavBtn} to={`/company/${companyId}/recruitment`}>
          Back to Recruitment
        </Link>
      </div>
      <h3 className={styles.h3}>Offers</h3>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={offerStyles.wrap} style={{ marginBottom: '1.25rem' }}>
        <label className={offerStyles.label} style={{ display: 'block', marginBottom: 6 }}>
          <span className={offerStyles.req}>* </span>
          Application
        </label>
        <select
          className={offerStyles.select}
          style={{ maxWidth: 'min(100%, 520px)' }}
          value={applicationId}
          onChange={(e) => setApplicationId(e.target.value)}
        >
          <option value="">Select application</option>
          {eligibleApps.map((a) => (
            <option key={a.id} value={a.id}>
              {(a.posting_title ?? a.id.slice(0, 8))} · Candidate:{' '}
              {a.candidate_name ?? `${a.candidate_user_id.slice(0, 8)}…`}
            </option>
          ))}
        </select>
        {applicationId ? (
          <p className={offerStyles.hint} style={{ marginTop: 8 }}>
            Job grade (from catalog):{' '}
            <strong>{apps.find((a) => a.id === applicationId)?.job_grade ?? '—'}</strong>
          </p>
        ) : null}
      </div>

      <OfferLetterForm
        values={letter}
        onChange={syncLetter}
        departments={departments}
        managers={managers}
        hints={hints}
        companyLogoUrl={companyRecord?.logo_url ?? null}
      />

      <div style={{ marginTop: '1rem' }}>
        <button className={styles.btnSm} disabled={pending || !applicationId} onClick={() => void onCreate()}>
          {pending ? 'Creating…' : 'Create offer'}
        </button>
      </div>

      {loading ? <p className={styles.muted}>Loading offers…</p> : null}
      {!loading && offers.length === 0 ? <p className={styles.muted}>No offers yet.</p> : null}
      {offers.map((o) => (
        <p key={o.id} className={styles.muted}>
          {o.status} · {o.posting_title ?? o.application_id.slice(0, 8)}
        </p>
      ))}
    </section>
  )
}
