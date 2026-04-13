import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import * as workflowApi from '../../../api/workflowApi'
import type { WorkflowInstance, WorkflowTemplate } from '../../../api/types'
import styles from '../CompanyWorkspacePage.module.css'

export function WorkflowsPage() {
  const { companyId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [instances, setInstances] = useState<WorkflowInstance[]>([])
  const [error, setError] = useState<string | null>(null)

  const entityType = searchParams.get('entity_type') ?? ''
  const entityId = searchParams.get('entity_id') ?? ''
  const statusFilter = searchParams.get('status_filter') ?? ''

  async function load() {
    if (!companyId) return
    setError(null)
    try {
      const [t, i] = await Promise.all([
        workflowApi.listWorkflowTemplates(companyId),
        workflowApi.listWorkflowInstances(companyId, {
          entity_type: entityType || undefined,
          entity_id: entityId || undefined,
          status_filter: statusFilter || undefined,
        }),
      ])
      setTemplates(t)
      setInstances(i)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => {
    void load()
  }, [companyId, entityType, entityId, statusFilter])

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>Workflow templates</h3>
        {error ? <p className={styles.error}>{error}</p> : null}
        <ul className={styles.ul}>
          {templates.map((t) => (
            <li key={t.id}>
              {t.name} <span className={styles.muted}>({t.module})</span>
            </li>
          ))}
        </ul>
        {templates.length === 0 ? <p className={styles.muted}>No templates yet.</p> : null}
      </section>

      <section className={styles.card}>
        <h3 className={styles.h3}>Instances</h3>
        <p className={styles.muted}>
          Filter via URL query: <code>?entity_type=requisition&entity_id=…&status_filter=active</code>
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Entity</th>
                <th>Status</th>
                <th>Step</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {instances.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.muted}>
                    No instances match.
                  </td>
                </tr>
              ) : (
                instances.map((inst) => (
                  <tr key={inst.id}>
                    <td>
                      {inst.entity_type} / {inst.entity_id}
                    </td>
                    <td>{inst.status}</td>
                    <td>{inst.current_step}</td>
                    <td>
                      <Link className={styles.linkBtn} to={`/company/${companyId}/workflows/${inst.id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
