import { apiFetch } from './client'
import { companyPath } from './paths'
import type { Certificate, CertProgress, CertTrack } from './types'

export function listCertTracks(companyId: string) {
  return apiFetch<CertTrack[]>(companyPath(companyId, '/certification/tracks'))
}

export function createCertTrack(
  companyId: string,
  body: {
    role_type: string
    level: string
    name: string
    requirements_json?: Record<string, unknown> | null
    min_score?: number
  },
) {
  return apiFetch<CertTrack>(companyPath(companyId, '/certification/tracks'), {
    method: 'POST',
    json: body,
  })
}

export function getMyCertProgress(companyId: string, trackId: string) {
  return apiFetch<CertProgress>(
    companyPath(companyId, `/certification/progress/me?track_id=${encodeURIComponent(trackId)}`),
  )
}

export function upsertMyCertProgress(
  companyId: string,
  trackId: string,
  body: {
    completed_actions_json?: Record<string, unknown>
    current_score?: number | null
    status?: string | null
  },
) {
  const q = `?track_id=${encodeURIComponent(trackId)}`
  return apiFetch<CertProgress>(companyPath(companyId, `/certification/progress/me${q}`), {
    method: 'PUT',
    json: body,
  })
}

export function issueCertificate(
  companyId: string,
  body: {
    track_id: string
    level: string
    score: number
    breakdown_json?: Record<string, unknown> | null
    target_user_id?: string | null
  },
) {
  return apiFetch<Certificate>(companyPath(companyId, '/certification/certificates/issue'), {
    method: 'POST',
    json: body,
  })
}

export function listMyCertificates(companyId: string) {
  return apiFetch<Certificate[]>(companyPath(companyId, '/certification/certificates/me'))
}
