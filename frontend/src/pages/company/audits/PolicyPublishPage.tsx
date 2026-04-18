import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import { createPolicy } from '../../../api/auditsApi'
import { canListAllActivityLogs } from '../../../company/navConfig'
import styles from '../CompanyWorkspacePage.module.css'
import auditStyles from './Audits.module.css'

export function PolicyPublishPage() {
  const { companyId = '' } = useParams()
  const { myCompanies } = useAuth()
  const membership = useMemo(
    () => myCompanies.find((c) => c.company.id === companyId)?.membership,
    [myCompanies, companyId],
  )
  const isHr = membership ? canListAllActivityLogs(membership.role) : false

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!companyId || !file || !title.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await createPolicy(companyId, title.trim(), description.trim() || null, file)
      setDone(true)
      setTitle('')
      setDescription('')
      setFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isHr) {
    return (
      <div className={styles.org}>
        <section className={styles.card}>
          <h3 className={styles.h3}>Publish policy</h3>
          <p className={styles.error}>You do not have access to publish policies.</p>
          <Link to={`/company/${companyId}/audits/policies`}>Back to policy documents</Link>
        </section>
      </div>
    )
  }

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>Publish policy</h3>
        <p className={styles.hint}>
          Upload a policy file. Every active member receives an inbox task to download and acknowledge. Acknowledgments
          appear in audit trails.{' '}
          <Link to={`/company/${companyId}/audits/policies`}>View policy documents</Link>
        </p>
        {done ? (
          <p className={styles.hint} style={{ marginBottom: '1rem' }}>
            Policy published. Members have been notified in their inbox.
          </p>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <form onSubmit={onCreate} className={auditStyles.publishForm}>
          <label className={styles.labelBlock}>
            Title
            <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className={styles.labelBlock}>
            Description (optional)
            <textarea className={styles.textarea} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className={styles.labelBlock}>
            Document file
            <input
              className={styles.input}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </label>
          <div>
            <button type="submit" className={styles.btnSm} disabled={submitting || !file}>
              {submitting ? 'Publishing…' : 'Publish policy'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
