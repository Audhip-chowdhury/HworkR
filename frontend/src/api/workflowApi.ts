import { apiFetch } from './client'
import { companyPath } from './paths'
import type { WorkflowAction, WorkflowInstance, WorkflowTemplate } from './types'

export function listWorkflowTemplates(companyId: string) {
  return apiFetch<WorkflowTemplate[]>(companyPath(companyId, '/workflow-templates'))
}

export function listWorkflowInstances(
  companyId: string,
  params?: { entity_type?: string; entity_id?: string; status_filter?: string },
) {
  const q = new URLSearchParams()
  if (params?.entity_type) q.set('entity_type', params.entity_type)
  if (params?.entity_id) q.set('entity_id', params.entity_id)
  if (params?.status_filter) q.set('status_filter', params.status_filter)
  const qs = q.toString()
  const path = companyPath(companyId, '/workflow-instances') + (qs ? `?${qs}` : '')
  return apiFetch<WorkflowInstance[]>(path)
}

export function startWorkflowInstance(
  companyId: string,
  body: { template_id: string; entity_type: string; entity_id: string },
) {
  return apiFetch<WorkflowInstance>(companyPath(companyId, '/workflow-instances'), {
    method: 'POST',
    json: body,
  })
}

export function applyWorkflowAction(
  companyId: string,
  instanceId: string,
  body: { action: 'approve' | 'reject'; comments?: string | null },
) {
  return apiFetch<WorkflowInstance>(
    companyPath(companyId, `/workflow-instances/${instanceId}/actions`),
    { method: 'POST', json: body },
  )
}

export function listWorkflowInstanceActions(companyId: string, instanceId: string) {
  return apiFetch<WorkflowAction[]>(
    companyPath(companyId, `/workflow-instances/${instanceId}/actions`),
  )
}
