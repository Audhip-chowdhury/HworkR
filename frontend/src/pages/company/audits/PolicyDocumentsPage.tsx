import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import {
  acknowledgePolicy,
  downloadPolicyBlob,
  getPolicyAcknowledgmentDetail,
  listPolicies,
  type PolicyAckMember,
  type PolicyAckStatusFilter,
  type PolicyDocumentRow,
} from '../../../api/auditsApi'
import { invalidateInboxBadge } from '../../../api/inboxApi'
import { canListAllActivityLogs } from '../../../company/companyAccess'
import styles from '../CompanyWorkspacePage.module.css'
import auditStyles from './Audits.module.css'

const ACK_PAGE_SIZE = 50

function ackSearchQuery(raw: string): string {
  const t = raw.trim()
  return t.length >= 4 ? t : ''
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function buildAckExportCsv(rows: PolicyAckMember[]): string {
  const header = ['Emp ID', 'Emp Name', 'Emp Email', 'Status']
  const lines = [
    header.map(escapeCsvCell).join(','),
    ...rows.map((r) =>
      [r.user_id, r.name, r.email, r.acknowledged ? 'Ack' : 'Not ack'].map(escapeCsvCell).join(','),
    ),
  ]
  return `\ufeff${lines.join('\n')}`
}

export function PolicyDocumentsPage() {
  const { companyId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const focusPolicyId = searchParams.get('policy')
  const { myCompanies } = useAuth()
  const membership = useMemo(
    () => myCompanies.find((c) => c.company.id === companyId)?.membership,
    [myCompanies, companyId],
  )
  const isHr = membership ? canListAllActivityLogs(membership.role) : false

  const [rows, setRows] = useState<PolicyDocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ackBusy, setAckBusy] = useState<string | null>(null)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailPolicyId, setDetailPolicyId] = useState<string | null>(null)
  const [detailTitle, setDetailTitle] = useState('')
  const [detailSearch, setDetailSearch] = useState('')
  const [detailStatus, setDetailStatus] = useState<PolicyAckStatusFilter>('all')
  const [detailRows, setDetailRows] = useState<PolicyAckMember[]>([])
  const [detailTotal, setDetailTotal] = useState(0)
  const [detailOffset, setDetailOffset] = useState(0)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailExporting, setDetailExporting] = useState(false)

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const refresh = async () => {
    if (!companyId) return
    const list = await listPolicies(companyId)
    setRows(list)
  }

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    void refresh()
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [companyId])

  useEffect(() => {
    if (!focusPolicyId) return
    const el = cardRefs.current[focusPolicyId]
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusPolicyId, rows])

  const loadAckPage = useCallback(
    async (policyId: string, searchRaw: string, off: number, status: PolicyAckStatusFilter) => {
      if (!companyId) return
      setDetailLoading(true)
      setDetailError(null)
      try {
        const res = await getPolicyAcknowledgmentDetail(companyId, policyId, {
          q: ackSearchQuery(searchRaw),
          offset: off,
          limit: ACK_PAGE_SIZE,
          status,
        })
        setDetailRows(res.items)
        setDetailTotal(res.total)
        setDetailOffset(res.offset)
      } catch (e) {
        setDetailError(e instanceof Error ? e.message : 'Failed to load')
        setDetailRows([])
        setDetailTotal(0)
      } finally {
        setDetailLoading(false)
      }
    },
    [companyId],
  )

  useEffect(() => {
    if (!detailOpen || !detailPolicyId) return
    const delay = detailSearch.trim().length >= 4 ? 300 : 0
    const t = window.setTimeout(() => {
      void loadAckPage(detailPolicyId, detailSearch, 0, detailStatus)
    }, delay)
    return () => window.clearTimeout(t)
  }, [detailSearch, detailOpen, detailPolicyId, detailStatus, loadAckPage])

  function openAckDetail(p: PolicyDocumentRow) {
    if (p.acknowledgment_count == null || p.member_count == null) return
    setDetailTitle(p.title)
    setDetailPolicyId(p.id)
    setDetailSearch('')
    setDetailStatus('all')
    setDetailRows([])
    setDetailTotal(0)
    setDetailOffset(0)
    setDetailError(null)
    setDetailOpen(true)
  }

  function closeDetail() {
    setDetailOpen(false)
    setDetailPolicyId(null)
    setDetailTitle('')
    setDetailSearch('')
    setDetailStatus('all')
    setDetailRows([])
    setDetailTotal(0)
    setDetailOffset(0)
    setDetailError(null)
  }

  const canPrev = detailOffset > 0
  const canNext = detailOffset + ACK_PAGE_SIZE < detailTotal

  const exportAckSpreadsheet = useCallback(async () => {
    if (!companyId || !detailPolicyId) return
    setDetailExporting(true)
    setDetailError(null)
    try {
      const qText = ackSearchQuery(detailSearch)
      const limit = 200
      const all: PolicyAckMember[] = []
      let offset = 0
      while (true) {
        const res = await getPolicyAcknowledgmentDetail(companyId, detailPolicyId, {
          q: qText,
          offset,
          limit,
          status: detailStatus,
        })
        all.push(...res.items)
        if (res.items.length < limit || all.length >= res.total) break
        offset += limit
      }
      const csv = buildAckExportCsv(all)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const safe = detailTitle.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'policy'
      a.href = url
      a.download = `${safe}-acknowledgments-${detailStatus}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setDetailExporting(false)
    }
  }, [companyId, detailPolicyId, detailSearch, detailStatus, detailTitle])

  async function onAck(p: PolicyDocumentRow) {
    if (!companyId || p.acknowledged_by_me) return
    setAckBusy(p.id)
    setError(null)
    try {
      const updated = await acknowledgePolicy(companyId, p.id)
      setRows((prev) => prev.map((r) => (r.id === p.id ? updated : r)))
      invalidateInboxBadge()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Acknowledge failed')
    } finally {
      setAckBusy(null)
    }
  }

  const rangeStart = detailTotal === 0 ? 0 : detailOffset + 1
  const rangeEnd = detailOffset + detailRows.length

  const publishHref = `/company/${companyId}/audits/policies?tab=publish`

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>Policy library</h3>
        <p className={styles.hint}>
          Download company policies and confirm you have read them. New policies appear in your inbox.
          {isHr ? (
            <>
              {' '}
              To add a new policy, use{' '}
              <Link to={publishHref}>Publish</Link>.
            </>
          ) : null}
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}

        {loading ? <p className={styles.muted}>Loading…</p> : null}

        {!loading && rows.length === 0 ? (
          <p className={styles.muted} style={{ marginTop: '1rem' }}>
            No policies yet.
            {isHr ? (
              <>
                {' '}
                <Link to={publishHref}>Publish the first policy</Link>.
              </>
            ) : null}
          </p>
        ) : null}

        {!loading
          ? rows.map((p) => (
              <div
                key={p.id}
                ref={(el) => {
                  cardRefs.current[p.id] = el
                }}
                className={`${auditStyles.policyCard} ${focusPolicyId === p.id ? auditStyles.policyCardHighlight : ''}`}
              >
                <h4 className={auditStyles.policyTitle}>{p.title}</h4>
                {p.description ? <p className={styles.hint}>{p.description}</p> : null}
                <div className={auditStyles.policyMeta}>
                  File: {p.file_name}
                  {isHr && p.acknowledgment_count != null && p.member_count != null ? (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className={auditStyles.ackSummaryBtn}
                        onClick={() => openAckDetail(p)}
                        title="Search employees and view acknowledgment status"
                      >
                        {p.acknowledgment_count}/{p.member_count} acknowledged
                      </button>
                    </>
                  ) : null}
                </div>
                <div className={auditStyles.policyActions}>
                  <button
                    type="button"
                    className={styles.btnSm}
                    onClick={() => void downloadPolicyBlob(companyId, p.id, p.file_name)}
                  >
                    Download
                  </button>
                  <label className={auditStyles.ackLabel}>
                    <input
                      type="checkbox"
                      checked={p.acknowledged_by_me}
                      disabled={p.acknowledged_by_me || ackBusy === p.id}
                      onChange={() => void onAck(p)}
                    />
                    I have read and acknowledge this policy
                  </label>
                </div>
              </div>
            ))
          : null}
      </section>

      {detailOpen && detailPolicyId ? (
        <div
          className={auditStyles.modalBackdrop}
          role="presentation"
          onClick={closeDetail}
        >
          <div
            className={`${auditStyles.modal} ${auditStyles.modalWide}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="policy-ack-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={auditStyles.modalHeader}>
              <h4 id="policy-ack-detail-title" className={styles.h4} style={{ margin: 0 }}>
                Acknowledgment status
              </h4>
              <button type="button" className={auditStyles.modalClose} onClick={closeDetail} aria-label="Close">
                ×
              </button>
            </div>
            <p className={styles.muted} style={{ marginTop: 0 }}>
              {detailTitle}
            </p>

            <div className={auditStyles.ackToolbar}>
              <label className={auditStyles.ackSearchLabel}>
                <span className={auditStyles.ackSearchHint}>Search by name, email, or employee id</span>
                <input
                  className={auditStyles.ackSearchInput}
                  type="search"
                  placeholder="Optional — use 4+ characters to narrow the list"
                  value={detailSearch}
                  onChange={(e) => setDetailSearch(e.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </label>
              <label className={auditStyles.ackStatusFilter}>
                <span className={auditStyles.ackSearchHint}>Status</span>
                <select
                  className={auditStyles.ackStatusSelect}
                  value={detailStatus}
                  onChange={(e) => setDetailStatus(e.target.value as PolicyAckStatusFilter)}
                >
                  <option value="all">All</option>
                  <option value="acknowledged">Ack</option>
                  <option value="pending">Not ack</option>
                </select>
              </label>
              <button
                type="button"
                className={styles.btnSm}
                disabled={detailExporting || detailLoading || !detailPolicyId}
                onClick={() => void exportAckSpreadsheet()}
              >
                {detailExporting ? 'Exporting…' : 'Export to Excel'}
              </button>
            </div>
            <p className={styles.muted} style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
              Table shows all active members for this company. Search (4+ characters) narrows rows; status filters who
              has acknowledged. Export downloads the same filtered set as CSV (opens in Excel).
            </p>

            {detailLoading ? <p className={styles.muted}>Loading…</p> : null}
            {detailError ? <p className={styles.error}>{detailError}</p> : null}

            {!detailLoading && !detailError ? (
              <>
                <p className={auditStyles.ackTableMeta}>
                  {detailTotal === 0
                    ? 'No members in this view.'
                    : `Showing ${rangeStart}-${rangeEnd} of ${detailTotal}`}
                </p>
                <div className={auditStyles.ackTableWrap}>
                  <table className={auditStyles.ackTable}>
                    <thead>
                      <tr>
                        <th>Emp ID</th>
                        <th>Emp name</th>
                        <th>Emp email</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className={styles.muted}>
                            {detailTotal === 0 ? 'No rows match the current search and status filter.' : ''}
                          </td>
                        </tr>
                      ) : (
                        detailRows.map((r) => (
                          <tr key={r.user_id}>
                            <td>
                              <code className={auditStyles.refCode}>{r.user_id}</code>
                            </td>
                            <td>{r.name}</td>
                            <td>{r.email}</td>
                            <td>{r.acknowledged ? 'Ack' : 'Not ack'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {detailTotal > 0 ? (
                  <div className={auditStyles.ackPager}>
                    <button
                      type="button"
                      className={styles.btnSm}
                      disabled={!canPrev || detailLoading}
                      onClick={() =>
                        detailPolicyId &&
                        void loadAckPage(
                          detailPolicyId,
                          detailSearch,
                          Math.max(0, detailOffset - ACK_PAGE_SIZE),
                          detailStatus,
                        )
                      }
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className={styles.btnSm}
                      disabled={!canNext || detailLoading}
                      onClick={() =>
                        detailPolicyId &&
                        void loadAckPage(detailPolicyId, detailSearch, detailOffset + ACK_PAGE_SIZE, detailStatus)
                      }
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
