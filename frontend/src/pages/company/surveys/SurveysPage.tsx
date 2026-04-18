import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import {
  createActionPlan,
  createSurvey,
  createSurveyResponse,
  deleteSurvey,
  listActionPlans,
  listSurveyResponses,
  listSurveys,
  listSurveyTemplates,
  updateActionPlan,
  updateSurvey,
  type Survey,
  type SurveyActionPlan,
  type SurveyResponse,
  type SurveyTemplate,
} from '../../../api/compensationApi'
import { getMyEmployee, listEmployees, type Employee } from '../../../api/employeesApi'
import styles from '../CompanyWorkspacePage.module.css'

type MainTab = 'surveys' | 'responses' | 'actionPlans' | 'trends'

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

export function SurveysPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const role = myCompanies.find((c) => c.company.id === companyId)?.membership.role ?? ''
  const canManage = role === 'company_admin' || role === 'compensation_analytics' || role === 'hr_ops'
  const isHrOps = role === 'hr_ops'
  const isEmployee = role === 'employee'
  const canViewAllResponses = canManage
  const showAllTabs = !isEmployee

  const [mainTab, setMainTab] = useState<MainTab>(isEmployee ? 'surveys' : 'surveys')
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
  const [planAssigneeId, setPlanAssigneeId] = useState('')
  const [planDue, setPlanDue] = useState('')
  const [planStatus, setPlanStatus] = useState('open')

  /* Employee respond */
  const [respondSurveyId, setRespondSurveyId] = useState<string | null>(null)
  const [respondAnswers, setRespondAnswers] = useState<Record<string, string>>({})

  /* Trends filter */
  const [trendQuestionKey, setTrendQuestionKey] = useState('')

  const [surveyTemplates, setSurveyTemplates] = useState<SurveyTemplate[]>([])
  const [deleteSurveyId, setDeleteSurveyId] = useState<string | null>(null)

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
  }, [companyId, planSurveyId, canManage, isHrOps, mainTab])

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
    if (!companyId || !canManage || !planSurveyId) return
    setPending(true)
    setError(null)
    try {
      await createActionPlan(companyId, planSurveyId, {
        title: planTitle.trim(),
        description: planDescription.trim() || null,
        assignee_employee_id: planAssigneeId || null,
        due_date: planDue.trim() || null,
        status: planStatus,
      })
      setPlanTitle('')
      setPlanDescription('')
      setPlanAssigneeId('')
      setPlanDue('')
      setPlanStatus('open')
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

  return (
    <div className={styles.org}>
      <p className={styles.flowHint}>
        <strong>Engagement &amp; Surveys</strong> — create pulse surveys, collect structured responses, analyze results, define
        action plans, and track satisfaction (rating questions) over time.
      </p>

      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabBtn} ${mainTab === 'surveys' ? styles.tabBtnActive : ''}`}
          onClick={() => setMainTab('surveys')}
        >
          Surveys
        </button>
        {showAllTabs ? (
          <>
            <button
              type="button"
              className={`${styles.tabBtn} ${mainTab === 'responses' ? styles.tabBtnActive : ''}`}
              onClick={() => setMainTab('responses')}
            >
              Responses &amp; analysis
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${mainTab === 'actionPlans' ? styles.tabBtnActive : ''}`}
              onClick={() => setMainTab('actionPlans')}
            >
              Action plans
            </button>
          </>
        ) : null}
        <button
          type="button"
          className={`${styles.tabBtn} ${mainTab === 'trends' ? styles.tabBtnActive : ''}`}
          onClick={() => setMainTab('trends')}
        >
          Satisfaction trends
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {mainTab === 'surveys' ? (
        <>
          {canManage ? (
            <>
              {surveyTemplates.length > 0 ? (
                <section className={styles.card} style={{ marginBottom: '1rem' }}>
                  <h3 className={styles.h3}>Start from a template</h3>
                  <p className={styles.flowHint}>
                    Choose a template to pre-fill title, type, and questions. Edit anything before saving as draft.
                  </p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(11rem, 1fr))',
                      gap: '0.75rem',
                    }}
                  >
                    {surveyTemplates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => applySurveyTemplate(t)}
                        className={styles.card}
                        style={{
                          textAlign: 'left',
                          cursor: 'pointer',
                          padding: '1rem',
                          border: '1px solid var(--border)',
                          background: 'var(--panel, #fff)',
                        }}
                      >
                        <strong style={{ display: 'block' }}>{t.title}</strong>
                        <span className={styles.muted} style={{ fontSize: '0.8125rem' }}>
                          {t.questions.length} questions · {t.survey_type === 'standard' ? 'Standard' : 'Pulse'}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
              <section className={styles.card}>
              <h3 className={styles.h3}>Create survey</h3>
              <p className={styles.flowHint}>
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
                    Questions
                  </p>
                  {newQuestions.map((q, idx) => (
                    <div key={q.id} className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'flex-end' }}>
                      <label className={styles.hint} style={{ flex: '1 1 12rem' }}>
                        Text
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
            </>
          ) : null}

          <section className={styles.card} style={{ marginTop: '1rem' }}>
            <h3 className={styles.h3}>All surveys</h3>
            {loading ? (
              <p className={styles.muted}>Loading…</p>
            ) : surveys.length === 0 ? (
              <p className={styles.muted}>No surveys yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Responses</th>
                      <th className={styles.tableCellActions}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surveys.map((s) => (
                      <tr key={s.id}>
                        <td>{s.title}</td>
                        <td>{surveyTypeLabel(s.survey_type)}</td>
                        <td>{s.status}</td>
                        <td>{s.start_date ?? '—'}</td>
                        <td>{s.end_date ?? '—'}</td>
                        <td>{responseCountForSurvey(s.id, responses)}</td>
                        <td className={styles.tableCellActions}>
                          {canManage && s.status === 'draft' ? (
                            <>
                              <button type="button" className={styles.btnSm} disabled={pending} onClick={() => void publishSurvey(s.id)}>
                                Publish
                              </button>{' '}
                              <button type="button" className={styles.linkBtn} onClick={() => beginEditDraft(s)}>
                                Edit draft
                              </button>{' '}
                              <button type="button" className={styles.linkBtn} onClick={() => setDeleteSurveyId(s.id)}>
                                Delete
                              </button>
                            </>
                          ) : null}
                          {canManage && s.status === 'active' ? (
                            <button type="button" className={styles.btnSm} disabled={pending} onClick={() => void closeSurvey(s.id)}>
                              Close
                            </button>
                          ) : null}
                          {(canManage || isHrOps) && (s.status === 'active' || s.status === 'closed') ? (
                            <>
                              {' '}
                              <button
                                type="button"
                                className={styles.linkBtn}
                                onClick={() => {
                                  setAnalysisSurveyId(s.id)
                                  setMainTab('responses')
                                }}
                              >
                                Analysis
                              </button>
                              {' '}
                              <button
                                type="button"
                                className={styles.linkBtn}
                                onClick={() => {
                                  setPlanSurveyId(s.id)
                                  setMainTab('actionPlans')
                                }}
                              >
                                Action plans
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                  <div key={q.id} className={styles.inline} style={{ flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'flex-end' }}>
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

          {isEmployee ? (
            <section className={styles.card} style={{ marginTop: '1rem' }}>
              <h3 className={styles.h3}>Respond to a survey</h3>
              {!myEmployee ? (
                <p className={styles.muted}>No employee profile linked to your account. Ask an admin to link your user to an employee record.</p>
              ) : activeSurveysForEmployee.length === 0 ? (
                <p className={styles.muted}>There are no active surveys right now.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {activeSurveysForEmployee.map((s) => {
                    const done = employeeRespondedIds.has(s.id)
                    return (
                      <li key={s.id} className={styles.card} style={{ marginBottom: '0.75rem', padding: '1rem' }}>
                        <strong>{s.title}</strong>
                        <span className={styles.muted}> · {surveyTypeLabel(s.survey_type)}</span>
                        {done ? (
                          <p className={styles.hint} style={{ marginTop: '0.5rem' }}>
                            Submitted — thank you.
                          </p>
                        ) : (
                          <div style={{ marginTop: '0.5rem' }}>
                            {respondSurveyId === s.id ? null : (
                              <button type="button" className={styles.btnSm} onClick={() => setRespondSurveyId(s.id)}>
                                Respond
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              {respondSurveyId && respondSurvey && myEmployee ? (
                <div className={styles.card} style={{ marginTop: '1rem', padding: '1rem', border: '1px solid var(--border)' }}>
                  <h4 className={styles.h3}>{respondSurvey.title}</h4>
                  {respondQuestions.map((q) => (
                    <div key={q.id} style={{ marginBottom: '1rem' }}>
                      <div className={styles.hint}>
                        {q.text}
                        {q.required ? <span className={styles.error}> *</span> : null}
                        {q.type === 'rating_1_5' ? (
                          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                            {[1, 2, 3, 4, 5].map((n) => {
                              const selected = respondAnswers[q.id] === String(n)
                              return (
                                <button
                                  key={n}
                                  type="button"
                                  className={styles.btnSm}
                                  style={{
                                    width: 40,
                                    height: 40,
                                    minWidth: 40,
                                    padding: 0,
                                    borderRadius: '50%',
                                    fontWeight: 700,
                                    lineHeight: 1,
                                    border: selected ? '2px solid var(--accent, #148F77)' : '1px solid var(--border)',
                                    background: selected ? 'var(--accent, #148F77)' : 'transparent',
                                    color: selected ? '#fff' : 'inherit',
                                  }}
                                  onClick={() => setRespondAnswers((prev) => ({ ...prev, [q.id]: String(n) }))}
                                >
                                  {n}
                                </button>
                              )
                            })}
                          </div>
                        ) : null}
                        {q.type === 'yes_no' ? (
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                            {(['yes', 'no'] as const).map((yn) => {
                              const selected = respondAnswers[q.id] === yn
                              return (
                                <button
                                  key={yn}
                                  type="button"
                                  className={styles.btnSm}
                                  style={{
                                    minWidth: '5rem',
                                    border: selected ? '2px solid var(--accent, #148F77)' : '1px solid var(--border)',
                                    background: selected ? 'rgba(20, 143, 119, 0.12)' : 'transparent',
                                    fontWeight: selected ? 600 : 400,
                                  }}
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
                              style={{ minHeight: 72, marginTop: '0.4rem' }}
                              value={respondAnswers[q.id] ?? ''}
                              onChange={(e) => setRespondAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                            />
                            <span className={styles.muted} style={{ fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>
                              {(respondAnswers[q.id] ?? '').length} characters
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  <div className={styles.inline} style={{ gap: '0.5rem' }}>
                    <button type="button" className={styles.btnSm} disabled={pending} onClick={() => void submitEmployeeResponse()}>
                      Submit response
                    </button>
                    <button type="button" className={styles.btnSm} onClick={() => { setRespondSurveyId(null); setRespondAnswers({}) }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {mainTab === 'responses' && showAllTabs ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Responses &amp; analysis</h3>
          <p className={styles.flowHint}>
            Pick a survey. Response rate uses <strong>total employees in the company</strong> as the denominator (approximate reach).
          </p>
          <label className={styles.hint} style={{ display: 'block', marginBottom: '1rem' }}>
            Survey
            <select className={styles.input} value={analysisSurveyId} onChange={(e) => setAnalysisSurveyId(e.target.value)}>
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
              <div
                style={{
                  display: 'flex',
                  gap: '1.5rem',
                  flexWrap: 'wrap',
                  marginBottom: '1.25rem',
                  padding: '1rem',
                  background: 'rgba(0,0,0,0.03)',
                  borderRadius: 8,
                }}
              >
                <div>
                  <div className={styles.muted} style={{ fontSize: '0.75rem' }}>
                    Responses
                  </div>
                  <strong style={{ fontSize: '1.5rem' }}>{analysisResponses.length}</strong>
                </div>
                <div>
                  <div className={styles.muted} style={{ fontSize: '0.75rem' }}>
                    Approx. response rate
                  </div>
                  <strong style={{ fontSize: '1.5rem' }}>{responseRatePct}%</strong>
                </div>
              </div>

              <p style={{ marginTop: '0.75rem' }}>
                <strong>
                  {analysisResponses.length} of {eligibleHeadcount} employees responded
                </strong>
              </p>
              {lowResponseWarning ? (
                <p className={styles.error} style={{ marginTop: '0.5rem', maxWidth: '40rem' }}>
                  Low response rate (below 50%). Consider reminders, shortening the form, or extending the window.
                </p>
              ) : null}

              {questionStats.map((row) => (
                <div key={row.q.id} className={styles.card} style={{ marginBottom: '1rem', padding: '1rem' }}>
                  <h4 className={styles.h3}>{row.q.text}</h4>
                  <p className={styles.muted} style={{ fontSize: '0.8125rem' }}>
                    Type: {row.q.type}
                  </p>
                  {row.kind === 'rating' ? (
                    <>
                      <p>
                        <strong>Average:</strong> {row.avg ? row.avg.toFixed(2) : '—'} / 5
                      </p>
                      <div style={{ marginTop: '0.5rem' }}>
                        {row.dist.map(({ star, count }) => {
                          const max = Math.max(1, ...row.dist.map((d) => d.count))
                          const w = (count / max) * 100
                          return (
                            <div key={star} className={styles.inline} style={{ alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                              <span style={{ width: '4rem', fontSize: '0.8125rem' }}>{star}</span>
                              <div style={{ flex: 1, height: 10, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ width: `${w}%`, height: '100%', background: 'var(--accent, #148F77)' }} />
                              </div>
                              <span style={{ width: '2rem', fontSize: '0.8125rem' }}>{count}</span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : null}
                  {row.kind === 'yesno' ? (
                    <div className={styles.inline} style={{ width: '100%', maxWidth: '28rem', height: 24, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${row.yesPct}%`, background: '#148F77', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem' }}>
                        Yes {row.yesPct.toFixed(0)}%
                      </div>
                      <div style={{ width: `${row.noPct}%`, background: '#5d6d7e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem' }}>
                        No {row.noPct.toFixed(0)}%
                      </div>
                    </div>
                  ) : null}
                  {row.kind === 'text' ? (
                    <div style={{ maxHeight: 200, overflow: 'auto', fontSize: '0.875rem' }}>
                      {row.texts.length === 0 ? (
                        <p className={styles.muted}>No text answers.</p>
                      ) : (
                        <ul>
                          {row.texts.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
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

      {mainTab === 'actionPlans' && showAllTabs ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Action plans</h3>
          <p className={styles.flowHint}>Create follow-up items tied to a survey. Assign an employee and track status.</p>
          <label className={styles.hint} style={{ display: 'block', marginBottom: '1rem' }}>
            Survey
            <select className={styles.input} value={planSurveyId} onChange={(e) => setPlanSurveyId(e.target.value)}>
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>

          {canManage ? (
            <form onSubmit={onCreateActionPlan} className={styles.positionForm} style={{ marginBottom: '1.5rem' }}>
              <label className={styles.hint}>
                Title
                <input className={styles.input} value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} required />
              </label>
              <label className={styles.hint} style={{ flex: '1 1 100%' }}>
                Description (optional)
                <textarea className={styles.input} style={{ minHeight: 64 }} value={planDescription} onChange={(e) => setPlanDescription(e.target.value)} />
              </label>
              <label className={styles.hint}>
                Assignee
                <select className={styles.input} value={planAssigneeId} onChange={(e) => setPlanAssigneeId(e.target.value)}>
                  <option value="">—</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {employeeLabel(e)} ({e.employee_code})
                    </option>
                  ))}
                </select>
              </label>
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
              <button type="submit" className={styles.btnSm} disabled={pending || !planSurveyId}>
                Add action plan
              </button>
            </form>
          ) : (
            <p className={styles.flowHint}>
              <strong>View only</strong> — action plans are created by company admin or compensation analytics.
            </p>
          )}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Assignee</th>
                  <th>Due</th>
                  <th>Status</th>
                  {canManage || isHrOps ? <th className={styles.tableCellActions}>Update</th> : null}
                </tr>
              </thead>
              <tbody>
                {actionPlans.length === 0 ? (
                  <tr>
                    <td colSpan={canManage || isHrOps ? 5 : 4} className={styles.muted}>
                      No action plans for this survey.
                    </td>
                  </tr>
                ) : (
                  actionPlans.map((p) => {
                    const assignee = p.assignee_employee_id ? employees.find((e) => e.id === p.assignee_employee_id) : null
                    return (
                      <tr key={p.id}>
                        <td>{p.title}</td>
                        <td>{assignee ? employeeLabel(assignee) : '—'}</td>
                        <td>{p.due_date ?? '—'}</td>
                        <td>{p.status}</td>
                        {canManage || isHrOps ? (
                          <td className={styles.tableCellActions}>
                            <select
                              className={styles.input}
                              value={p.status}
                              disabled={pending}
                              onChange={(e) => void patchPlanStatus(p.id, e.target.value)}
                            >
                              <option value="open">Open</option>
                              <option value="in_progress">In progress</option>
                              <option value="done">Done</option>
                            </select>
                          </td>
                        ) : null}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {mainTab === 'trends' ? (
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
            <p className={styles.muted}>No rating responses yet across active/closed surveys.</p>
          ) : (
            <>
              {companyWideAvgBenchmark != null ? (
                <p className={styles.muted} style={{ marginBottom: '1rem', maxWidth: '40rem' }}>
                  <strong>Company-wide average</strong> (benchmark across the surveys below):{' '}
                  <strong>{companyWideAvgBenchmark.toFixed(2)} / 5</strong>. The dashed line marks this average on each bar.
                </p>
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {trendData.map((row) => {
                  const w = (row.avg / 5) * 100
                  const benchPct = companyWideAvgBenchmark != null ? (companyWideAvgBenchmark / 5) * 100 : null
                  return (
                    <div key={row.surveyId}>
                      <div className={styles.inline} style={{ justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.875rem' }}>
                          <strong>{row.title}</strong>
                          <span className={styles.muted}> · {row.label}</span>
                        </span>
                        <span style={{ fontSize: '0.875rem' }}>{row.avg.toFixed(2)} / 5</span>
                      </div>
                      <div style={{ position: 'relative', height: 14, marginBottom: 4 }}>
                        <div
                          style={{
                            height: 14,
                            background: 'var(--border)',
                            borderRadius: 6,
                            overflow: 'hidden',
                          }}
                        >
                          <div style={{ width: `${w}%`, height: '100%', background: '#1B4F72', borderRadius: '6px 0 0 6px' }} />
                        </div>
                        {benchPct != null ? (
                          <div
                            title={`Company average ${companyWideAvgBenchmark!.toFixed(2)} / 5`}
                            style={{
                              position: 'absolute',
                              left: `${benchPct}%`,
                              top: -3,
                              bottom: -3,
                              width: 0,
                              borderLeft: '2px dashed #c0392b',
                              pointerEvents: 'none',
                              zIndex: 1,
                            }}
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
