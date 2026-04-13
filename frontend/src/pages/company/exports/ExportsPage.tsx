import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { downloadExport } from '../../../api/exportsApi'
import styles from '../CompanyWorkspacePage.module.css'

export function ExportsPage() {
  const { companyId = '' } = useParams()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function dl(path: string, filename: string) {
    if (!companyId) return
    setError(null)
    setPending(true)
    try {
      await downloadExport(companyId, path, filename)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>CSV exports</h3>
        {error ? <p className={styles.error}>{error}</p> : null}
        <p className={styles.muted}>Downloads use your session token (same as API calls).</p>
        <div className={styles.formRow} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
          <button
            type="button"
            className={styles.btnSm}
            disabled={pending}
            onClick={() => void dl('/analytics/export/employees.csv', 'employees.csv')}
          >
            Employees
          </button>
          <button
            type="button"
            className={styles.btnSm}
            disabled={pending}
            onClick={() => void dl('/exports/recruitment/applications.csv', 'applications.csv')}
          >
            Applications
          </button>
          <button
            type="button"
            className={styles.btnSm}
            disabled={pending}
            onClick={() => void dl('/exports/recruitment/requisitions.csv', 'requisitions.csv')}
          >
            Requisitions
          </button>
          <button
            type="button"
            className={styles.btnSm}
            disabled={pending}
            onClick={() => void dl('/exports/recruitment/offers.csv', 'offers.csv')}
          >
            Offers
          </button>
          <button
            type="button"
            className={styles.btnSm}
            disabled={pending}
            onClick={() => void dl('/exports/leave/requests.csv', 'leave-requests.csv')}
          >
            Leave requests
          </button>
          <button
            type="button"
            className={styles.btnSm}
            disabled={pending}
            onClick={() => void dl('/exports/learning/training-assignments.csv', 'training-assignments.csv')}
          >
            Training assignments
          </button>
          <button
            type="button"
            className={styles.btnSm}
            disabled={pending}
            onClick={() => void dl('/exports/learning/training-completions.csv', 'training-completions.csv')}
          >
            Training completions
          </button>
        </div>
      </section>
    </div>
  )
}
