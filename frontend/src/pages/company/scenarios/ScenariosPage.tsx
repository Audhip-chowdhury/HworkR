import { FormEvent, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as scenariosApi from '../../../api/scenariosApi'
import type { ScenarioRun } from '../../../api/types'
import styles from '../CompanyWorkspacePage.module.css'

export function ScenariosPage() {
  const { companyId = '' } = useParams()
  const [result, setResult] = useState<ScenarioRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leave, setLeave] = useState(false)
  const [app, setApp] = useState(false)
  const [inbox, setInbox] = useState(true)
  const [postingId, setPostingId] = useState('')
  const [notes, setNotes] = useState('')

  async function run(e: FormEvent) {
    e.preventDefault()
    if (!companyId) return
    setError(null)
    try {
      const runRow = await scenariosApi.generateScenario(companyId, {
        create_leave_request: leave,
        create_job_application: app,
        create_inbox_task_for_hr: inbox,
        posting_id: postingId || null,
        notes: notes || null,
      })
      setResult(runRow)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>Generate scenario</h3>
        <p className={styles.muted}>Creates synthetic HR signals for demos (per backend rules).</p>
        {error ? <p className={styles.error}>{error}</p> : null}
        <form onSubmit={run} className={styles.positionForm}>
          <label className={styles.radio}>
            <input type="checkbox" checked={leave} onChange={(e) => setLeave(e.target.checked)} />
            Create leave request (needs employee profile)
          </label>
          <label className={styles.radio}>
            <input type="checkbox" checked={app} onChange={(e) => setApp(e.target.checked)} />
            Create job application
          </label>
          <label className={styles.labelBlock}>
            Posting ID (if application)
            <input className={styles.input} value={postingId} onChange={(e) => setPostingId(e.target.value)} />
          </label>
          <label className={styles.radio}>
            <input type="checkbox" checked={inbox} onChange={(e) => setInbox(e.target.checked)} />
            Create inbox task for you
          </label>
          <label className={styles.labelBlock}>
            Notes
            <input className={styles.input} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <button type="submit" className={styles.btnSm}>
            Run
          </button>
        </form>
        {result ? (
          <pre className={styles.muted} style={{ marginTop: '1rem', fontSize: '0.8rem' }}>
            {JSON.stringify(result.result_json, null, 2)}
          </pre>
        ) : null}
      </section>
    </div>
  )
}
