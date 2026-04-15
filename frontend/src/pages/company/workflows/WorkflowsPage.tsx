import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import * as workflowApi from '../../../api/workflowApi'
import type { WorkflowInstance, WorkflowTemplate } from '../../../api/types'
import styles from '../CompanyWorkspacePage.module.css'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

export function WorkflowsPage() {
  const { companyId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [instances, setInstances] = useState<WorkflowInstance[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const entityType = searchParams.get('entity_type') ?? ''
  const entityId = searchParams.get('entity_id') ?? ''
  const statusFilter = searchParams.get('status_filter') ?? ''

  const [formEntityType, setFormEntityType] = useState(entityType)
  const [formEntityId, setFormEntityId] = useState(entityId)
  const [formStatus, setFormStatus] = useState(statusFilter)

  useEffect(() => {
    setFormEntityType(entityType)
    setFormEntityId(entityId)
    setFormStatus(statusFilter)
  }, [entityType, entityId, statusFilter])

  async function load() {
    if (!companyId) return
    setError(null)
    setLoading(true)
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
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [companyId, entityType, entityId, statusFilter])

  function applyInstanceFilters() {
    const next = new URLSearchParams()
    const et = formEntityType.trim()
    const eid = formEntityId.trim()
    const st = formStatus.trim()
    if (et) next.set('entity_type', et)
    if (eid) next.set('entity_id', eid)
    if (st) next.set('status_filter', st)
    setSearchParams(next)
  }

  function clearInstanceFilters() {
    setFormEntityType('')
    setFormEntityId('')
    setFormStatus('')
    setSearchParams({})
  }

  const hasActiveFilters = Boolean(entityType || entityId || statusFilter)

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
        <form
          className={styles.reqForm}
          style={{ maxWidth: 720 }}
          onSubmit={(e) => {
            e.preventDefault()
            applyInstanceFilters()
          }}
        >
          <fieldset className={styles.reqFieldset}>
            <legend className={styles.reqLegend}>Filter instances</legend>
            <div className={styles.reqFormGrid}>
              <label className={styles.labelBlock} htmlFor="wf-entity-type">
                Entity type
                <input
                  id="wf-entity-type"
                  className={styles.input}
                  style={{ width: '100%' }}
                  placeholder="e.g. requisition"
                  value={formEntityType}
                  onChange={(e) => setFormEntityType(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className={styles.labelBlock} htmlFor="wf-entity-id">
                Entity ID
                <input
                  id="wf-entity-id"
                  className={styles.input}
                  style={{ width: '100%' }}
                  placeholder="UUID of the entity"
                  value={formEntityId}
                  onChange={(e) => setFormEntityId(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className={styles.labelBlock} htmlFor="wf-status">
                Status
                <select
                  id="wf-status"
                  className={styles.input}
                  style={{ width: '100%' }}
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className={styles.reqHint}>
              Uses <code>entity_type</code>, <code>entity_id</code>, and <code>status_filter</code> (active,
              approved, rejected). Apply updates the URL so links stay shareable.
            </p>
            <div className={styles.formActions}>
              <button type="submit" className={styles.btnSm}>
                Apply filters
              </button>
              <button type="button" className={styles.btnGhost} onClick={() => clearInstanceFilters()}>
                Clear
              </button>
            </div>
          </fieldset>
        </form>

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
              {loading ? (
                <tr>
                  <td colSpan={4} className={styles.muted}>
                    Loading instances…
                  </td>
                </tr>
              ) : instances.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.muted}>
                    {hasActiveFilters ? 'No instances match these filters.' : 'No workflow instances yet.'}
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
