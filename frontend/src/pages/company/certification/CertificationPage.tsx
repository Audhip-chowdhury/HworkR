import { FormEvent, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getToken } from '../../../api/client'
import * as certApi from '../../../api/certificationApi'
import { useAuth } from '../../../auth/AuthContext'
import type { Certificate, CertProgress, CertTrack } from '../../../api/types'
import styles from '../CompanyWorkspacePage.module.css'

export function CertificationPage() {
  const { companyId = '' } = useParams()
  const { user, myCompanies } = useAuth()
  const role = myCompanies.find((c) => c.company.id === companyId)?.membership.role ?? ''
  const isAdmin = role === 'company_admin'

  const [tracks, setTracks] = useState<CertTrack[]>([])
  const [selectedTrack, setSelectedTrack] = useState('')
  const [progress, setProgress] = useState<CertProgress | null>(null)
  const [certs, setCerts] = useState<Certificate[]>([])
  const [error, setError] = useState<string | null>(null)

  const [newTrackName, setNewTrackName] = useState('Track')
  const [newTrackLevel, setNewTrackLevel] = useState('L1')
  const [newTrackRole, setNewTrackRole] = useState('general')
  const [reqJson, setReqJson] = useState('{}')

  const [progressJson, setProgressJson] = useState('{}')

  const [issueLevel, setIssueLevel] = useState('L1')
  const [issueScore, setIssueScore] = useState('80')

  async function refreshTracks() {
    if (!companyId) return
    const t = await certApi.listCertTracks(companyId)
    setTracks(t)
    if (!selectedTrack && t[0]) setSelectedTrack(t[0].id)
  }

  useEffect(() => {
    if (!companyId) return
    void refreshTracks().catch((e) => setError(e instanceof Error ? e.message : 'Error'))
  }, [companyId])

  useEffect(() => {
    if (!companyId || !selectedTrack) return
    setError(null)
    certApi
      .getMyCertProgress(companyId, selectedTrack)
      .then((p) => {
        setProgress(p)
        setProgressJson(JSON.stringify(p.completed_actions_json ?? {}, null, 2))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
  }, [companyId, selectedTrack])

  useEffect(() => {
    if (!companyId) return
    certApi
      .listMyCertificates(companyId)
      .then(setCerts)
      .catch(() => {})
  }, [companyId])

  async function createTrack(e: FormEvent) {
    e.preventDefault()
    if (!companyId || !isAdmin) return
    setError(null)
    try {
      let requirements: Record<string, unknown> | null = null
      try {
        requirements = JSON.parse(reqJson) as Record<string, unknown>
      } catch {
        throw new Error('Invalid requirements JSON')
      }
      await certApi.createCertTrack(companyId, {
        name: newTrackName,
        level: newTrackLevel,
        role_type: newTrackRole,
        requirements_json: requirements,
        min_score: 0,
      })
      await refreshTracks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function saveProgress(e: FormEvent) {
    e.preventDefault()
    if (!companyId || !selectedTrack) return
    setError(null)
    try {
      const completed = JSON.parse(progressJson) as Record<string, unknown>
      const p = await certApi.upsertMyCertProgress(companyId, selectedTrack, {
        completed_actions_json: completed,
      })
      setProgress(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function issueCert(e: FormEvent) {
    e.preventDefault()
    if (!companyId || !selectedTrack) return
    setError(null)
    try {
      await certApi.issueCertificate(companyId, {
        track_id: selectedTrack,
        level: issueLevel,
        score: Number(issueScore),
      })
      const list = await certApi.listMyCertificates(companyId)
      setCerts(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  async function openPdfPlaceholder(certId: string) {
    if (!companyId) return
    const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1'
    const token = getToken()
    const url = `${API_BASE}/companies/${companyId}/certification/certificates/${certId}/pdf`
    try {
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      const data = (await res.json()) as Record<string, string>
      alert(JSON.stringify(data, null, 2))
    } catch {
      setError('Could not load PDF placeholder')
    }
  }

  return (
    <div className={styles.org}>
      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.card}>
        <h3 className={styles.h3}>Tracks</h3>
        <label className={styles.labelBlock}>
          Select track
          <select
            className={styles.input}
            value={selectedTrack}
            onChange={(e) => setSelectedTrack(e.target.value)}
          >
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.level})
              </option>
            ))}
          </select>
        </label>
        {isAdmin ? (
          <form onSubmit={createTrack} className={styles.positionForm}>
            <h4 className={styles.h3}>New track</h4>
            <label className={styles.labelBlock}>
              Name
              <input className={styles.input} value={newTrackName} onChange={(e) => setNewTrackName(e.target.value)} />
            </label>
            <label className={styles.labelBlock}>
              Level
              <input className={styles.input} value={newTrackLevel} onChange={(e) => setNewTrackLevel(e.target.value)} />
            </label>
            <label className={styles.labelBlock}>
              Role type
              <input className={styles.input} value={newTrackRole} onChange={(e) => setNewTrackRole(e.target.value)} />
            </label>
            <label className={styles.labelBlock}>
              requirements_json
              <textarea
                className={styles.input}
                rows={4}
                value={reqJson}
                onChange={(e) => setReqJson(e.target.value)}
              />
            </label>
            <button type="submit" className={styles.btnSm}>
              Create track
            </button>
          </form>
        ) : null}
      </section>

      {selectedTrack ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>My progress</h3>
          {progress ? (
            <p className={styles.muted}>Status: {progress.status}</p>
          ) : (
            <p className={styles.muted}>Loading…</p>
          )}
          <form onSubmit={saveProgress}>
            <label className={styles.labelBlock}>
              completed_actions_json
              <textarea
                className={styles.input}
                rows={6}
                value={progressJson}
                onChange={(e) => setProgressJson(e.target.value)}
              />
            </label>
            <button type="submit" className={styles.btnSm}>
              Save progress
            </button>
          </form>
        </section>
      ) : null}

      {selectedTrack ? (
        <section className={styles.card}>
          <h3 className={styles.h3}>Issue certificate (self)</h3>
          <p className={styles.muted}>User: {user?.email}</p>
          <form onSubmit={issueCert} className={styles.inline}>
            <input className={styles.input} value={issueLevel} onChange={(e) => setIssueLevel(e.target.value)} />
            <input className={styles.input} value={issueScore} onChange={(e) => setIssueScore(e.target.value)} />
            <button type="submit" className={styles.btnSm}>
              Issue
            </button>
          </form>
        </section>
      ) : null}

      <section className={styles.card}>
        <h3 className={styles.h3}>My certificates</h3>
        <ul className={styles.ul}>
          {certs.map((c) => (
            <li key={c.id}>
              {c.level} — score {c.score} — {c.verification_id.slice(0, 8)}…{' '}
              <button type="button" className={styles.linkBtn} onClick={() => void openPdfPlaceholder(c.id)}>
                PDF placeholder
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
