import { apiFetch } from './client'
import { companyPath } from './paths'
import type { HiringCriteria, Requisition } from './types'

export type JobPosting = {
  id: string
  requisition_id: string
  company_id: string
  title: string
  description: string | null
  requirements: string | null
  deadline: string | null
  status: string
  /** Marked as posted to external boards (HR list includes this; candidate board omits it). */
  posted?: boolean
  /** User-defined reference / listing id (HR only; separate from internal UUID). */
  posting_ref?: string | null
  created_at: string
  updated_at: string
}

export type Application = {
  id: string
  posting_id: string
  company_id: string
  candidate_user_id: string
  candidate_name?: string | null
  resume_url: string | null
  status: string
  stage: string
  notes: string | null
  applied_at: string
  updated_at: string
  posting_title?: string | null
  job_grade?: string | null
}

export type Interview = {
  id: string
  application_id: string
  company_id: string
  scheduled_at: string | null
  panel_json: unknown
  format: string | null
  feedback_json: unknown
  status: string
  created_at: string
  updated_at: string
}

export type InterviewCalendarItem = Interview & {
  posting_title?: string | null
  candidate_name?: string | null
}

export type Offer = {
  id: string
  application_id: string
  company_id: string
  compensation_json: Record<string, unknown> | null
  start_date: string | null
  status: string
  sent_at: string
  responded_at: string | null
  posting_title?: string | null
}

export type ApplicationActivity = {
  id: string
  timestamp: string
  application_id: string
  posting_id: string
  posting_title?: string | null
  candidate_user_id: string
  candidate_name?: string | null
  actor_user_id?: string | null
  actor_name?: string | null
  action: string
  previous_stage?: string | null
  previous_status?: string | null
  stage?: string | null
  status?: string | null
  via?: string | null
}

export function listRequisitions(companyId: string) {
  return apiFetch<Requisition[]>(companyPath(companyId, '/recruitment/requisitions'))
}

export function createRequisition(
  companyId: string,
  body: {
    department_id?: string | null
    job_id?: string | null
    headcount: number
    hiring_criteria?: HiringCriteria | null
    approval_chain_json?: Record<string, unknown> | null
  },
) {
  return apiFetch<Requisition>(companyPath(companyId, '/recruitment/requisitions'), {
    method: 'POST',
    json: body,
  })
}

export function patchRequisition(companyId: string, requisitionId: string, body: { status?: string }) {
  return apiFetch<Requisition>(
    companyPath(companyId, `/recruitment/requisitions/${requisitionId}`),
    { method: 'PATCH', json: body },
  )
}

export function listPostings(
  companyId: string,
  params?: { status?: string; posted?: 'true' | 'false'; search?: string },
) {
  const q = new URLSearchParams()
  if (params?.status) q.set('status', params.status)
  if (params?.posted) q.set('posted', params.posted)
  if (params?.search?.trim()) q.set('search', params.search.trim())
  const qs = q.toString()
  return apiFetch<JobPosting[]>(companyPath(companyId, `/recruitment/postings${qs ? `?${qs}` : ''}`))
}

export function patchPosting(
  companyId: string,
  postingId: string,
  body: Partial<{
    title: string
    description: string | null
    requirements: string | null
    deadline: string | null
    status: string
    posted: boolean
    posting_ref: string | null
  }>,
) {
  return apiFetch<JobPosting>(companyPath(companyId, `/recruitment/postings/${postingId}`), {
    method: 'PATCH',
    json: body,
  })
}

export function createPosting(
  companyId: string,
  body: { requisition_id: string; title: string; description?: string; requirements?: string; deadline?: string },
) {
  return apiFetch<JobPosting>(companyPath(companyId, '/recruitment/postings'), {
    method: 'POST',
    json: body,
  })
}

/** Public apply: globally unique `req_code` (6 chars). No company id in URL. */
export function publicApplyByReqCode(
  reqCode: string,
  body: { email: string; password: string; name: string; resume_url?: string | null },
) {
  return apiFetch<{ application: Application; access_token: string; token_type: string }>(
    `/recruitment/public-apply/${encodeURIComponent(reqCode)}`,
    { method: 'POST', json: body },
  )
}

export function listApplications(companyId: string, stage?: string) {
  const qs = stage ? `?stage=${encodeURIComponent(stage)}` : ''
  return apiFetch<Application[]>(companyPath(companyId, `/recruitment/applications${qs}`))
}

