import { apiFetch } from './client'
import { companyPath } from './paths'

export type ReviewCycle = {
  id: string
  company_id: string
  name: string
  type: string | null
  start_date: string | null
  end_date: string | null
  goals_deadline: string | null
  status: string
  created_at: string
}

export type Goal = {
  id: string
  company_id: string
  employee_id: string
  cycle_id: string | null
  kpi_definition_id: string | null
  title: string
  description: string | null
  target: string | null
  actual_achievement: string | null
  manager_rating: number | null
  manager_comment: string | null
  progress: number
  status: string
  created_at: string
  updated_at: string
}

export type Assessment = {
  id: string
  company_id: string
  employee_id: string
  cycle_id: string | null
  type: string
  assessor_id: string | null
  ratings_json: Record<string, unknown> | null
  comments: string | null
  submitted_at: string | null
  created_at: string
}

export type Pip = {
  id: string
  company_id: string
  employee_id: string
  reason: string | null
  plan_json: Record<string, unknown> | null
  start_date: string | null
  end_date: string | null
  status: string
  created_at: string
}

export type Course = {
  id: string
  company_id: string
  title: string
  category: string | null
  duration: string | null
  prerequisites_json: unknown
  content_url: string | null
  mandatory: boolean
  points: number
  due_date: string | null
  created_at: string
}

export type TrainingAssignment = {
  id: string
  company_id: string
  employee_id: string
  course_id: string
  assigned_by: string | null
  due_date: string | null
  status: string
  created_at: string
}

export type TrainingAssignmentEnriched = {
  id: string
  company_id: string
  employee_id: string
  course_id: string
  assigned_by: string | null
  due_date: string | null
  status: string
  created_at: string
  course_title: string
  course_points: number
  youtube_url: string | null
  completion_score: number | null
  completed_at: string | null
  display_status: string
  overdue_before_due: boolean
}

export type CourseEmployeeScoreRow = {
  employee_id: string
  employee_code: string | null
  display_name: string
  score: number
  status_label: string
  overdue_before_due: boolean
  didnt_attend: boolean
}

export type LearningEmployeeSuggestion = {
  employee_id: string
  label: string
}

export type TrainingCompletion = {
  id: string
  assignment_id: string
  company_id: string
  completed_at: string
  score: number | null
  certificate_url: string | null
}

export type SkillProfile = {
  id: string
  company_id: string
  employee_id: string
  skills_json: Record<string, unknown> | null
  updated_at: string
}

export type ReviewCycleKpiDefinitionIn = {
  goal_key: string
  goal_description: string
  category?: string | null
  weight_percent?: number | null
}

export type ReviewCycleKpiDefinition = {
  id: string
  company_id: string
  review_cycle_id: string
  goal_key: string
  goal_description: string
  category: string | null
  weight_percent: number | null
  created_at: string
  updated_at: string
}

export type ReviewCycleCreate = {
  name: string
  type?: string | null
  start_date?: string | null
  end_date?: string | null
  goals_deadline?: string | null
  status?: string
  kpi_definitions?: ReviewCycleKpiDefinitionIn[] | null
}

export type GoalCreate = {
  employee_id: string
  cycle_id?: string | null
  title: string
  description?: string | null
  target?: string | null
  progress?: number
  status?: string
}

export type GoalUpdate = Partial<{
  title: string
  description: string | null
  target: string | null
  actual_achievement: string | null
  manager_rating: number | null
  manager_comment: string | null
  progress: number
  status: string
  cycle_id: string | null
}>

export type EmployeeCycleGoalRow = {
  kpi_definition: ReviewCycleKpiDefinition
  goal: Goal
}

export type EmployeeMyCycleGoalsGroup = {
  cycle: ReviewCycle
  rows: EmployeeCycleGoalRow[]
  /** Present when goals for this cycle have been submitted. */
  submitted_at?: string | null
}

export type SubmitMyCycleGoalsPayload = {
  goals: Array<{
    goal_id: string
    description: string
    target: string
    actual_achievement: string
  }>
}

export type SubmitMyCycleGoalsResponse = {
  review_cycle_id: string
  submitted_at: string
  message: string
}

export type PeerReviewCycleCard = {
  cycle: ReviewCycle
  peer_nominations_submitted_at?: string | null
  selected_reviewer_employee_ids: string[]
}

export type SubmitPeerReviewNominationsResponse = {
  review_cycle_id: string
  submitted_at: string
  reviewers_notified: number
}

