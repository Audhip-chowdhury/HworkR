import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import {
  createActionPlan,
  createSurvey,
  createSurveyResponse,
  deleteSurvey,
  listActionPlans,
  listMyActionPlans,
  listSurveyResponses,
  listSurveys,
  listSurveyTemplates,
  updateActionPlan,
  updateSurvey,
  type ParticipantScope,
  type Survey,
  type SurveyActionPlan,
  type SurveyResponse,
  type SurveyTemplate,
} from '../../../api/compensationApi'
import { getMyEmployee, listEmployees, type Employee } from '../../../api/employeesApi'
import { listDepartments, listPositions, type Department } from '../../../api/organizationApi'
import styles from '../CompanyWorkspacePage.module.css'
import sv from './SurveysPage.module.css'

type SurveyTab = 'surveys' | 'responses' | 'plans' | 'trends' | 'my'

type QType = 'rating_1_5' | 'yes_no' | 'text'

type SurveyQuestion = {
  id: string
  text: string
  type: QType
  required: boolean
}

function genQuestionId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function employeeLabel(e: Employee): string {
  const p = e.personal_info_json
  const name =
    p && typeof p === 'object' && 'full_name' in p && typeof (p as { full_name?: unknown }).full_name === 'string'
      ? (p as { full_name: string }).full_name
      : null
  return name || e.employee_code
}

function parseQuestions(questions_json: unknown): SurveyQuestion[] {
  if (questions_json == null) return []
  if (Array.isArray(questions_json)) {
    return questions_json
      .map((raw) => {
        if (!raw || typeof raw !== 'object') return null
        const o = raw as Record<string, unknown>
        const id = typeof o.id === 'string' ? o.id : genQuestionId()
        const text = typeof o.text === 'string' ? o.text : ''
        const t = o.type === 'rating_1_5' || o.type === 'yes_no' || o.type === 'text' ? o.type : 'text'
        const required = Boolean(o.required)
        return { id, text, type: t, required }
      })
      .filter((x): x is SurveyQuestion => x != null)
  }
  if (typeof questions_json === 'object') {
    return Object.entries(questions_json as Record<string, string>).map(([k, v]) => ({
      id: k,
      text: String(v),
      type: 'text' as const,
      required: false,
    }))
  }
  return []
}

function surveyTypeLabel(t: string | null | undefined): string {
  if (t === 'pulse') return 'Pulse'
  if (t === 'standard') return 'Standard'
  return '—'
}

function responseCountForSurvey(surveyId: string, responses: SurveyResponse[]): number {
  return responses.filter((r) => r.survey_id === surveyId).length
}

function initialsFromLabel(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase()
  return name.slice(0, 2).toUpperCase() || '?'
}

function templateDescription(t: SurveyTemplate): string {
  const n = t.questions.length
  const kind = t.survey_type === 'standard' ? 'Standard engagement' : 'Quick pulse'
  return `${kind} · ${n} question${n === 1 ? '' : 's'} — click to load into the composer`
}

function participantSummary(
  p: SurveyActionPlan,
  departments: { id: string; name: string }[],
  employees: Employee[],
): string {
  const scope = (p.participant_scope || 'all') as string
  const fj = p.participant_filter_json
  if (scope === 'all') return 'Participants: all (in owning department)'
  if (scope === 'department') {
    const ids = (fj?.department_ids as string[] | undefined) ?? []
    const names = ids.map((id) => departments.find((d) => d.id === id)?.name ?? id.slice(0, 8))
    return `Participants: departments — ${names.join(', ') || '—'}`
  }
  if (scope === 'grade') {
    const grades = (fj?.grades as number[] | undefined) ?? []
    return `Participants: org grades — ${grades.join(', ') || '—'}`
  }
  if (scope === 'individual') {
    const eids = (fj?.employee_ids as string[] | undefined) ?? []
    const names = eids.map((id) => {
      const e = employees.find((x) => x.id === id)
      return e ? employeeLabel(e) : id.slice(0, 8)
    })
    return `Participants: individuals — ${names.join(', ') || '—'}`
  }
  return 'Participants: —'
}

