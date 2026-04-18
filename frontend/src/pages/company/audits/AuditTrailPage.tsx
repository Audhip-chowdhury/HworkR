import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../../auth/AuthContext'
import {
  listAuditTrail,
  listTrailCategories,
  searchAuditMembers,
  type AuditCategoryOption,
  type MemberSearchHit,
  type TrailEntry,
} from '../../../api/auditsApi'
import { canListAllActivityLogs } from '../../../company/navConfig'
import styles from '../CompanyWorkspacePage.module.css'
import auditStyles from './Audits.module.css'

export function AuditTrailPage() {
  const { companyId = '' } = useParams()
  const { myCompanies, user } = useAuth()
  const membership = useMemo(
    () => myCompanies.find((c) => c.company.id === companyId)?.membership,
    [myCompanies, companyId],
  )
  const isHr = membership ? canListAllActivityLogs(membership.role) : false

  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<MemberSearchHit[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [selected, setSelected] = useState<MemberSearchHit | null>(null)
  const searchWrapRef = useRef<HTMLDivElement>(null)

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState<AuditCategoryOption[]>([])
  const filterRef = useRef({ category: '', fromDate: '', toDate: '' })
  filterRef.current = { category, fromDate, toDate }

  const [trail, setTrail] = useState<TrailEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!searchWrapRef.current?.contains(e.target as Node)) setSuggestOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const debouncedSearch = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!isHr || !companyId) return
    if (search.trim().length < 4) {
      setSuggestions([])
      return
    }
    window.clearTimeout(debouncedSearch.current)
    debouncedSearch.current = window.setTimeout(() => {
      void searchAuditMembers(companyId, search.trim())
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
    }, 300)
    return () => window.clearTimeout(debouncedSearch.current)
  }, [search, companyId, isHr])

  useEffect(() => {
    if (!companyId) return
    void listTrailCategories(companyId)
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [companyId])

  const loadTrail = useCallback(async () => {
    if (!companyId || !user) return
    if (isHr && !selected) {
      setTrail([])
      return
    }
    const f = filterRef.current
    setLoading(true)
    setError(null)
    try {
      const rows = await listAuditTrail(companyId, {
        userId: isHr ? selected?.user_id : undefined,
        category: f.category || undefined,
        fromDate: f.fromDate || undefined,
        toDate: f.toDate || undefined,
      })
      setTrail(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trail')
      setTrail([])
    } finally {
      setLoading(false)
    }
  }, [companyId, user, isHr, selected])

  useEffect(() => {
    if (!companyId || !user) return
    if (isHr && !selected) {
      setTrail([])
      return
    }
    void loadTrail()
  }, [companyId, user, isHr, selected, loadTrail])

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>Audit trail</h3>
        <p className={styles.hint}>
          {isHr
            ? 'Search for a member by name, email, or user id. Select someone to view their activity and audit records. Filter by category (e.g. Leave, Profile), date range, then apply.'
            : 'Your activity log and system audit entries. Filter by category, date range, then apply.'}
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}

        {isHr ? (
          <div className={auditStyles.searchRow} ref={searchWrapRef}>
            <label className={styles.labelBlock} style={{ flex: 1, minWidth: '12rem', marginBottom: 0 }}>
              Search member
              <input
                className={styles.input}
                placeholder="Type at least 4 characters"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setSuggestOpen(true)
                }}
                onFocus={() => setSuggestOpen(true)}
                autoComplete="off"
              />
            </label>
            {suggestOpen && suggestions.length > 0 ? (
              <ul className={auditStyles.suggestList} role="listbox">
                {suggestions.map((s) => (
                  <li key={s.user_id}>
                    <button
                      type="button"
                      className={auditStyles.suggestBtn}
                      onClick={() => {
                        setSelected(s)
                        setSearch(`${s.name} (${s.email})`)
                        setSuggestOpen(false)
                      }}
                    >
                      <strong>{s.name}</strong>
                      <span className={styles.muted}> {s.email}</span>
                      <span className={styles.muted}> · {s.user_id.slice(0, 8)}…</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {selected ? (
              <button type="button" className={styles.btnSm} onClick={() => { setSelected(null); setSearch('') }}>
                Clear selection
              </button>
            ) : null}
          </div>
        ) : null}

        <div className={auditStyles.filterBar}>
          <label className={auditStyles.filterField}>
            <span className={auditStyles.filterLabel}>From</span>
            <input className={auditStyles.filterDate} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label className={auditStyles.filterField}>
            <span className={auditStyles.filterLabel}>To</span>
            <input className={auditStyles.filterDate} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <label className={`${auditStyles.filterField} ${auditStyles.filterFieldGrow}`}>
            <span className={auditStyles.filterLabel}>Category</span>
            <div className={auditStyles.selectWrap}>
              <select
                className={auditStyles.categorySelect}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <button type="button" className={auditStyles.applyBtn} onClick={() => void loadTrail()}>
            Apply filters
          </button>
        </div>

        {isHr && !selected ? (
          <p className={styles.muted} style={{ marginTop: '1rem' }}>
            Select an employee to load their audit trail.
          </p>
        ) : null}

        {loading ? <p className={styles.muted}>Loading…</p> : null}

        {!loading && (isHr ? selected : true) ? (
          <div className={styles.tableWrap} style={{ marginTop: '0.75rem' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Source</th>
                  <th>Category</th>
                  <th>Reference</th>
                  <th>Action</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {trail.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.muted}>
                      No entries for these filters.
                    </td>
                  </tr>
                ) : (
                  trail.map((t) => (
                    <tr key={`${t.source}-${t.id}`}>
                      <td>{new Date(t.at).toLocaleString()}</td>
                      <td>
                        <span className={t.source === 'activity' ? styles.badge : styles.badgeAmber}>{t.source}</span>
                      </td>
                      <td>
                        <span className={auditStyles.categoryPill}>{t.category_label}</span>
                      </td>
                      <td className={styles.muted} title="Technical module or entity type">
                        <code className={auditStyles.refCode}>{t.screen}</code>
                      </td>
                      <td>{t.action}</td>
                      <td className={auditStyles.detailCell}>
                        {t.detail ?? '—'}
                        {t.extra && Object.keys(t.extra).length > 0 ? (
                          <pre className={auditStyles.jsonPre}>{JSON.stringify(t.extra, null, 2)}</pre>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