export type PeerReviewPendingRequest = {
  review_cycle_id: string
  cycle_name: string
  subject_employee_id: string
  subject_display_name: string
  subject_display_email: string
}

export type SubmitPeerReviewFeedbackPayload = {
  subject_employee_id: string
  strengths: string
  improvements: string
  additional_feedback?: string | null
}

export type SubmitPeerReviewFeedbackResponse = {
  review_cycle_id: string
  subject_employee_id: string
  message: string
}

export type AssessmentCreate = {
  employee_id: string
  cycle_id?: string | null
  type: string
  assessor_id?: string | null
  ratings_json?: Record<string, unknown> | null
  comments?: string | null
}

export type PipCreate = {
  employee_id: string
  reason?: string | null
  plan_json?: Record<string, unknown> | null
  start_date?: string | null
  end_date?: string | null
  status?: string
  /** When true, employee receives an in-app notification that they were placed in PIP. */
  notify_employee?: boolean
}

export type PipAtRiskEmployee = {
  employee_id: string
  employee_display_name: string
  employee_display_email: string
  employee_code: string
  avg_manager_rating: number
  manager_rated_goal_count: number
  review_cycle_id: string | null
}

export type CourseCreate = {
  title: string
  category?: string | null
  duration?: string | null
  prerequisites_json?: unknown
  content_url?: string | null
  mandatory?: boolean
  points?: number
  due_date?: string | null
}

export type TrainingAssignmentCreate = {
  employee_id: string
  course_id: string
  due_date?: string | null
  status?: string
}

export type TrainingCompletionCreate = {
  assignment_id: string
  score?: number | null
  certificate_url?: string | null
}

export const listReviewCycles = (companyId: string) =>
  apiFetch<ReviewCycle[]>(companyPath(companyId, '/performance/review-cycles'))
export const createReviewCycle = (companyId: string, body: ReviewCycleCreate) =>
  apiFetch<ReviewCycle>(companyPath(companyId, '/performance/review-cycles'), { method: 'POST', json: body })
export const listReviewCycleKpiDefinitions = (companyId: string, cycleId: string) =>
  apiFetch<ReviewCycleKpiDefinition[]>(
    companyPath(companyId, `/performance/review-cycles/${cycleId}/kpi-definitions`),
  )

export type GoalCycleEmployeeTracking = {
  employee_id: string
  employee_display_name: string
  employee_display_email: string
  employee_code: string
  manager_employee_id: string | null
  manager_display_name: string | null
  goals_submitted: boolean
  goals_submitted_at: string | null
  kpi_goal_count: number
  manager_rated_goal_count: number
  manager_review_status: string
  avg_manager_rating: number | null
  nominated_peer_count: number
  nominated_peer_display_names: string[]
  peer_reviews_received_count: number
  peer_reviewer_display_names: string[]
}

export type GoalCycleTracking = {
  review_cycle: ReviewCycle
  rows: GoalCycleEmployeeTracking[]
}

export const listGoalCycleTracking = (companyId: string, cycleId: string) =>
  apiFetch<GoalCycleTracking>(
    companyPath(companyId, `/performance/review-cycles/${cycleId}/goal-cycle-tracking`),
  )
export const listMyReviewCycleGoals = (companyId: string) =>
  apiFetch<EmployeeMyCycleGoalsGroup[]>(companyPath(companyId, '/performance/my-review-cycle-goals'))

export const submitMyReviewCycleGoals = (companyId: string, cycleId: string, body: SubmitMyCycleGoalsPayload) =>
  apiFetch<SubmitMyCycleGoalsResponse>(
    companyPath(companyId, `/performance/review-cycles/${cycleId}/submit-my-goals`),
    { method: 'POST', json: body },
  )

export const listMyPeerReviewCycles = (companyId: string) =>
  apiFetch<PeerReviewCycleCard[]>(companyPath(companyId, '/performance/my-peer-review-cycles'))

export const listMyPendingPeerFeedbackRequests = (companyId: string) =>
  apiFetch<PeerReviewPendingRequest[]>(companyPath(companyId, '/performance/my-pending-peer-feedback-requests'))

export const submitPeerReviewFeedback = (
  companyId: string,
  cycleId: string,
  body: SubmitPeerReviewFeedbackPayload,
) =>
  apiFetch<SubmitPeerReviewFeedbackResponse>(
    companyPath(companyId, `/performance/review-cycles/${cycleId}/submit-peer-feedback`),
    { method: 'POST', json: body },
  )

