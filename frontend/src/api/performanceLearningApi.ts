import { apiFetch } from './client'
import { companyPath } from './paths'

export type ReviewCycle = {
  id: string
  company_id: string
  name: string
  type: string | null
  start_date: string | null
  end_date: string | null
  status: string
  created_at: string
}

export type Goal = {
  id: string
  company_id: string
  employee_id: string
  cycle_id: string | null
  title: string
  description: string | null
  target: string | null
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

export type ReviewCycleCreate = {
  name: string
  type?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: string
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
  progress: number
  status: string
  cycle_id: string | null
}>

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
