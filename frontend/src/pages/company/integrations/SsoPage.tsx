import { useEffect, useState } from 'react'
import * as ssoApi from '../../../api/ssoApi'
import type { OidcAuthorizeStubResponse, SsoProviderInfo } from '../../../api/types'
import styles from '../CompanyWorkspacePage.module.css'

export function SsoPage() {
  const [providers, setProviders] = useState<SsoProviderInfo[]>([])
  const [google, setGoogle] = useState<OidcAuthorizeStubResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void ssoApi
      .listSsoProviders()
      .then(setProviders)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
    void ssoApi
      .getGoogleOidcStub()
      .then(setGoogle)
      .catch(() => {})
  }, [])

  return (
    <div className={styles.org}>
      {error ? <p className={styles.error}>{error}</p> : null}
      <section className={styles.card}>
        <h3 className={styles.h3}>Providers (stubs)</h3>
        <ul className={styles.ul}>
          {providers.map((p) => (
            <li key={p.id}>
              {p.name} — <span className={styles.muted}>{p.status}</span>
            </li>
          ))}
        </ul>
      </section>
      {google ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Google OIDC (contract)</h3>
          <p>{google.message}</p>
          <p className={styles.muted}>Template URL:</p>
          <pre className={styles.muted} style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
            {google.authorization_url_template}
          </pre>
          <p className={styles.muted}>Required env: {google.required_env.join(', ')}</p>
        </section>
      ) : null}
      <section className={styles.card}>
        <h3 className={styles.h3}>SAML ACS</h3>
        <p className={styles.muted}>
          POST <code>/api/v1/auth/sso/saml/acs</code> returns <code>501</code> until a SAML library is wired.
        </p>
      </section>
    </div>
  )
}
