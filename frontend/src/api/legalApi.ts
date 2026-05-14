import { apiFetch } from './client'
import { companyPath } from './paths'

export type LegalCitation = {
  act: string | null
  section: string | null
  source_doc: string | null
  excerpt: string | null
}

export type LegalChatResponse = {
  answer: string
  citations: LegalCitation[]
  region: string
}

export type LegalChatRequest = {
  message: string
  region?: string | null
}

export function postLegalChat(companyId: string, body: LegalChatRequest) {
  return apiFetch<LegalChatResponse>(companyPath(companyId, '/legal/chat'), {
    method: 'POST',
    json: body,
  })
}
