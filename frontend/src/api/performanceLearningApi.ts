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
}

export type CourseCreate = {
  title: string
  category?: string | null
  duration?: string | null
  prerequisites_json?: unknown
  content_url?: string | null
  mandatory?: boolean
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
export const listMyReviewCycleGoals = (companyId: string) =>
  apiFetch<EmployeeMyCycleGoalsGroup[]>(companyPath(companyId, '/performance/my-review-cycle-goals'))

export const submitMyReviewCycleGoals = (companyId: string, cycleId: string, body: SubmitMyCycleGoalsPayload) =>
  apiFetch<SubmitMyCycleGoalsResponse>(
    companyPath(companyId, `/performance/review-cycles/${cycleId}/submit-my-goals`),
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
export const createPip = (companyId: string, body: PipCreate) =>
  apiFetch<Pip>(companyPath(companyId, '/performance/pips'), { method: 'POST', json: body })
export const listCourses = (companyId: string) =>
  apiFetch<Course[]>(companyPath(companyId, '/learning/courses'))
export const createCourse = (companyId: string, body: CourseCreate) =>
  apiFetch<Course>(companyPath(companyId, '/learning/courses'), { method: 'POST', json: body })
export const listAssignments = (companyId: string, employee_id?: string) =>
  apiFetch<TrainingAssignment[]>(companyPath(companyId, `/learning/training-assignments${employee_id ? `?employee_id=${encodeURIComponent(employee_id)}` : ''}`))
export const createAssignment = (companyId: string, body: TrainingAssignmentCreate) =>
  apiFetch<TrainingAssignment>(companyPath(companyId, '/learning/training-assignments'), { method: 'POST', json: body })
export const createCompletion = (companyId: string, body: TrainingCompletionCreate) =>
  apiFetch<TrainingCompletion>(companyPath(companyId, '/learning/training-completions'), { method: 'POST', json: body })
export const getSkillProfile = (companyId: string, employeeId: string) =>
  apiFetch<SkillProfile>(companyPath(companyId, `/learning/skill-profiles/${employeeId}`))
export const upsertSkillProfile = (companyId: string, employeeId: string, skills_json: Record<string, unknown>) =>
  apiFetch<SkillProfile>(companyPath(companyId, `/learning/skill-profiles/${employeeId}`), { method: 'PUT', json: { skills_json } })
