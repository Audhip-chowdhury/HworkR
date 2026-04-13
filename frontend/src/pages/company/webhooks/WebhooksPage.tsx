import { FormEvent, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as webhooksApi from '../../../api/webhooksApi'
import type { WebhookSubscription } from '../../../api/types'
import styles from '../CompanyWorkspacePage.module.css'

export function WebhooksPage() {
  const { companyId = '' } = useParams()
  const [rows, setRows] = useState<WebhookSubscription[]>([])
  const [error, setError] = useState<string | null>(null)

  const [url, setUrl] = useState('https://example.com/webhook')
  const [secret, setSecret] = useState('devsecret123456')
  const [eventsText, setEventsText] = useState('ping,certificate.issued')

  async function refresh() {
    if (!companyId) return
    setError(null)
    try {
      const list = await webhooksApi.listWebhookSubscriptions(companyId)
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    }
  }

  useEffect(() => {
    void refresh()
  }, [companyId])

  async function createSub(e: FormEvent) {
    e.preventDefault()
    if (!companyId) return
    setError(null)
    try {
      const events = eventsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      await webhooksApi.createWebhookSubscription(companyId, {
        url,
        secret,
        events,
        is_active: true,
      })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function toggle(row: WebhookSubscription, active: boolean) {
    if (!companyId) return
    try {
      await webhooksApi.patchWebhookSubscription(companyId, row.id, { is_active: active })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function sendTest(row: WebhookSubscription) {
    if (!companyId) return
    try {
      await webhooksApi.testWebhookSubscription(companyId, row.id, {
        event_type: 'ping',
        data: { source: 'hworkr-ui' },
      })
      alert('Test delivery queued (check your receiver and backend delivery logs).')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>New subscription</h3>
        {error ? <p className={styles.error}>{error}</p> : null}
        <form onSubmit={createSub} className={styles.positionForm}>
          <label className={styles.labelBlock}>
            URL
            <input className={styles.input} value={url} onChange={(e) => setUrl(e.target.value)} required />
          </label>
          <label className={styles.labelBlock}>
            Secret
            <input className={styles.input} value={secret} onChange={(e) => setSecret(e.target.value)} required />
          </label>
          <label className={styles.labelBlock}>
            Events (comma-separated; empty = all)
            <input className={styles.input} value={eventsText} onChange={(e) => setEventsText(e.target.value)} />
          </label>
          <button type="submit" className={styles.btnSm}>
            Create
          </button>
        </form>
      </section>

      <section className={styles.card}>
        <h3 className={styles.h3}>Subscriptions</h3>
        <ul className={styles.ul}>
          {rows.map((r) => (
            <li key={r.id}>
              <strong>{r.url}</strong> — {r.is_active ? 'active' : 'off'}
              <div className={styles.inline}>
                <button type="button" className={styles.btnSm} onClick={() => void sendTest(r)}>
                  Test ping
                </button>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => void toggle(r, !r.is_active)}
                >
                  {r.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
              <pre className={styles.muted} style={{ fontSize: '0.75rem', overflow: 'auto' }}>
                {(r.events_json ?? []).join(', ') || '(all events)'}
              </pre>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
