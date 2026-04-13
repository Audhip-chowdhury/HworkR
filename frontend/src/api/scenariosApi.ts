import { apiFetch } from './client'
import { companyPath } from './paths'
import type { ScenarioRun } from './types'

export function generateScenario(
  companyId: string,
  body: {
    create_leave_request?: boolean
    create_job_application?: boolean
    posting_id?: string | null
    candidate_user_id?: string | null
    create_inbox_task_for_hr?: boolean
    notes?: string | null
  },
) {
  return apiFetch<ScenarioRun>(companyPath(companyId, '/scenarios/generate'), {
    method: 'POST',
    json: body,
  })
}
