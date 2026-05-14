import { useParams } from 'react-router-dom'
import { LegalChatbot } from './LegalChatbot'
import styles from '../CompanyWorkspacePage.module.css'

export function LegalPage() {
  const { companyId = '' } = useParams()

  return (
    <section className={styles.card}>
      <h3 className={styles.h3}>Legal assistant (India)</h3>
      <p className={styles.muted} style={{ marginTop: 0 }}>
        Informational only — not legal advice. Answers are grounded in documents you ingest into the vector store;
        always consult a qualified lawyer for specific cases.
      </p>
      <LegalChatbot companyId={companyId} />
    </section>
  )
}