export function listApplicationActivity(
  companyId: string,
  params?: {
    posting_id?: string
    candidate_user_id?: string
    application_id?: string
    action?: string
    date_from?: string
    date_to?: string
    from_stage?: string
    to_stage?: string
    limit?: number
  },
) {
  const sp = new URLSearchParams()
  if (params?.posting_id) sp.set('posting_id', params.posting_id)
  if (params?.candidate_user_id) sp.set('candidate_user_id', params.candidate_user_id)
  if (params?.application_id) sp.set('application_id', params.application_id)
  if (params?.action) sp.set('action', params.action)
  if (params?.date_from) sp.set('date_from', params.date_from)
  if (params?.date_to) sp.set('date_to', params.date_to)
  if (params?.from_stage) sp.set('from_stage', params.from_stage)
  if (params?.to_stage) sp.set('to_stage', params.to_stage)
  if (params?.limit != null) sp.set('limit', String(params.limit))
  const qs = sp.toString() ? `?${sp.toString()}` : ''
  return apiFetch<ApplicationActivity[]>(companyPath(companyId, `/recruitment/application-activity${qs}`))
}

export function updateApplicationStage(
  companyId: string,
  applicationId: string,
  body: { stage: string; status?: string; notes?: string | null },
) {
  return apiFetch<Application>(companyPath(companyId, `/recruitment/applications/${applicationId}/stage`), {
    method: 'PATCH',
    json: body,
  })
}

export function listInterviews(companyId: string, applicationId: string) {
  return apiFetch<Interview[]>(
    companyPath(companyId, `/recruitment/applications/${applicationId}/interviews`),
  )
}

export function listCompanyInterviews(
  companyId: string,
  params?: { date_from?: string; date_to?: string },
) {
  const sp = new URLSearchParams()
  if (params?.date_from) sp.set('date_from', params.date_from)
  if (params?.date_to) sp.set('date_to', params.date_to)
  const qs = sp.toString() ? `?${sp.toString()}` : ''
  return apiFetch<InterviewCalendarItem[]>(companyPath(companyId, `/recruitment/interviews${qs}`))
}

export function createInterview(
  companyId: string,
  applicationId: string,
  body: { scheduled_at?: string; panel_json?: unknown; format?: string; feedback_json?: unknown; status?: string },
) {
  return apiFetch<Interview>(
    companyPath(companyId, `/recruitment/applications/${applicationId}/interviews`),
    { method: 'POST', json: body },
  )
}

export function updateInterview(
  companyId: string,
  interviewId: string,
  body: { scheduled_at?: string | null; panel_json?: unknown; format?: string; feedback_json?: unknown; status?: string },
) {
  return apiFetch<Interview>(
    companyPath(companyId, `/recruitment/interviews/${interviewId}`),
    { method: 'PATCH', json: body },
  )
}

export function listOffers(companyId: string) {
  return apiFetch<Offer[]>(companyPath(companyId, '/recruitment/offers'))
}

export function createOffer(
  companyId: string,
  body: { application_id: string; compensation_json?: Record<string, unknown> | null; start_date?: string | null },
) {
  return apiFetch<Offer>(companyPath(companyId, '/recruitment/offers'), {
    method: 'POST',
    json: body,
  })
}

export function listCandidateOpenPostings(companyId: string) {
  return apiFetch<JobPosting[]>(companyPath(companyId, '/recruitment/candidate/open-postings'))
}

export function applyToPosting(
  companyId: string,
  body: { posting_id: string; candidate_user_id: string; resume_url?: string | null },
) {
  return apiFetch<Application>(companyPath(companyId, '/recruitment/applications'), {
    method: 'POST',
    json: body,
  })
}

export function listMyApplications(companyId: string) {
  return apiFetch<Application[]>(companyPath(companyId, '/recruitment/candidate/my-applications'))
}

export function listMyOffers(companyId: string) {
  return apiFetch<Offer[]>(companyPath(companyId, '/recruitment/candidate/my-offers'))
}

export function respondToOffer(companyId: string, offerId: string, status: 'accepted' | 'declined' | 'negotiating') {
  return apiFetch<Offer>(companyPath(companyId, `/recruitment/offers/${offerId}/respond`), {
    method: 'PATCH',
    json: { status },
  })
}
