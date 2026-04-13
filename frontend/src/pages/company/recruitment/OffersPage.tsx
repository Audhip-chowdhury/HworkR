import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { createOffer, listApplications, listOffers } from '../../../api/recruitmentApi'
import styles from '../CompanyWorkspacePage.module.css'

export function OffersPage() {
  const { companyId = '' } = useParams()
  const [apps, setApps] = useState<any[]>([])
  const [offers, setOffers] = useState<any[]>([])
  const [applicationId, setApplicationId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [compJson, setCompJson] = useState('{"base": 0}')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [a, o] = await Promise.all([listApplications(companyId), listOffers(companyId)])
      setApps(a)
      setOffers(o)
      if (!applicationId && a[0]) setApplicationId(a[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load offers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [companyId])

  async function onCreate() {
    if (!companyId || !applicationId) return
    setPending(true)
    setError(null)
    try {
      const compensation = JSON.parse(compJson) as Record<string, unknown>
      await createOffer(companyId, { application_id: applicationId, start_date: startDate || null, compensation_json: compensation })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid compensation JSON')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className={styles.card}>
      <h3 className={styles.h3}>Offers</h3>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.positionForm}>
        <select className={styles.input} value={applicationId} onChange={(e) => setApplicationId(e.target.value)}>
          <option value="">Select application</option>
          {apps.map((a) => <option key={a.id} value={a.id}>{a.posting_title ?? a.id.slice(0, 8)}</option>)}
        </select>
        <input className={styles.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <textarea className={styles.input} style={{ minHeight: 90 }} value={compJson} onChange={(e) => setCompJson(e.target.value)} />
        <button className={styles.btnSm} disabled={pending} onClick={() => void onCreate()}>{pending ? 'Creating…' : 'Create offer'}</button>
      </div>
      {loading ? <p className={styles.muted}>Loading offers…</p> : null}
      {!loading && offers.length === 0 ? <p className={styles.muted}>No offers yet.</p> : null}
      {offers.map((o) => <p key={o.id} className={styles.muted}>{o.status} · {o.posting_title ?? o.application_id.slice(0, 8)}</p>)}
    </section>
  )
}
