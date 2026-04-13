import { FormEvent, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as trackingApi from '../../../api/trackingApi'
import { useAuth } from '../../../auth/AuthContext'
import { canListAllActivityLogs } from '../../../company/navConfig'
import type { ActivityLog, ScoreDashboard, ScoringRule } from '../../../api/types'
import styles from '../CompanyWorkspacePage.module.css'

type Tab = 'dashboard' | 'recent' | 'log' | 'rules' | 'hr_logs'

export function TrackingPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const role = myCompanies.find((c) => c.company.id === companyId)?.membership.role ?? ''
  const isAdmin = role === 'company_admin'
  const canHrList = canListAllActivityLogs(role)

  const [tab, setTab] = useState<Tab>('dashboard')
  const [dash, setDash] = useState<ScoreDashboard | null>(null)
  const [recent, setRecent] = useState<ActivityLog[]>([])
  const [rules, setRules] = useState<ScoringRule[]>([])
  const [hrLogs, setHrLogs] = useState<ActivityLog[]>([])
  const [error, setError] = useState<string | null>(null)

  const [logModule, setLogModule] = useState('manual')
  const [logAction, setLogAction] = useState('note')
  const [logDetail, setLogDetail] = useState('')
  const [refStarted, setRefStarted] = useState('')

  const [ruleModule, setRuleModule] = useState('manual')
  const [ruleAction, setRuleAction] = useState('note')
  const [ruleSla, setRuleSla] = useState('3600')

  useEffect(() => {
    if (!companyId) return
    if (tab === 'dashboard') {
      trackingApi
        .getScoreDashboard(companyId)
        .then(setDash)
        .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
    }
    if (tab === 'recent') {
      trackingApi
        .getRecentActivity(companyId)
        .then(setRecent)
        .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
    }
    if (tab === 'rules') {
      trackingApi
        .listScoringRules(companyId)
        .then(setRules)
        .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
    }
    if (tab === 'hr_logs' && canHrList) {
      trackingApi
        .listActivityLogs(companyId, { limit: 100 })
        .then(setHrLogs)
        .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
    }
  }, [companyId, tab, canHrList])

  async function submitLog(e: FormEvent) {
    e.preventDefault()
    if (!companyId) return
    setError(null)
    try {
      await trackingApi.createActivityLog(companyId, {
        module: logModule,
        action_type: logAction,
        action_detail: logDetail || null,
        reference_started_at: refStarted ? new Date(refStarted).toISOString() : null,
      })
      setLogDetail('')
      setRefStarted('')
      if (tab === 'recent') {
        const r = await trackingApi.getRecentActivity(companyId)
        setRecent(r)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function submitRule(e: FormEvent) {
    e.preventDefault()
    if (!companyId || !isAdmin) return
    setError(null)
    try {
      await trackingApi.createScoringRule(companyId, {
        module: ruleModule,
        action_type: ruleAction,
        sla_seconds: ruleSla ? Number(ruleSla) : null,
      })
      const list = await trackingApi.listScoringRules(companyId)
      setRules(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div className={styles.org}>
      <div className={styles.inline} style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
        {(
          [
            { id: 'dashboard' as const, label: 'Score dashboard' },
            { id: 'recent' as const, label: 'Recent activity' },
            { id: 'log' as const, label: 'Log activity' },
            { id: 'rules' as const, label: 'Scoring rules' },
            ...(canHrList ? [{ id: 'hr_logs' as const, label: 'All activity logs' }] : []),
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={tab === id ? styles.btnSm : styles.btnGhost}
            onClick={() => {
              setTab(id)
              setError(null)
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {tab === 'dashboard' && dash ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Your score</h3>
          <p>Overall: {dash.overall_score ?? '—'}</p>
          <p className={styles.muted}>Actions logged: {dash.action_count}</p>
          <ul className={styles.ul}>
            <li>Completeness avg: {dash.avg_completeness ?? '—'}</li>
            <li>Accuracy avg: {dash.avg_accuracy ?? '—'}</li>
            <li>Timeliness avg: {dash.avg_timeliness ?? '—'}</li>
            <li>Process adherence avg: {dash.avg_process_adherence ?? '—'}</li>
          </ul>
        </section>
      ) : null}

      {tab === 'recent' ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Recent</h3>
          <ul className={styles.ul}>
            {recent.map((a) => (
              <li key={a.id}>
                {a.module}/{a.action_type} — score {a.quality_score ?? '—'} — {a.created_at}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === 'log' ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Log activity</h3>
          <form onSubmit={submitLog} className={styles.positionForm}>
            <label className={styles.labelBlock}>
              Module
              <input className={styles.input} value={logModule} onChange={(e) => setLogModule(e.target.value)} />
            </label>
            <label className={styles.labelBlock}>
              Action type
              <input className={styles.input} value={logAction} onChange={(e) => setLogAction(e.target.value)} />
            </label>
            <label className={styles.labelBlock}>
              Detail
              <input className={styles.input} value={logDetail} onChange={(e) => setLogDetail(e.target.value)} />
            </label>
            <label className={styles.labelBlock}>
              Reference started at (optional, for SLA timeliness)
              <input
                className={styles.input}
                type="datetime-local"
                value={refStarted}
                onChange={(e) => setRefStarted(e.target.value)}
              />
            </label>
            <button type="submit" className={styles.btnSm}>
              Submit log
            </button>
          </form>
        </section>
      ) : null}

      {tab === 'rules' ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Scoring rules</h3>
          {isAdmin ? (
            <form onSubmit={submitRule} className={styles.positionForm}>
              <label className={styles.labelBlock}>
                Module
                <input className={styles.input} value={ruleModule} onChange={(e) => setRuleModule(e.target.value)} />
              </label>
              <label className={styles.labelBlock}>
                Action type
                <input className={styles.input} value={ruleAction} onChange={(e) => setRuleAction(e.target.value)} />
              </label>
              <label className={styles.labelBlock}>
                SLA seconds
                <input className={styles.input} value={ruleSla} onChange={(e) => setRuleSla(e.target.value)} />
              </label>
              <button type="submit" className={styles.btnSm}>
                Add rule
              </button>
            </form>
          ) : (
            <p className={styles.muted}>Only company admins can create scoring rules.</p>
          )}
          <ul className={styles.ul}>
            {rules.map((r) => (
              <li key={r.id}>
                {r.module}/{r.action_type} — SLA {r.sla_seconds ?? '—'}s
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === 'hr_logs' && canHrList ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Activity logs (company)</h3>
          <ul className={styles.ul}>
            {hrLogs.map((a) => (
              <li key={a.id}>
                {a.user_id.slice(0, 8)}… {a.module}/{a.action_type} — {a.created_at}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
