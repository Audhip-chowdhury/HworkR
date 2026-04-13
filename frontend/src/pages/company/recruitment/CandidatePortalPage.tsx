import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { applyToPosting, listCandidateOpenPostings, listMyApplications, listMyOffers, respondToOffer } from '../../../api/recruitmentApi'
import { useAuth } from '../../../auth/AuthContext'
import styles from '../CompanyWorkspacePage.module.css'

export function CandidatePortalPage() {
  const { companyId = '' } = useParams()
  const { user } = useAuth()
  const [open, setOpen] = useState<any[]>([])
  const [apps, setApps] = useState<any[]>([])
  const [offers, setOffers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [o, a, f] = await Promise.all([
        listCandidateOpenPostings(companyId),
        listMyApplications(companyId),
        listMyOffers(companyId),
      ])
      setOpen(o)
      setApps(a)
      setOffers(f)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load candidate portal')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [companyId])

  async function onApply(postingId: string) {
    if (!user?.id) return
    setPending(true)
    try {
      await applyToPosting(companyId, { posting_id: postingId, candidate_user_id: user.id })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply')
    } finally {
      setPending(false)
    }
  }

  async function onRespond(offerId: string, status: 'accepted' | 'declined' | 'negotiating') {
    setPending(true)
    try {
      await respondToOffer(companyId, offerId, status)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to respond')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={styles.org}>
      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.muted}>Loading portal…</p> : null}
      <section className={styles.card}>
        <h3 className={styles.h3}>Open positions</h3>
        {open.length === 0 ? <p className={styles.muted}>No open positions.</p> : null}
        {open.map((p) => <p key={p.id} className={styles.muted}>{p.title} ({p.deadline ?? 'no deadline'}) <button className={styles.linkBtn} disabled={pending} onClick={() => void onApply(p.id)}>Apply</button></p>)}
      </section>
      <section className={styles.card}>
        <h3 className={styles.h3}>My applications</h3>
        {apps.length === 0 ? <p className={styles.muted}>No applications yet.</p> : null}
        {apps.map((a) => <p key={a.id} className={styles.muted}>{a.posting_title ?? a.id.slice(0, 8)} — {a.stage}</p>)}
      </section>
      <section className={styles.card}>
        <h3 className={styles.h3}>My offers</h3>
        {offers.length === 0 ? <p className={styles.muted}>No offers yet.</p> : null}
        {offers.map((o) => (
          <p key={o.id} className={styles.muted}>
            {o.status}
            <button className={styles.linkBtn} disabled={pending} onClick={() => void onRespond(o.id, 'accepted')}>Accept</button>
            <button className={styles.linkBtn} disabled={pending} onClick={() => void onRespond(o.id, 'declined')}>Decline</button>
            <button className={styles.linkBtn} disabled={pending} onClick={() => void onRespond(o.id, 'negotiating')}>Negotiate</button>
          </p>
        ))}
      </section>
    </div>
  )
}
