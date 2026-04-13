import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { createSurvey, createSurveyResponse, listSurveyResponses, listSurveys } from '../../../api/compensationApi'
import styles from '../CompanyWorkspacePage.module.css'

type Tab = 'surveys' | 'responses'

export function SurveysPage() {
  const { companyId = '' } = useParams()
  const [tab, setTab] = useState<Tab>('surveys')
  const [surveys, setSurveys] = useState<any[]>([])
  const [responses, setResponses] = useState<any[]>([])
  const [surveyTitle, setSurveyTitle] = useState('')
  const [surveyStatus, setSurveyStatus] = useState('draft')
  const [questionsJson, setQuestionsJson] = useState('{"q1":"How satisfied are you?"}')
  const [selectedSurveyId, setSelectedSurveyId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [answerText, setAnswerText] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [s, r] = await Promise.all([listSurveys(companyId), listSurveyResponses(companyId)])
      setSurveys(s)
      setResponses(r)
      if (!selectedSurveyId && s[0]) setSelectedSurveyId(s[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load surveys')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [companyId])

  async function onCreateSurvey() {
    setPending(true)
    setError(null)
    try {
      await createSurvey(companyId, {
        title: surveyTitle || `Survey ${Date.now()}`,
        status: surveyStatus,
        questions_json: JSON.parse(questionsJson),
      })
      setSurveyTitle('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid questions JSON')
    } finally {
      setPending(false)
    }
  }

  async function onSubmitResponse() {
    if (!selectedSurveyId || !employeeId) return
    setPending(true)
    try {
      await createSurveyResponse(companyId, {
        survey_id: selectedSurveyId,
        employee_id: employeeId,
        answers_json: { response: answerText },
      })
      setAnswerText('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit response')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={styles.org}>
      <div className={styles.tabBar}>
        <button className={`${styles.tabBtn} ${tab === 'surveys' ? styles.tabBtnActive : ''}`} onClick={() => setTab('surveys')}>Surveys</button>
        <button className={`${styles.tabBtn} ${tab === 'responses' ? styles.tabBtnActive : ''}`} onClick={() => setTab('responses')}>Responses</button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {tab === 'surveys' ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Surveys</h3>
          <div className={styles.positionForm}>
            <input className={styles.input} placeholder="Survey title" value={surveyTitle} onChange={(e) => setSurveyTitle(e.target.value)} />
            <select className={styles.input} value={surveyStatus} onChange={(e) => setSurveyStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
            <textarea className={styles.input} style={{ minHeight: 100 }} value={questionsJson} onChange={(e) => setQuestionsJson(e.target.value)} />
            <button className={styles.btnSm} disabled={pending} onClick={() => void onCreateSurvey()}>{pending ? 'Creating…' : 'Create survey'}</button>
          </div>
          {loading ? <p className={styles.muted}>Loading surveys…</p> : surveys.map((s) => <p key={s.id} className={styles.muted}>{s.title} ({s.status})</p>)}
        </section>
      ) : null}
      {tab === 'responses' ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Responses</h3>
          <div className={styles.inline}>
            <select className={styles.input} value={selectedSurveyId} onChange={(e) => setSelectedSurveyId(e.target.value)}>
              <option value="">Select survey</option>
              {surveys.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <input className={styles.input} placeholder="Employee id" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
            <input className={styles.input} placeholder="Answer" value={answerText} onChange={(e) => setAnswerText(e.target.value)} />
            <button className={styles.btnSm} disabled={pending} onClick={() => void onSubmitResponse()}>Submit response</button>
          </div>
          {responses.map((r) => <p key={r.id} className={styles.muted}>{r.survey_id.slice(0, 8)}… by {r.employee_id.slice(0, 8)}…</p>)}
          {!loading && responses.length === 0 ? <p className={styles.muted}>No responses yet.</p> : null}
        </section>
      ) : null}
    </div>
  )
}