export function SurveysPage() {
  const { companyId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { myCompanies } = useAuth()
  const role = myCompanies.find((c) => c.company.id === companyId)?.membership.role ?? ''
  const canManage = role === 'company_admin' || role === 'compensation_analytics' || role === 'hr_ops'
  const isHrOps = role === 'hr_ops'
  const isEmployee = role === 'employee'
  const canViewAllResponses = canManage
  const showHrTabs = !isEmployee

  const mergeSurveyParams = useCallback(
    (mutate: (n: URLSearchParams) => void, opts?: { replace?: boolean }) => {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          mutate(n)
          return n
        },
        { replace: opts?.replace ?? true },
      )
    },
    [setSearchParams],
  )

  const tab: SurveyTab = useMemo(() => {
    const t = searchParams.get('tab')
    if (isEmployee) {
      if (t === 'surveys' || t === 'my' || t === 'plans') return t
      return 'my'
    }
    if (t === 'surveys' || t === 'responses' || t === 'plans' || t === 'trends') return t
    return 'surveys'
  }, [searchParams, isEmployee])

  useEffect(() => {
    if (searchParams.get('tab')) return
    mergeSurveyParams((n) => {
      n.set('tab', isEmployee ? 'my' : 'surveys')
    })
  }, [searchParams, isEmployee, mergeSurveyParams])

  useEffect(() => {
    if (!isEmployee) return
    const t = searchParams.get('tab')
    if (t === 'responses' || t === 'trends') {
      mergeSurveyParams((n) => n.set('tab', 'surveys'))
    }
  }, [isEmployee, searchParams, mergeSurveyParams])

  useEffect(() => {
    if (isEmployee) return
    if (searchParams.get('tab') === 'my') {
      mergeSurveyParams((n) => n.set('tab', 'surveys'))
    }
  }, [isEmployee, searchParams, mergeSurveyParams])

  const [showCreateSurvey, setShowCreateSurvey] = useState(false)
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [responses, setResponses] = useState<SurveyResponse[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [myEmployee, setMyEmployee] = useState<Employee | null>(null)

  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Create survey (comp / admin) */
  const [newTitle, setNewTitle] = useState('')
  const [newSurveyType, setNewSurveyType] = useState<'pulse' | 'standard'>('pulse')
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [newQuestions, setNewQuestions] = useState<SurveyQuestion[]>([
    { id: genQuestionId(), text: 'Overall, how satisfied are you with your role? (1–5)', type: 'rating_1_5', required: true },
  ])

  /* Edit draft */
  const [editingSurveyId, setEditingSurveyId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editSurveyType, setEditSurveyType] = useState<'pulse' | 'standard'>('standard')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editQuestions, setEditQuestions] = useState<SurveyQuestion[]>([])

  /* Analysis tab */
  const [analysisSurveyId, setAnalysisSurveyId] = useState('')

  /* Action plans */
  const [planSurveyId, setPlanSurveyId] = useState('')
  const [actionPlans, setActionPlans] = useState<SurveyActionPlan[]>([])
  const [planTitle, setPlanTitle] = useState('')
  const [planDescription, setPlanDescription] = useState('')
  const [planDue, setPlanDue] = useState('')
  const [planStatus, setPlanStatus] = useState('open')
  const [departments, setDepartments] = useState<Department[]>([])
  const [positionGrades, setPositionGrades] = useState<number[]>([])
  const [planOwnerDeptId, setPlanOwnerDeptId] = useState('')
  const [planParticipantScope, setPlanParticipantScope] = useState<ParticipantScope>('all')
  const [planFilterDeptIds, setPlanFilterDeptIds] = useState<string[]>([])
  const [planFilterGrades, setPlanFilterGrades] = useState<number[]>([])
  const [planFilterEmployeeIds, setPlanFilterEmployeeIds] = useState<string[]>([])
  const [myActionPlans, setMyActionPlans] = useState<SurveyActionPlan[]>([])

  /* Employee respond */
  const [respondSurveyId, setRespondSurveyId] = useState<string | null>(null)
  const [respondAnswers, setRespondAnswers] = useState<Record<string, string>>({})

  /* Trends filter */
  const [trendQuestionKey, setTrendQuestionKey] = useState('')

  const [surveyTemplates, setSurveyTemplates] = useState<SurveyTemplate[]>([])
  const [deleteSurveyId, setDeleteSurveyId] = useState<string | null>(null)

  const gotoSurveyTab = useCallback(
    (next: SurveyTab, opts?: { surveyIdForAnalysis?: string; surveyIdForPlans?: string }) => {
      if (opts?.surveyIdForAnalysis) setAnalysisSurveyId(opts.surveyIdForAnalysis)
      if (opts?.surveyIdForPlans) setPlanSurveyId(opts.surveyIdForPlans)
      mergeSurveyParams((n) => {
        n.set('tab', next)
      })
    },
    [mergeSurveyParams],
  )

  const refresh = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const s = await listSurveys(companyId)
      setSurveys(s)
      const r = await listSurveyResponses(companyId).catch(() => [] as SurveyResponse[])
      setResponses(Array.isArray(r) ? r : [])
      if (canManage || isHrOps) {
        const em = await listEmployees(companyId).catch(() => [] as Employee[])
        setEmployees(em)
      } else {
        setEmployees([])
      }
      if (isEmployee) {
        try {
          const me = await getMyEmployee(companyId)
          setMyEmployee(me)
        } catch {
          setMyEmployee(null)
        }
      } else {
        setMyEmployee(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load engagement data')
    } finally {
      setLoading(false)
    }
  }, [companyId, canManage, isHrOps, isEmployee])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!companyId || !canManage) {
      setSurveyTemplates([])
      return
    }
    let cancelled = false
    void listSurveyTemplates(companyId)
      .then((rows) => {
        if (!cancelled) setSurveyTemplates(rows)
      })
      .catch(() => {
        if (!cancelled) setSurveyTemplates([])
      })
    return () => {
      cancelled = true
    }
  }, [companyId, canManage])

  useEffect(() => {
    if (!companyId || !planSurveyId || (!canManage && !isHrOps)) {
      setActionPlans([])
      return
    }
    let cancelled = false
    void listActionPlans(companyId, planSurveyId)
      .then((rows) => {
        if (!cancelled) setActionPlans(rows)
      })
      .catch(() => {
        if (!cancelled) setActionPlans([])
      })
    return () => {
      cancelled = true
    }
  }, [companyId, planSurveyId, canManage, isHrOps, tab])

  useEffect(() => {
    if (!companyId || (!showHrTabs && !(isEmployee && tab === 'plans'))) return
    let cancelled = false
    void listDepartments(companyId)
      .then((rows) => {
        if (!cancelled) setDepartments(rows)
      })
      .catch(() => {
        if (!cancelled) setDepartments([])
      })
    return () => {
      cancelled = true
    }
  }, [companyId, showHrTabs, isEmployee, tab])

  useEffect(() => {
    if (!companyId || !showHrTabs || tab !== 'plans') return
    let cancelled = false
    void listPositions(companyId)
      .then((pos) => {
        if (!cancelled) {
          const g = [...new Set(pos.map((p) => p.grade))].sort((a, b) => a - b)
          setPositionGrades(g)
        }
      })
      .catch(() => {
        if (!cancelled) setPositionGrades([])
      })
    return () => {
      cancelled = true
    }
  }, [companyId, showHrTabs, tab])

  useEffect(() => {
    if (departments.length === 0) return
    setPlanOwnerDeptId((prev) => prev || departments[0].id)
  }, [departments])

  useEffect(() => {
    if (!companyId || !isEmployee || tab !== 'plans') {
      setMyActionPlans([])
      return
    }
    let cancelled = false
    void listMyActionPlans(companyId)
      .then((rows) => {
        if (!cancelled) setMyActionPlans(rows)
      })
      .catch(() => {
        if (!cancelled) setMyActionPlans([])
      })
    return () => {
      cancelled = true
    }
  }, [companyId, isEmployee, tab])

  useEffect(() => {
    if (!companyId || !isEmployee || tab !== 'plans') return
    let cancelled = false
    void listEmployees(companyId)
      .then((em) => {
        if (!cancelled) setEmployees(em)
      })
      .catch(() => {
        if (!cancelled) setEmployees([])
      })
    return () => {
      cancelled = true
    }
  }, [companyId, isEmployee, tab])

  useEffect(() => {
    if (surveys.length && !analysisSurveyId) setAnalysisSurveyId(surveys[0].id)
    if (surveys.length && !planSurveyId) setPlanSurveyId(surveys[0].id)
  }, [surveys, analysisSurveyId, planSurveyId])

  const analysisSurvey = useMemo(() => surveys.find((x) => x.id === analysisSurveyId), [surveys, analysisSurveyId])
  const analysisQuestions = useMemo(() => parseQuestions(analysisSurvey?.questions_json), [analysisSurvey])
  const analysisResponses = useMemo(
    () => responses.filter((r) => r.survey_id === analysisSurveyId),
    [responses, analysisSurveyId],
  )

  const eligibleHeadcount = employees.length || 1
  const responseRatePct = useMemo(() => {
    if (!analysisSurveyId) return 0
    const n = analysisResponses.length
    return Math.round((n / eligibleHeadcount) * 1000) / 10
  }, [analysisResponses.length, analysisSurveyId, eligibleHeadcount])

  const lowResponseWarning = eligibleHeadcount > 0 && responseRatePct < 50

  const questionStats = useMemo(() => {
    return analysisQuestions.map((q) => {
      const vals = analysisResponses.map((r) => (r.answers_json ?? {})[q.id])
      if (q.type === 'rating_1_5') {
        const nums = vals
          .map((v) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN))
          .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 5)
        const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
        const dist = [1, 2, 3, 4, 5].map((star) => ({
          star,
          count: nums.filter((n) => Math.round(n) === star).length,
        }))
        return { q, kind: 'rating' as const, avg, dist, texts: [] as string[] }
      }
      if (q.type === 'yes_no') {
        let yes = 0
        let no = 0
        for (const v of vals) {
          const s = String(v).toLowerCase()
          if (s === 'yes' || s === 'true' || v === true) yes += 1
          else if (s === 'no' || s === 'false' || v === false) no += 1
        }
        const total = yes + no || 1
        return { q, kind: 'yesno' as const, yesPct: (yes / total) * 100, noPct: (no / total) * 100, texts: [] as string[] }
      }
      const texts = vals.map((v) => (v == null ? '' : String(v))).filter(Boolean)
      return { q, kind: 'text' as const, avg: 0, dist: [], texts }
    })
  }, [analysisQuestions, analysisResponses])

  const avgOverallRating = useMemo(() => {
    const ratings = questionStats.filter((r) => r.kind === 'rating' && (r.avg ?? 0) > 0)
    if (!ratings.length) return null
    return ratings.reduce((a, x) => a + (x.kind === 'rating' ? x.avg : 0), 0) / ratings.length
  }, [questionStats])

  const responseRateTier = useMemo(() => {
    if (responseRatePct >= 70) return 'good' as const
    if (responseRatePct >= 40) return 'warn' as const
    return 'bad' as const
  }, [responseRatePct])

  const trendData = useMemo(() => {
    const rows: { surveyId: string; title: string; label: string; avg: number; qid: string }[] = []
    const targetSurveys = surveys.filter((s) => s.status === 'active' || s.status === 'closed')
    for (const s of targetSurveys) {
      const qs = parseQuestions(s.questions_json)
      const ratingQs = qs.filter((q) => q.type === 'rating_1_5')
      if (ratingQs.length === 0) continue
      const useQ =
        trendQuestionKey && ratingQs.some((q) => q.id === trendQuestionKey)
          ? ratingQs.find((q) => q.id === trendQuestionKey)!
          : ratingQs[0]
      const rs = responses.filter((r) => r.survey_id === s.id)
      const nums = rs
        .map((r) => (r.answers_json ?? {})[useQ.id])
        .map((v) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN))
        .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 5)
      if (nums.length === 0) continue
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length
      const label = s.start_date || s.created_at.slice(0, 10)
      rows.push({ surveyId: s.id, title: s.title, label, avg, qid: useQ.id })
    }
    rows.sort((a, b) => a.label.localeCompare(b.label))
    return rows
  }, [surveys, responses, trendQuestionKey])

  const companyWideAvgBenchmark = useMemo(() => {
    if (trendData.length === 0) return null
    const sum = trendData.reduce((a, b) => a + b.avg, 0)
    return sum / trendData.length
  }, [trendData])

  const allRatingQuestionOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = []
    const seen = new Set<string>()
    for (const s of surveys) {
      for (const q of parseQuestions(s.questions_json)) {
        if (q.type !== 'rating_1_5') continue
        const key = `${q.id}|${q.text}`
        if (seen.has(key)) continue
        seen.add(key)
        opts.push({ id: q.id, label: q.text.slice(0, 80) + (q.text.length > 80 ? '…' : '') })
      }
    }
    return opts
  }, [surveys])

  const actionPlansByStatus = useMemo(() => {
    return {
      open: actionPlans.filter((p) => p.status === 'open'),
      in_progress: actionPlans.filter((p) => p.status === 'in_progress'),
      done: actionPlans.filter((p) => p.status === 'done'),
    }
  }, [actionPlans])

  const myActionPlansBySurvey = useMemo(() => {
    const m = new Map<string, SurveyActionPlan[]>()
    for (const p of myActionPlans) {
      const arr = m.get(p.survey_id) ?? []
      arr.push(p)
      m.set(p.survey_id, arr)
    }
    return m
  }, [myActionPlans])

  async function onCreateSurvey(e: FormEvent) {
    e.preventDefault()
    if (!companyId || !canManage) return
    setPending(true)
    setError(null)
    try {
      await createSurvey(companyId, {
        title: newTitle.trim() || `Pulse survey ${new Date().toLocaleDateString()}`,
        survey_type: newSurveyType,
        status: 'draft',
        start_date: newStart.trim() || null,
        end_date: newEnd.trim() || null,
        questions_json: newQuestions.map((q) => ({ id: q.id, text: q.text.trim(), type: q.type, required: q.required })),
      })
      setNewTitle('')
      setNewStart('')
      setNewEnd('')
      setNewQuestions([{ id: genQuestionId(), text: '', type: 'rating_1_5', required: true }])
      setShowCreateSurvey(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create survey')
    } finally {
      setPending(false)
    }
  }

  function beginEditDraft(s: Survey) {
    if (!canManage || s.status !== 'draft') return
    setEditingSurveyId(s.id)
    setEditTitle(s.title)
    setEditSurveyType(s.survey_type === 'pulse' ? 'pulse' : 'standard')
    setEditStart(s.start_date ?? '')
    setEditEnd(s.end_date ?? '')
    setEditQuestions(parseQuestions(s.questions_json).length ? parseQuestions(s.questions_json) : [{ id: genQuestionId(), text: '', type: 'rating_1_5', required: true }])
  }

  async function saveEditDraft() {
    if (!companyId || !canManage || !editingSurveyId) return
    setPending(true)
    setError(null)
    try {
      await updateSurvey(companyId, editingSurveyId, {
        title: editTitle.trim(),
        survey_type: editSurveyType,
        start_date: editStart.trim() || null,
        end_date: editEnd.trim() || null,
        questions_json: editQuestions.map((q) => ({
          id: q.id,
          text: q.text.trim(),
          type: q.type,
          required: q.required,
        })),
      })
      setEditingSurveyId(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save survey')
    } finally {
      setPending(false)
    }
  }

  async function publishSurvey(id: string) {
    if (!companyId || !canManage) return
    setPending(true)
    setError(null)
    try {
      await updateSurvey(companyId, id, { status: 'active' })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish')
    } finally {
      setPending(false)
    }
  }

  async function closeSurvey(id: string) {
    if (!companyId || !canManage) return
    setPending(true)
    setError(null)
    try {
      await updateSurvey(companyId, id, { status: 'closed' })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close survey')
    } finally {
      setPending(false)
    }
  }

  function applySurveyTemplate(t: SurveyTemplate) {
    setShowCreateSurvey(true)
    setNewTitle(t.title)
    setNewSurveyType(t.survey_type === 'standard' ? 'standard' : 'pulse')
    setNewQuestions(
      t.questions.map((q) => ({
        id: genQuestionId(),
        text: q.text,
        type: q.type as QType,
        required: Boolean(q.required),
      })),
    )
  }

  async function confirmDeleteDraftSurvey() {
    if (!companyId || !deleteSurveyId) return
    setPending(true)
    setError(null)
    try {
      await deleteSurvey(companyId, deleteSurveyId)
      setDeleteSurveyId(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete survey')
    } finally {
      setPending(false)
    }
  }

  async function onCreateActionPlan(e: FormEvent) {
    e.preventDefault()
    if (!companyId || !canManage || !planSurveyId || !planOwnerDeptId) return
    if (planParticipantScope === 'department' && planFilterDeptIds.length === 0) {
      setError('Select at least one department for participant scope, or choose All.')
      return
    }
    if (planParticipantScope === 'grade' && planFilterGrades.length === 0) {
      setError('Select at least one org grade for participant scope, or choose All.')
      return
    }
    if (planParticipantScope === 'individual' && planFilterEmployeeIds.length === 0) {
      setError('Select at least one employee for participant scope, or choose All.')
      return
    }
    setPending(true)
    setError(null)
    try {
      let participant_filter_json: Record<string, unknown> | null = null
      if (planParticipantScope === 'department') {
        participant_filter_json = { department_ids: planFilterDeptIds }
      } else if (planParticipantScope === 'grade') {
        participant_filter_json = { grades: planFilterGrades }
      } else if (planParticipantScope === 'individual') {
        participant_filter_json = { employee_ids: planFilterEmployeeIds }
      }
      await createActionPlan(companyId, planSurveyId, {
        title: planTitle.trim(),
        description: planDescription.trim() || null,
        owner_department_id: planOwnerDeptId,
        participant_scope: planParticipantScope,
        participant_filter_json,
        due_date: planDue.trim() || null,
        status: planStatus,
      })
      setPlanTitle('')
      setPlanDescription('')
      setPlanDue('')
      setPlanStatus('open')
      setPlanParticipantScope('all')
      setPlanFilterDeptIds([])
      setPlanFilterGrades([])
      setPlanFilterEmployeeIds([])
      const rows = await listActionPlans(companyId, planSurveyId)
      setActionPlans(rows)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create action plan')
    } finally {
      setPending(false)
    }
  }

  async function patchPlanStatus(id: string, status: string) {
    if (!companyId || (!canManage && !isHrOps)) return
    setPending(true)
    setError(null)
    try {
      await updateActionPlan(companyId, id, { status })
      const rows = await listActionPlans(companyId, planSurveyId)
      setActionPlans(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update plan')
    } finally {
      setPending(false)
    }
  }

  const activeSurveysForEmployee = useMemo(() => {
    if (!isEmployee || !myEmployee) return []
    return surveys.filter((s) => s.status === 'active')
  }, [surveys, isEmployee, myEmployee])

  const employeeRespondedIds = useMemo(() => {
    if (!myEmployee) return new Set<string>()
    return new Set(responses.filter((r) => r.employee_id === myEmployee.id).map((r) => r.survey_id))
  }, [responses, myEmployee])

  const respondSurvey = respondSurveyId ? surveys.find((x) => x.id === respondSurveyId) : undefined
  const respondQuestions = useMemo(() => (respondSurvey ? parseQuestions(respondSurvey.questions_json) : []), [respondSurvey])

  async function submitEmployeeResponse() {
    if (!companyId || !isEmployee || !myEmployee || !respondSurveyId) return
    const qs = respondQuestions
    for (const q of qs) {
      if (q.required) {
        const v = respondAnswers[q.id]
        if (v == null || String(v).trim() === '') {
          setError(`Please answer: ${q.text}`)
          return
        }
      }
    }
    const answers: Record<string, unknown> = {}
    for (const q of qs) {
      const raw = respondAnswers[q.id]
      if (raw === '' || raw == null) continue
      if (q.type === 'rating_1_5') answers[q.id] = Number(raw)
      else if (q.type === 'yes_no') answers[q.id] = raw === 'yes' ? 'yes' : 'no'
      else answers[q.id] = String(raw)
    }
    setPending(true)
    setError(null)
    try {
      await createSurveyResponse(companyId, {
        survey_id: respondSurveyId,
        employee_id: myEmployee.id,
        answers_json: answers,
      })
      setRespondSurveyId(null)
      setRespondAnswers({})
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setPending(false)
    }
  }

  function statusBadgeClass(st: string): string {
    if (st === 'draft') return sv.statusDraft
    if (st === 'active') return sv.statusActive
    if (st === 'closed') return sv.statusClosed
    return sv.statusDraft
  }

  function surveyCardGrid(surveyRows: Survey[], opts: { employeeView?: boolean }) {
    const { employeeView } = opts
    if (loading) return <p className={styles.muted}>Loading…</p>
    if (surveyRows.length === 0) return <p className={styles.muted}>No surveys yet.</p>
    return (
      <div className={sv.grid}>
        {surveyRows.map((s) => {
          const rc = responseCountForSurvey(s.id, responses)
          const typeCls = s.survey_type === 'standard' ? `${sv.typePill} ${sv.typePillStandard}` : sv.typePill
          return (
            <div key={s.id} className={sv.surveyCard}>
              <div className={sv.surveyCardHeader}>
                <span className={typeCls}>{surveyTypeLabel(s.survey_type)}</span>
                <span className={`${sv.statusBadge} ${statusBadgeClass(s.status)}`}>{s.status}</span>
              </div>
              <h4 className={sv.cardTitle}>{s.title}</h4>
              <p className={sv.cardMeta}>
                {s.start_date || s.end_date ? (
                  <>
                    {s.start_date ?? '—'} → {s.end_date ?? '—'}
                  </>
                ) : (
                  <>Created {s.created_at.slice(0, 10)}</>
                )}
              </p>
              <div>
                <span className={sv.responseEmphasis}>{rc}</span>
                <span className={sv.cardMeta}> responses</span>
              </div>
              <div className={sv.cardActions}>
                {!employeeView && canManage && s.status === 'draft' ? (
                  <>
                    <button type="button" className={styles.btnSm} disabled={pending} onClick={() => void publishSurvey(s.id)}>
                      Publish
                    </button>
                    <button type="button" className={sv.linkBtn} onClick={() => beginEditDraft(s)}>
                      Edit draft
                    </button>
                    <button type="button" className={sv.linkBtn} onClick={() => setDeleteSurveyId(s.id)}>
                      Delete
                    </button>
                  </>
                ) : null}
                {!employeeView && canManage && s.status === 'active' ? (
                  <button type="button" className={styles.btnSm} disabled={pending} onClick={() => void closeSurvey(s.id)}>
                    Close survey
                  </button>
                ) : null}
                {!employeeView && (canManage || isHrOps) && (s.status === 'active' || s.status === 'closed') ? (
                  <>
                    <button
                      type="button"
                      className={sv.linkBtn}
                      onClick={() => gotoSurveyTab('responses', { surveyIdForAnalysis: s.id })}
                    >
                      Responses &amp; analysis
                    </button>
                    <button
                      type="button"
                      className={sv.linkBtn}
                      onClick={() => gotoSurveyTab('plans', { surveyIdForPlans: s.id })}
                    >
                      Action plans
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={sv.page}>
      <header className={sv.hero}>
        <h1 className={sv.heroTitle}>Engagement &amp; Surveys</h1>
        <p className={sv.heroSub}>
          {showHrTabs
            ? 'Design listening moments, publish on your timeline, review participation and themes, and turn insights into accountable follow-ups.'
            : 'Complete your assigned surveys and share honest feedback — responses help leadership improve the workplace.'}
        </p>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}

      {tab === 'surveys' ? (
        <>
          {canManage ? (
            <>
              {surveyTemplates.length > 0 ? (
                <section className={styles.card} style={{ marginBottom: '1rem' }}>
                  <h3 className={styles.h3}>Start from an HR template</h3>
                  <p className={styles.flowHint}>
                    Pre-built question sets aligned with common listening goals. Applying a template opens the composer — review wording and dates before saving as draft.
                  </p>
                  <div className={sv.templateGrid}>
                    {surveyTemplates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => applySurveyTemplate(t)}
                        className={sv.templateCard}
                      >
                        <span className={sv.templateTitle}>{t.title}</span>
                        <span className={sv.templateMeta}>{templateDescription(t)}</span>
                        <span className={sv.templateBadge}>{t.questions.length} questions</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
              <div className={sv.toolbar}>
                <h3 className={styles.h3} style={{ margin: 0 }}>Composer</h3>
                <button type="button" className={sv.primaryBtn} onClick={() => setShowCreateSurvey((v) => !v)}>
                  {showCreateSurvey ? 'Close composer' : '+ New survey'}
                </button>
              </div>
              {showCreateSurvey ? (
              <section className={`${styles.card} ${sv.createPanel}`}>
              <p className={styles.flowHint} style={{ marginTop: 0 }}>
                Add <strong>rating (1–5)</strong>, <strong>yes/no</strong>, or <strong>open text</strong> questions. Save as draft, then publish when ready. Employees only see{' '}
                <strong>active</strong> surveys and can submit once per survey.
              </p>
              <form onSubmit={onCreateSurvey} className={styles.positionForm}>
                <label className={styles.hint}>
                  Title
                  <input className={styles.input} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Q1 2026 pulse" />
                </label>
                <label className={styles.hint}>
                  Type
                  <select className={styles.input} value={newSurveyType} onChange={(e) => setNewSurveyType(e.target.value as 'pulse' | 'standard')}>
                    <option value="pulse">Pulse</option>
                    <option value="standard">Standard</option>
                  </select>
                </label>
                <label className={styles.hint}>
                  Start date (optional)
                  <input className={styles.input} type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
                </label>
                <label className={styles.hint}>
                  End date (optional)
                  <input className={styles.input} type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
                </label>
                <div style={{ width: '100%', marginTop: '0.5rem' }}>
                  <p className={styles.hint} style={{ fontWeight: 600 }}>
                    Question builder
                  </p>
                  {newQuestions.map((q, idx) => (
                    <div key={q.id} className={sv.questionRow}>
                      <span className={sv.qNum} aria-hidden>{idx + 1}</span>
                      <label className={styles.hint} style={{ flex: '1 1 12rem' }}>
                        Wording
                        <input
                          className={styles.input}
                          value={q.text}
                          onChange={(e) =>
                            setNewQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x)))
                          }
                        />
                      </label>
                      <label className={styles.hint}>
                        Type
                        <select
                          className={styles.input}
                          value={q.type}
                          onChange={(e) =>
                            setNewQuestions((prev) =>
                              prev.map((x) => (x.id === q.id ? { ...x, type: e.target.value as QType } : x)),
                            )
                          }
                        >
                          <option value="rating_1_5">Rating 1–5</option>
                          <option value="yes_no">Yes / No</option>
                          <option value="text">Open text</option>
                        </select>
                      </label>
                      <label className={styles.hint} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <input
                          type="checkbox"
                          checked={q.required}
                          onChange={(e) =>
                            setNewQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, required: e.target.checked } : x)))
                          }
                        />
                        Required
                      </label>
                      <button
                        type="button"
                        className={styles.btnSm}
                        onClick={() => setNewQuestions((prev) => prev.filter((x) => x.id !== q.id))}
                        disabled={newQuestions.length <= 1}
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        className={styles.btnSm}
                        disabled={idx === 0}
                        onClick={() =>
                          setNewQuestions((prev) => {
                            const a = [...prev]
                            ;[a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]
                            return a
                          })
                        }
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className={styles.btnSm}
                        disabled={idx >= newQuestions.length - 1}
                        onClick={() =>
                          setNewQuestions((prev) => {
                            const a = [...prev]
                            ;[a[idx], a[idx + 1]] = [a[idx + 1], a[idx]]
                            return a
                          })
                        }
                      >
                        Down
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className={styles.btnSm}
                    onClick={() => setNewQuestions((prev) => [...prev, { id: genQuestionId(), text: '', type: 'rating_1_5', required: false }])}
                  >
                    Add question
                  </button>
                </div>
                <button type="submit" className={styles.btnSm} disabled={pending}>
                  {pending ? 'Saving…' : 'Save as draft'}
                </button>
              </form>
            </section>
              ) : null}
            </>
          ) : null}

          <section className={styles.card} style={{ marginTop: '1rem' }}>
            <h3 className={styles.h3}>{isEmployee ? 'Company surveys' : 'Survey catalog'}</h3>
            <p className={styles.flowHint}>
              {isEmployee
                ? 'Published and closed cycles appear here. Open My Surveys to respond when a survey is active.'
                : 'Track lifecycle, participation, and follow-through from one place.'}
            </p>
            {surveyCardGrid(surveys, { employeeView: isEmployee })}
          </section>

          {editingSurveyId && canManage ? (
            <section className={styles.card} style={{ marginTop: '1rem' }}>
              <h3 className={styles.h3}>Edit draft</h3>
              <div className={styles.positionForm}>
                <label className={styles.hint}>
                  Title
                  <input className={styles.input} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </label>
                <label className={styles.hint}>
                  Type
                  <select
                    className={styles.input}
                    value={editSurveyType}
                    onChange={(e) => setEditSurveyType(e.target.value as 'pulse' | 'standard')}
                  >
                    <option value="pulse">Pulse</option>
                    <option value="standard">Standard</option>
                  </select>
                </label>
                <label className={styles.hint}>
                  Start
                  <input className={styles.input} type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                </label>
                <label className={styles.hint}>
                  End
                  <input className={styles.input} type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                </label>
                {editQuestions.map((q, idx) => (
                  <div key={q.id} className={sv.questionRow}>
                    <span className={sv.qNum} aria-hidden>{idx + 1}</span>
                    <input
                      className={styles.input}
                      style={{ flex: '1 1 14rem' }}
                      value={q.text}
                      onChange={(e) => setEditQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x)))}
                    />
                    <select
                      className={styles.input}
                      value={q.type}
                      onChange={(e) =>
                        setEditQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, type: e.target.value as QType } : x)))
                      }
                    >
                      <option value="rating_1_5">Rating 1–5</option>
                      <option value="yes_no">Yes / No</option>
                      <option value="text">Open text</option>
                    </select>
                    <button type="button" className={styles.btnSm} onClick={() => setEditQuestions((prev) => prev.filter((x) => x.id !== q.id))}>
                      Remove
                    </button>
                    <button
                      type="button"
                      className={styles.btnSm}
                      disabled={idx === 0}
                      onClick={() =>
                        setEditQuestions((prev) => {
                          const a = [...prev]
                          ;[a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]
                          return a
                        })
                      }
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className={styles.btnSm}
                      disabled={idx >= editQuestions.length - 1}
                      onClick={() =>
                        setEditQuestions((prev) => {
                          const a = [...prev]
                          ;[a[idx], a[idx + 1]] = [a[idx + 1], a[idx]]
                          return a
                        })
                      }
                    >
                      Down
                    </button>
                  </div>
                ))}
                <button type="button" className={styles.btnSm} onClick={() => setEditQuestions((prev) => [...prev, { id: genQuestionId(), text: '', type: 'text', required: false }])}>
                  Add question
                </button>
                <div className={styles.inline} style={{ marginTop: '0.75rem', gap: '0.5rem' }}>
                  <button type="button" className={styles.btnSm} disabled={pending} onClick={() => void saveEditDraft()}>
                    Save changes
                  </button>
                  <button type="button" className={styles.btnSm} onClick={() => setEditingSurveyId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {tab === 'my' && isEmployee ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>My surveys</h3>
          <p className={styles.flowHint}>Active surveys you can complete. You can submit once per survey while it is open.</p>
          {!myEmployee ? (
            <p className={styles.muted}>No employee profile linked to your account. Ask an admin to link your user to an employee record.</p>
          ) : activeSurveysForEmployee.length === 0 ? (
            <div className={sv.emptyState}>There are no active surveys right now. Check back when HR publishes a new listening cycle.</div>
          ) : (
            <>
              {activeSurveysForEmployee.map((surveyRow) => {
                const done = employeeRespondedIds.has(surveyRow.id)
                return (
                  <div key={surveyRow.id} className={`${sv.empCard} ${done ? sv.empCardDone : ''}`}>
                    <div>
                      <span className={surveyRow.survey_type === 'standard' ? `${sv.typePill} ${sv.typePillStandard}` : sv.typePill}>
                        {surveyTypeLabel(surveyRow.survey_type)}
                      </span>
                      <h4 className={sv.cardTitle} style={{ marginTop: '0.35rem' }}>{surveyRow.title}</h4>
                      {done ? (
                        <p className={sv.checkmark} style={{ margin: '0.35rem 0 0' }}>Submitted — thank you.</p>
                      ) : (
                        <p className={styles.muted} style={{ margin: '0.35rem 0 0', fontSize: '0.875rem' }}>Your feedback is confidential to HR.</p>
                      )}
                    </div>
                    {!done && respondSurveyId !== surveyRow.id ? (
                      <button type="button" className={sv.primaryBtn} onClick={() => setRespondSurveyId(surveyRow.id)}>
                        Take survey
                      </button>
                    ) : null}
                  </div>
                )
              })}

              {respondSurveyId && respondSurvey && myEmployee ? (
                <div className={sv.respondPanel}>
                  <h4 className={styles.h3} style={{ marginTop: 0 }}>{respondSurvey.title}</h4>
                  {respondQuestions.map((q, qi) => (
                    <div key={q.id} className={sv.qBlock}>
                      <div className={sv.qLabel}>Question {qi + 1}</div>
                      <div className={styles.hint} style={{ fontWeight: 600, marginBottom: '0.35rem' }}>
                        {q.text}
                        {q.required ? <span className={styles.error}> *</span> : null}
                      </div>
                      {q.type === 'rating_1_5' ? (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                          {[1, 2, 3, 4, 5].map((n) => {
                            const selected = respondAnswers[q.id] === String(n)
                            return (
                              <button
                                key={n}
                                type="button"
                                className={`${sv.ratingBtn} ${selected ? sv.ratingBtnSelected : ''}`}
                                onClick={() => setRespondAnswers((prev) => ({ ...prev, [q.id]: String(n) }))}
                              >
                                {n}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                      {q.type === 'yes_no' ? (
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                          {(['yes', 'no'] as const).map((yn) => {
                            const selected = respondAnswers[q.id] === yn
                            return (
                              <button
                                key={yn}
                                type="button"
                                className={`${sv.yesNoToggle} ${selected ? sv.yesNoToggleSelected : ''}`}
                                onClick={() => setRespondAnswers((prev) => ({ ...prev, [q.id]: yn }))}
                              >
                                {yn === 'yes' ? 'Yes' : 'No'}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                      {q.type === 'text' ? (
                        <>
                          <textarea
                            className={styles.input}
                            style={{ minHeight: 88, marginTop: '0.4rem' }}
                            value={respondAnswers[q.id] ?? ''}
                            onChange={(e) => setRespondAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          />
                          <span className={styles.muted} style={{ fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>
                            {(respondAnswers[q.id] ?? '').length} characters
                          </span>
                        </>
                      ) : null}
                    </div>
                  ))}
                  <div className={styles.inline} style={{ gap: '0.5rem' }}>
                    <button type="button" className={sv.primaryBtn} disabled={pending} onClick={() => void submitEmployeeResponse()}>
                      Submit response
                    </button>
                    <button type="button" className={sv.ghostBtn} onClick={() => { setRespondSurveyId(null); setRespondAnswers({}) }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {tab === 'responses' && showHrTabs ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Responses &amp; analysis</h3>
          <p className={styles.flowHint}>
            Pick a survey. Response rate uses <strong>total employees in the company</strong> as the denominator (approximate reach).
          </p>
          <label className={`${styles.hint} ${sv.surveySelectWrap}`}>
            Survey
            <select className={sv.surveySelect} value={analysisSurveyId} onChange={(e) => setAnalysisSurveyId(e.target.value)}>
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.status})
                </option>
              ))}
            </select>
          </label>
          {!analysisSurveyId ? (
            <p className={styles.muted}>No survey selected.</p>
          ) : (
            <>
              <div className={sv.statsRow}>
                <div className={sv.statBox}>
                  <div className={sv.statLabel}>Responses collected</div>
                  <div className={sv.statValue}>{analysisResponses.length}</div>
                </div>
                <div className={`${sv.statBox} ${responseRateTier === 'good' ? sv.statGood : responseRateTier === 'warn' ? sv.statWarn : sv.statBad}`}>
                  <div className={sv.statLabel}>Approx. response rate</div>
                  <div className={sv.statValue}>{responseRatePct}%</div>
                </div>
                <div className={sv.statBox}>
                  <div className={sv.statLabel}>Avg. rating (where applicable)</div>
                  <div className={sv.statValue}>{avgOverallRating != null ? `${avgOverallRating.toFixed(2)} / 5` : '—'}</div>
                </div>
              </div>

              <p style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>
                <strong>
                  {analysisResponses.length} of {eligibleHeadcount} employees responded
                </strong>{' '}
                <span className={styles.muted}>(company headcount as reach)</span>
              </p>
              {lowResponseWarning ? (
                <p className={styles.error} style={{ marginTop: '0.5rem', maxWidth: '40rem' }}>
                  Low response rate (below 50%). Consider reminders, shortening the form, or extending the window.
                </p>
              ) : null}

              {questionStats.map((row) => (
                <div key={row.q.id} className={sv.analysisQCard}>
                  <h4 className={sv.analysisQTitle}>{row.q.text}</h4>
                  <p className={styles.muted} style={{ fontSize: '0.75rem', marginBottom: '0.65rem' }}>
                    {row.q.type === 'rating_1_5' ? 'Scale 1–5' : row.q.type === 'yes_no' ? 'Yes / No' : 'Open text'}
                  </p>
                  {row.kind === 'rating' ? (
                    <>
                      <p style={{ margin: '0 0 0.5rem' }}>
                        <strong>Average score:</strong> {row.avg ? row.avg.toFixed(2) : '—'} / 5
                      </p>
                      <div>
                        {row.dist.map(({ star, count }) => {
                          const max = Math.max(1, ...row.dist.map((d) => d.count))
                          const w = (count / max) * 100
                          return (
                            <div key={star} className={sv.ratingBarRow}>
                              <span className={sv.ratingBarLabel}>★ {star}</span>
                              <div className={sv.ratingBarTrack}>
                                <div className={sv.ratingBarFill} style={{ width: `${w}%` }} />
                              </div>
                              <span style={{ width: '2rem', fontSize: '0.8125rem' }}>{count}</span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : null}
                  {row.kind === 'yesno' ? (
                    <div className={sv.yesNoBar} style={{ maxWidth: '28rem' }}>
                      <div className={sv.yesSeg} style={{ width: `${row.yesPct}%` }}>
                        Yes {row.yesPct.toFixed(0)}%
                      </div>
                      <div className={sv.noSeg} style={{ width: `${row.noPct}%` }}>
                        No {row.noPct.toFixed(0)}%
                      </div>
                    </div>
                  ) : null}
                  {row.kind === 'text' ? (
                    <div style={{ maxHeight: 220, overflow: 'auto' }}>
                      {row.texts.length === 0 ? (
                        <p className={styles.muted}>No text answers.</p>
                      ) : (
                        row.texts.map((t, i) => (
                          <p key={i} className={sv.textQuote}>
                            {t}
                          </p>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              ))}

              {canViewAllResponses ? (
                <>
                  <h4 className={styles.h3} style={{ marginTop: '1.5rem' }}>
                    Raw responses
                  </h4>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Submitted</th>
                          {analysisQuestions.map((q) => (
                            <th key={q.id}>{q.text.slice(0, 24)}{q.text.length > 24 ? '…' : ''}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analysisResponses.length === 0 ? (
                          <tr>
                            <td colSpan={2 + analysisQuestions.length} className={styles.muted}>
                              No responses for this survey.
                            </td>
                          </tr>
                        ) : (
                          analysisResponses.map((r) => {
                            const emp = employees.find((e) => e.id === r.employee_id)
                            return (
                              <tr key={r.id}>
                                <td>{emp ? `${employeeLabel(emp)} (${emp.employee_code})` : r.employee_id.slice(0, 8) + '…'}</td>
                                <td>{new Date(r.submitted_at).toLocaleString()}</td>
                                {analysisQuestions.map((q) => {
                                  const v = (r.answers_json ?? {})[q.id]
                                  return <td key={q.id}>{v == null ? '—' : String(v)}</td>
                                })}
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {tab === 'plans' && isEmployee ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Action plans</h3>
          <p className={styles.flowHint}>
            Follow-ups owned by your department that apply to you. HR creates these from survey results; status updates as work progresses.
          </p>
          {!myEmployee ? (
            <p className={styles.muted}>No employee profile linked to your account. Ask an admin to link your user to an employee record.</p>
          ) : myActionPlans.length === 0 ? (
            <div className={sv.emptyState}>No action plans for you yet. When a survey owner assigns a plan to your department, it will appear here.</div>
          ) : (
            <>
              {Array.from(myActionPlansBySurvey.entries()).map(([surveyId, plans]) => {
                const surveyRow = surveys.find((s) => s.id === surveyId)
                const surveyTitle = surveyRow?.title ?? '(Survey)'
                return (
                  <div key={surveyId} className={sv.planSection}>
                    <h4 className={sv.planSectionTitle}>{surveyTitle}</h4>
                    {plans.map((p) => {
                      const ownerDept = p.owner_department_id ? departments.find((d) => d.id === p.owner_department_id) : null
                      const badgeCls =
                        p.status === 'open' ? sv.badgeOpen : p.status === 'in_progress' ? sv.badgeProgress : sv.badgeDone
                      return (
                        <div key={p.id} className={sv.planCard}>
                          <div className={sv.initials} title={ownerDept?.name ?? 'Dept'}>
                            {ownerDept ? initialsFromLabel(ownerDept.name) : '—'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className={sv.planTitle}>{p.title}</p>
                            {p.description ? <p className={styles.muted} style={{ fontSize: '0.85rem', margin: '0.25rem 0 0' }}>{p.description}</p> : null}
                            <p className={styles.muted} style={{ fontSize: '0.8rem', margin: '0.35rem 0 0' }}>
                              Owning department: {ownerDept?.name ?? '—'} · {participantSummary(p, departments, employees)}
                            </p>
                            <p className={styles.muted} style={{ fontSize: '0.8rem', margin: '0.15rem 0 0' }}>
                              Due {p.due_date ?? '—'}
                            </p>
                          </div>
                          <span className={`${sv.planBadge} ${badgeCls}`}>{p.status.replace('_', ' ')}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </>
          )}
        </section>
      ) : null}

      {tab === 'plans' && showHrTabs ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Action plans</h3>
          <p className={styles.flowHint}>
            Turn survey signals into follow-ups. <strong>Owner</strong> is the department that owns the plan (members see it in their Action plans tab).{' '}
            <strong>Participants</strong> narrows who the action applies to among that department.
          </p>
          <label className={`${styles.hint} ${sv.surveySelectWrap}`}>
            Context — survey
            <select className={sv.surveySelect} value={planSurveyId} onChange={(e) => setPlanSurveyId(e.target.value)}>
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>

          {canManage ? (
            <div className={sv.addPlanCard}>
              <h4 className={styles.h3} style={{ marginTop: 0 }}>Add action item</h4>
              <form onSubmit={onCreateActionPlan} className={styles.positionForm}>
                <label className={styles.hint}>
                  Title
                  <input className={styles.input} value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} required />
                </label>
                <label className={styles.hint} style={{ flex: '1 1 100%' }}>
                  Description (optional)
                  <textarea className={styles.input} style={{ minHeight: 64 }} value={planDescription} onChange={(e) => setPlanDescription(e.target.value)} />
                </label>
                <label className={styles.hint}>
                  Owner (department)
                  <select
                    className={styles.input}
                    value={planOwnerDeptId}
                    onChange={(e) => setPlanOwnerDeptId(e.target.value)}
                    required
                  >
                    {departments.length === 0 ? <option value="">Loading departments…</option> : null}
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.hint}>
                  Participants
                  <select
                    className={styles.input}
                    value={planParticipantScope}
                    onChange={(e) => setPlanParticipantScope(e.target.value as ParticipantScope)}
                  >
                    <option value="all">All (everyone in owning department)</option>
                    <option value="department">By department</option>
                    <option value="grade">By org grade (position)</option>
                    <option value="individual">Individual employees</option>
                  </select>
                </label>
                {planParticipantScope === 'department' ? (
                  <label className={styles.hint} style={{ flex: '1 1 100%' }}>
                    Departments (hold Ctrl/Cmd to select multiple)
                    <select
                      multiple
                      className={styles.input}
                      size={Math.min(8, Math.max(3, departments.length || 3))}
                      value={planFilterDeptIds}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions).map((o) => o.value)
                        setPlanFilterDeptIds(selected)
                      }}
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {planParticipantScope === 'grade' ? (
                  <label className={styles.hint} style={{ flex: '1 1 100%' }}>
                    Org grades (from positions)
                    <select
                      multiple
                      className={styles.input}
                      size={Math.min(8, Math.max(3, positionGrades.length || 3))}
                      value={planFilterGrades.map(String)}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions).map((o) => Number(o.value))
                        setPlanFilterGrades(selected)
                      }}
                    >
                      {positionGrades.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {planParticipantScope === 'individual' ? (
                  <label className={styles.hint} style={{ flex: '1 1 100%' }}>
                    Employees (hold Ctrl/Cmd to select multiple)
                    <select
                      multiple
                      className={styles.input}
                      size={Math.min(8, Math.max(3, employees.length || 3))}
                      value={planFilterEmployeeIds}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions).map((o) => o.value)
                        setPlanFilterEmployeeIds(selected)
                      }}
                    >
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {employeeLabel(e)} ({e.employee_code})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className={styles.hint}>
                  Due date
                  <input className={styles.input} type="date" value={planDue} onChange={(e) => setPlanDue(e.target.value)} />
                </label>
                <label className={styles.hint}>
                  Initial status
                  <select className={styles.input} value={planStatus} onChange={(e) => setPlanStatus(e.target.value)}>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="done">Done</option>
                  </select>
                </label>
                <button type="submit" className={sv.primaryBtn} disabled={pending || !planSurveyId || !planOwnerDeptId}>
                  Add action plan
                </button>
              </form>
            </div>
          ) : (
            <p className={styles.flowHint}>
              <strong>View only</strong> — new items are created by company admin or compensation analytics.
            </p>
          )}

          {actionPlans.length === 0 ? (
            <div className={sv.emptyState}>No action plans for this survey yet.</div>
          ) : (
            <>
              {(['open', 'in_progress', 'done'] as const).map((key) => {
                const list =
                  key === 'open'
                    ? actionPlansByStatus.open
                    : key === 'in_progress'
                      ? actionPlansByStatus.in_progress
                      : actionPlansByStatus.done
                const title = key === 'open' ? 'Open' : key === 'in_progress' ? 'In progress' : 'Done'
                if (list.length === 0) return null
                return (
                  <div key={key} className={sv.planSection}>
                    <h4 className={sv.planSectionTitle}>{title}</h4>
                    {list.map((p) => {
                      const ownerDept = p.owner_department_id ? departments.find((d) => d.id === p.owner_department_id) : null
                      const badgeCls =
                        p.status === 'open' ? sv.badgeOpen : p.status === 'in_progress' ? sv.badgeProgress : sv.badgeDone
                      return (
                        <div key={p.id} className={sv.planCard}>
                          <div className={sv.initials} title={ownerDept?.name ?? 'Dept'}>
                            {ownerDept ? initialsFromLabel(ownerDept.name) : '—'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className={sv.planTitle}>{p.title}</p>
                            {p.description ? <p className={styles.muted} style={{ fontSize: '0.85rem', margin: '0.25rem 0 0' }}>{p.description}</p> : null}
                            <p className={styles.muted} style={{ fontSize: '0.8rem', margin: '0.35rem 0 0' }}>
                              Owning department: {ownerDept?.name ?? '—'} · {participantSummary(p, departments, employees)}
                            </p>
                            <p className={styles.muted} style={{ fontSize: '0.8rem', margin: '0.15rem 0 0' }}>
                              Due {p.due_date ?? '—'}
                            </p>
                          </div>
                          <span className={`${sv.planBadge} ${badgeCls}`}>{p.status.replace('_', ' ')}</span>
                          {canManage || isHrOps ? (
                            <select
                              className={styles.input}
                              style={{ maxWidth: 140 }}
                              value={p.status}
                              disabled={pending}
                              onChange={(e) => void patchPlanStatus(p.id, e.target.value)}
                            >
                              <option value="open">Open</option>
                              <option value="in_progress">In progress</option>
                              <option value="done">Done</option>
                            </select>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </>
          )}
        </section>
      ) : null}

      {tab === 'trends' && showHrTabs ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Satisfaction trends</h3>
          <p className={styles.flowHint}>
            Average of the <strong>first rating (1–5) question</strong> on each active or closed survey, ordered by start / created date. Filter by question when
            the same id appears across surveys.
          </p>
          {allRatingQuestionOptions.length > 0 ? (
            <label className={styles.hint} style={{ display: 'block', marginBottom: '1rem', maxWidth: '32rem' }}>
              Filter by rating question (optional)
              <select className={styles.input} value={trendQuestionKey} onChange={(e) => setTrendQuestionKey(e.target.value)}>
                <option value="">First rating question per survey</option>
                {allRatingQuestionOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {trendData.length === 0 ? (
            <div className={sv.emptyState}>
              No rating data yet. Publish surveys with 1–5 scale questions and collect responses to see satisfaction trendlines here.
            </div>
          ) : (
            <>
              {companyWideAvgBenchmark != null ? (
                <p className={styles.muted} style={{ marginBottom: '1rem', maxWidth: '42rem' }}>
                  <strong>Benchmark</strong> — company-wide average across the surveys below:{' '}
                  <strong>{companyWideAvgBenchmark.toFixed(2)} / 5</strong>. The red dashed line shows this level on each bar.
                </p>
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {trendData.map((row) => {
                  const w = (row.avg / 5) * 100
                  const benchPct = companyWideAvgBenchmark != null ? (companyWideAvgBenchmark / 5) * 100 : null
                  return (
                    <div key={row.surveyId} className={sv.trendRow}>
                      <div className={sv.trendHead}>
                        <span style={{ fontSize: '0.9rem' }}>
                          <strong>{row.title}</strong>
                          <span className={styles.muted}> · {row.label}</span>
                        </span>
                        <span className={sv.trendValue}>{row.avg.toFixed(2)} / 5</span>
                      </div>
                      <div className={sv.trendBarWrap}>
                        <div className={sv.trendBarBg}>
                          <div className={sv.trendBarFill} style={{ width: `${w}%` }} />
                        </div>
                        {benchPct != null ? (
                          <div
                            className={sv.trendBench}
                            title={`Company average ${companyWideAvgBenchmark!.toFixed(2)} / 5`}
                            style={{ left: `${benchPct}%` }}
                          />
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>
      ) : null}

      {deleteSurveyId ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-survey-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div className={styles.card} style={{ maxWidth: 420, width: '100%', padding: '1.25rem' }}>
            <h3 className={styles.h3} id="delete-survey-title">
              Delete draft survey?
            </h3>
            <p className={styles.flowHint}>Draft surveys can be removed permanently. This cannot be undone.</p>
            <div className={styles.inline} style={{ gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" className={styles.btnSm} disabled={pending} onClick={() => void confirmDeleteDraftSurvey()}>
                {pending ? 'Deleting…' : 'Delete'}
              </button>
              <button type="button" className={styles.btnSm} disabled={pending} onClick={() => setDeleteSurveyId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