export const submitPeerReviewNominations = (
  companyId: string,
  cycleId: string,
  body: { reviewer_employee_ids: string[] },
) =>
  apiFetch<SubmitPeerReviewNominationsResponse>(
    companyPath(companyId, `/performance/review-cycles/${cycleId}/submit-peer-review-nominations`),
    { method: 'POST', json: body },
  )

export const listGoals = (companyId: string, employee_id?: string) =>
  apiFetch<Goal[]>(companyPath(companyId, `/performance/goals${employee_id ? `?employee_id=${encodeURIComponent(employee_id)}` : ''}`))
export const createGoal = (companyId: string, body: GoalCreate) =>
  apiFetch<Goal>(companyPath(companyId, '/performance/goals'), { method: 'POST', json: body })
export const updateGoal = (companyId: string, goalId: string, body: GoalUpdate) =>
  apiFetch<Goal>(companyPath(companyId, `/performance/goals/${goalId}`), { method: 'PATCH', json: body })
export const listAssessments = (companyId: string, employee_id?: string) =>
  apiFetch<Assessment[]>(companyPath(companyId, `/performance/assessments${employee_id ? `?employee_id=${encodeURIComponent(employee_id)}` : ''}`))
export const createAssessment = (companyId: string, body: AssessmentCreate) =>
  apiFetch<Assessment>(companyPath(companyId, '/performance/assessments'), { method: 'POST', json: body })
export const listPips = (companyId: string, employee_id?: string) =>
  apiFetch<Pip[]>(companyPath(companyId, `/performance/pips${employee_id ? `?employee_id=${encodeURIComponent(employee_id)}` : ''}`))
export const listPipAtRiskEmployees = (companyId: string, opts?: { review_cycle_id?: string; rating_below?: number }) => {
  const q = new URLSearchParams()
  if (opts?.review_cycle_id) q.set('review_cycle_id', opts.review_cycle_id)
  if (opts?.rating_below != null) q.set('rating_below', String(opts.rating_below))
  const qs = q.toString()
  return apiFetch<PipAtRiskEmployee[]>(
    companyPath(companyId, `/performance/pips/at-risk-employees${qs ? `?${qs}` : ''}`),
  )
}
export const createPip = (companyId: string, body: PipCreate) =>
  apiFetch<Pip>(companyPath(companyId, '/performance/pips'), { method: 'POST', json: body })
export const listCourses = (companyId: string) =>
  apiFetch<Course[]>(companyPath(companyId, '/learning/courses'))
export const createCourse = (companyId: string, body: CourseCreate) =>
  apiFetch<Course>(companyPath(companyId, '/learning/courses'), { method: 'POST', json: body })
export const listAssignments = (companyId: string, employee_id?: string) =>
  apiFetch<TrainingAssignmentEnriched[]>(
    companyPath(companyId, `/learning/training-assignments${employee_id ? `?employee_id=${encodeURIComponent(employee_id)}` : ''}`),
  )

export const listCourseEmployeeScores = (
  companyId: string,
  courseId: string,
  params?: { employee_q?: string; employee_id?: string },
) => {
  const sp = new URLSearchParams()
  if (params?.employee_q) sp.set('employee_q', params.employee_q)
  if (params?.employee_id) sp.set('employee_id', params.employee_id)
  const qs = sp.toString()
  return apiFetch<CourseEmployeeScoreRow[]>(
    companyPath(companyId, `/learning/courses/${encodeURIComponent(courseId)}/employee-scores${qs ? `?${qs}` : ''}`),
  )
}

export const learningEmployeeSuggestions = (companyId: string, q: string) =>
  apiFetch<LearningEmployeeSuggestion[]>(
    companyPath(companyId, `/learning/employee-suggestions?q=${encodeURIComponent(q)}`),
  )
export const createAssignment = (companyId: string, body: TrainingAssignmentCreate) =>
  apiFetch<TrainingAssignment>(companyPath(companyId, '/learning/training-assignments'), { method: 'POST', json: body })
export const createCompletion = (companyId: string, body: TrainingCompletionCreate) =>
  apiFetch<TrainingCompletion>(companyPath(companyId, '/learning/training-completions'), { method: 'POST', json: body })
export const getSkillProfile = (companyId: string, employeeId: string) =>
  apiFetch<SkillProfile>(companyPath(companyId, `/learning/skill-profiles/${employeeId}`))
export const upsertSkillProfile = (companyId: string, employeeId: string, skills_json: Record<string, unknown>) =>
  apiFetch<SkillProfile>(companyPath(companyId, `/learning/skill-profiles/${employeeId}`), { method: 'PUT', json: { skills_json } })
