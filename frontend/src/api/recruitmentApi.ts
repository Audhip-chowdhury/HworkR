import { apiFetch } from './client'
import { companyPath } from './paths'
import type { Requisition } from './types'

export type JobPosting = {
  id: string
  requisition_id: string
  company_id: string
  title: string
  description: string | null
  requirements: string | null
  deadline: string | null
  status: string
  created_at: string
  updated_at: string
}

export type Application = {
  id: string
  posting_id: string
  company_id: string
  candidate_user_id: string
  resume_url: string | null
  status: string
  stage: string
  notes: string | null
  applied_at: string
  updated_at: string
  posting_title?: string | null
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

export function listRequisitions(companyId: string) {
  return apiFetch<Requisition[]>(companyPath(companyId, '/recruitment/requisitions'))
}

export function createRequisition(
  companyId: string,
  body: {
    department_id?: string | null
    job_id?: string | null
    headcount: number
    hiring_criteria_json?: Record<string, unknown> | null
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

export function listPostings(companyId: string) {
  return apiFetch<JobPosting[]>(companyPath(companyId, '/recruitment/postings'))
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

export function listApplications(companyId: string, stage?: string) {
  const qs = stage ? `?stage=${encodeURIComponent(stage)}` : ''
  return apiFetch<Application[]>(companyPath(companyId, `/recruitment/applications${qs}`))
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
