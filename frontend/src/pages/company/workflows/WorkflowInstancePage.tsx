import { FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as workflowApi from '../../../api/workflowApi'
import type { WorkflowAction, WorkflowInstance } from '../../../api/types'
import styles from '../CompanyWorkspacePage.module.css'

export function WorkflowInstancePage() {
  const { companyId = '', instanceId = '' } = useParams()
  const [instance, setInstance] = useState<WorkflowInstance | null>(null)
  const [actions, setActions] = useState<WorkflowAction[]>([])
  const [comments, setComments] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function load() {
    if (!companyId || !instanceId) return
    setError(null)
    try {
      const list = await workflowApi.listWorkflowInstances(companyId)
      const inst = list.find((x) => x.id === instanceId) ?? null
      setInstance(inst)
      const act = await workflowApi.listWorkflowInstanceActions(companyId, instanceId)
      setActions(act)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => {
    void load()
  }, [companyId, instanceId])

  async function act(kind: 'approve' | 'reject') {
    if (!companyId || !instanceId) return
    setPending(true)
    setError(null)
    try {
      await workflowApi.applyWorkflowAction(companyId, instanceId, {
        action: kind,
        comments: comments.trim() || null,
      })
      setComments('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setPending(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
  }

  return (
    <div className={styles.org}>
      <p>
        <Link to={`/company/${companyId}/workflows`} className={styles.linkBtn}>
          ← All workflows
        </Link>
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}

      {instance ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Instance</h3>
          <p>
            <strong>Status:</strong> {instance.status} &nbsp; <strong>Step:</strong>{' '}
            {instance.current_step}
          </p>
          <p className={styles.muted}>
            {instance.entity_type} / {instance.entity_id}
          </p>
          {instance.status === 'active' ? (
            <form onSubmit={onSubmit} className={styles.inline}>
              <input
                className={styles.input}
                placeholder="Comments (optional)"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
              <button
                type="button"
                className={styles.btnSm}
                disabled={pending}
                onClick={() => void act('approve')}
              >
                Approve
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={pending}
                onClick={() => void act('reject')}
              >
                Reject
              </button>
            </form>
          ) : (
            <p className={styles.muted}>This workflow is complete.</p>
          )}
        </section>
      ) : (
        <p className={styles.muted}>Instance not found in list.</p>
      )}

      <section className={styles.card}>
        <h3 className={styles.h3}>Action history</h3>
        <ul className={styles.ul}>
          {actions.map((a) => (
            <li key={a.id}>
              Step {a.step}: <strong>{a.action}</strong> — {a.acted_at}
              {a.comments ? <span className={styles.muted}> — {a.comments}</span> : null}
            </li>
          ))}
        </ul>
        {actions.length === 0 ? <p className={styles.muted}>No actions yet.</p> : null}
      </section>
    </div>
  )
}
