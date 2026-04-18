/** Shared DTO shapes aligned with backend JSON responses. */

export type DomainEventEnvelope = {
  event_type: string
  occurred_at: string
  company_id: string
  entity_type: string | null
  entity_id: string | null
  actor_user_id: string | null
  data: Record<string, unknown>
}

export type WorkflowTemplate = {
  id: string
  company_id: string
  name: string
  module: string
  steps_json: unknown
  conditions_json: Record<string, unknown> | null
  created_at: string
}

export type WorkflowInstance = {
  id: string
  template_id: string
  company_id: string
  entity_type: string
  entity_id: string
  current_step: number
  status: string
  initiated_by: string | null
  initiated_at: string
}

export type WorkflowAction = {
  id: string
  instance_id: string
  step: number
  actor_id: string | null
  action: string
  comments: string | null
  acted_at: string
}

export type WebhookSubscription = {
  id: string
  company_id: string
  url: string
  secret: string
  events_json: string[] | null
  is_active: boolean
  created_at: string
}

export type ScenarioRun = {
  id: string
  company_id: string
  config_json: Record<string, unknown> | null
  status: string
  result_json: { created?: Record<string, string> } | null
  created_by: string | null
  created_at: string
  notes: string | null
}

export type SsoProviderInfo = {
  id: string
  name: string
  status: string
}

export type OidcAuthorizeStubResponse = {
  message: string
  authorization_url_template: string
  required_env: string[]
}

export type ActivityLog = {
  id: string
  company_id: string
  user_id: string
  role: string | null
  module: string
  action_type: string
  action_detail: string | null
  entity_type: string | null
  entity_id: string | null
  started_at: string | null
  completed_at: string | null
  duration_seconds: number | null
  quality_score: number | null
  quality_factors_json: Record<string, number> | null
  context_json: Record<string, unknown> | null
  session_id: string | null
  created_at: string
}

export type ScoreDashboard = {
  overall_score: number | null
  avg_completeness: number | null
  avg_accuracy: number | null
  avg_timeliness: number | null
  avg_process_adherence: number | null
  action_count: number
}

export type ScoringRule = {
  id: string
  company_id: string
  module: string
  action_type: string
  sla_seconds: number | null
  weight_completeness: number
  weight_accuracy: number
  weight_timeliness: number
  weight_process: number
  criteria_json: Record<string, unknown> | null
  created_at: string
}

export type CertTrack = {
  id: string
  company_id: string
  role_type: string
  level: string
  name: string
  requirements_json: Record<string, unknown> | null
  min_score: number
  created_at: string
}

export type CertProgress = {
  id: string
  track_id: string
  company_id: string
  user_id: string
  completed_actions_json: Record<string, unknown>
  current_score: number | null
  status: string
  started_at: string | null
  updated_at: string
}

export type Certificate = {
  id: string
  track_id: string
  company_id: string
  user_id: string
  level: string
  score: number
  breakdown_json: Record<string, unknown> | null
  issued_at: string
  verification_id: string
}

export type ProgressDimension = {
  completeness: number | null
  accuracy: number | null
  timeliness: number | null
  process_adherence: number | null
}

export type ProgressModule = {
  module: string
  label: string
  action_count: number
  avg_score: number | null
}

export type ProgressRecentAction = {
  id: string
  occurred_at: string
  module: string
  action_type: string
  action_detail: string | null
  score: number | null
}

export type CertificationProgressDashboard = {
  overall_score: number | null
  action_count: number
  dimension_averages: ProgressDimension
  module_breakdown: ProgressModule[]
  required_actions_total: number
  required_actions_completed: number
  missing_required_actions: string[]
  critical_failure_count: number
  status: string
  recent_actions: ProgressRecentAction[]
}

export type HiringCriteria = {
  skills: string[]
  experience: string | null
  education: string | null
}

export type Requisition = {
  id: string
  company_id: string
  created_by: string
  department_id: string | null
  job_id: string | null
  /** Short alphanumeric id for display (6 chars). */
  req_code?: string | null
  headcount: number
  status: string
  hiring_criteria: HiringCriteria | null
  approval_chain_json: Record<string, unknown> | null
  created_at: string
  updated_at: string
}
