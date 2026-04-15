import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getMyEmployee } from '../../../api/employeesApi'
import {
  createLeaveRequest,
  getLeaveSummary,
  listHolidays,
  listLeaveRequests,
  type HolidayRow,
  type LeaveRequestRow,
  type LeaveYearSummary,
} from '../../../api/leaveApi'
import { useAuth } from '../../../auth/AuthContext'
import styles from '../CompanyWorkspacePage.module.css'
import leaveStyles from './Leave.module.css'
import { calendarWeeks, datesBetweenInclusive, dateInRange, toISODate } from './leaveDateUtils'

const LEAVE_TYPES = ['paid', 'sick', 'casual', 'unpaid'] as const

type DraftSeg = {
  localId: string
  type: string
  start_date: string
  end_date: string
  reason: string
}

export function LeaveRequestPage() {
  const { companyId = '' } = useParams()
  const { myCompanies, loading: authLoading } = useAuth()
  const now = new Date()
  const [vy, setVy] = useState(now.getFullYear())
  const [vm, setVm] = useState(now.getMonth())

  const [summary, setSummary] = useState<LeaveYearSummary | null>(null)
  const [holidays, setHolidays] = useState<HolidayRow[]>([])
  const [requests, setRequests] = useState<LeaveRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [drafts, setDrafts] = useState<DraftSeg[]>([])
  const [popupOpen, setPopupOpen] = useState(false)
  const [form, setForm] = useState({
    type: 'paid',
    start_date: '',
    end_date: '',
    reason: '',
  })

  const refresh = useCallback(async () => {
    if (!companyId || authLoading) return
    setError(null)
    const y = vy
    const membership = myCompanies.find((c) => c.company.id === companyId)?.membership
    if (!membership) {
      setSummary(null)
      setHolidays([])
      setRequests([])
      setError('You do not have access to this company.')
      return
    }
    const isEmployeeRole = membership.role === 'employee'

    const [s, h, meForHr] = await Promise.all([
      getLeaveSummary(companyId, y),
      listHolidays(companyId),
      isEmployeeRole ? Promise.resolve(null) : getMyEmployee(companyId).catch(() => null),
    ])

    const r = await (isEmployeeRole
      ? listLeaveRequests(companyId)
      : meForHr?.id
        ? listLeaveRequests(companyId, meForHr.id)
        : Promise.resolve([]))

    setSummary(s)
    setHolidays(h)
    setRequests(r)
  }, [companyId, vy, myCompanies, authLoading])

  useEffect(() => {
    if (!companyId || authLoading) return
    setLoading(true)
    void refresh()
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [companyId, authLoading, refresh])

  const holidayDates = useMemo(() => new Set(holidays.map((h) => h.date.slice(0, 10))), [holidays])

  const draftDateSet = useMemo(() => {
    const s = new Set<string>()
    for (const d of drafts) {
      for (const day of datesBetweenInclusive(d.start_date, d.end_date)) s.add(day)
    }
    return s
  }, [drafts])

  function dayMarks(iso: string): { holiday: boolean; approved: boolean; pending: boolean; draft: boolean } {
    const holiday = holidayDates.has(iso)
    let approved = false
    let pending = false
    for (const r of requests) {
      if (!dateInRange(iso, r.start_date, r.end_date)) continue
      if (r.status === 'approved') approved = true
      if (r.status === 'pending') pending = true
    }
    const draft = draftDateSet.has(iso)
    return { holiday, approved, pending, draft }
  }

  function openPopupForDay(iso: string) {
    setForm((f) => ({ ...f, start_date: iso, end_date: iso }))
    setPopupOpen(true)
  }

  function addDraftFromPopup() {
    const { type, start_date, end_date, reason } = form
    if (!start_date || !end_date) return
    const localId = `d-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setDrafts((prev) => [...prev, { localId, type, start_date, end_date, reason: reason.trim() }])
    setPopupOpen(false)
  }

  async function submitAllDrafts() {
    if (!companyId || drafts.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      for (const d of drafts) {
        await createLeaveRequest(companyId, {
          type: d.type,
          start_date: d.start_date,
          end_date: d.end_date,
          reason: d.reason || null,
        })
      }
      setDrafts([])
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  const weeks = useMemo(() => calendarWeeks(vy, vm), [vy, vm])

  function prevMonth() {
    if (vm === 0) {
      setVm(11)
      setVy((y) => y - 1)
    } else setVm((m) => m - 1)
  }

  function nextMonth() {
    if (vm === 11) {
      setVm(0)
      setVy((y) => y + 1)
    } else setVm((m) => m + 1)
  }

  const monthLabel = new Date(vy, vm, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className={styles.org}>
      <section className={styles.card}>
        <h3 className={styles.h3}>Leave request</h3>
        <p className={styles.hint}>
          Review your balances, plan days on the calendar, add one or more leave ranges, then submit for approval. Public holidays
          are shown in blue and match the holiday calendar.
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}

        {loading ? <p className={styles.muted}>Loading…</p> : null}

        {!loading && summary ? (
          <>
            <div className={styles.tableWrap} style={{ marginTop: '0.75rem' }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Leave type</th>
                    <th>Total (year)</th>
                    <th>Used</th>
                    <th>Remaining</th>
                    <th>Pending approval</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.types.map((t) => (
                    <tr key={t.type}>
                      <td>{t.type}</td>
                      <td>{t.allocated}</td>
                      <td>{t.used}</td>
                      <td>{t.remaining}</td>
                      <td>{t.pending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={leaveStyles.legend}>
              <span className={leaveStyles.legendItem}>
                <span className={leaveStyles.legendIcon} title="Pending submission" aria-hidden>
                  📝
                </span>
                Pending submission (not yet sent)
              </span>
              <span className={leaveStyles.legendItem}>
                <span className={leaveStyles.legendIcon} title="Pending approval" aria-hidden>
                  ⏳
                </span>
                Pending approval
              </span>
              <span className={leaveStyles.legendItem}>
                <span className={leaveStyles.legendIcon} title="Approved" aria-hidden>
                  ✓
                </span>
                Approved
              </span>
              <span className={leaveStyles.legendItem}>
                <span className={leaveStyles.legendHolidayCell} title="Public holiday" />
                Public holiday
              </span>
            </div>

            <div className={leaveStyles.calWrap}>
              <div className={leaveStyles.calNav}>
                <button type="button" className={styles.btnSm} onClick={prevMonth}>
                  ← Previous
                </button>
                <span className={leaveStyles.calMonthLabel}>{monthLabel}</span>
                <button type="button" className={styles.btnSm} onClick={nextMonth}>
                  Next →
                </button>
              </div>

              <div className={leaveStyles.calGrid}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => (
                  <div key={w} className={leaveStyles.calWeekday}>
                    {w}
                  </div>
                ))}
                {weeks.flat().map((day, idx) => {
                  if (day === null) {
                    return <div key={`e-${idx}`} className={`${leaveStyles.calCell} ${leaveStyles.calCellMuted}`} />
                  }
                  const iso = toISODate(vy, vm, day)
                  const m = dayMarks(iso)
                  const cls = [leaveStyles.calCell]
                  if (m.holiday) cls.push(leaveStyles.calHolidayBlue)
                  if (!m.holiday) cls.push(leaveStyles.calCellInteractive)
                  const inner = (
                    <>
                      <span className={leaveStyles.calCellNum}>{day}</span>
                      <div className={leaveStyles.calCellMarks}>
                        {m.draft ? (
                          <span title="Pending submission" aria-hidden>
                            📝
                          </span>
                        ) : null}
                        {m.pending ? (
                          <span title="Pending approval" aria-hidden>
                            ⏳
                          </span>
                        ) : null}
                        {m.approved ? (
                          <span title="Approved" aria-hidden>
                            ✓
                          </span>
                        ) : null}
                      </div>
                    </>
                  )
                  return m.holiday ? (
                    <div key={iso} className={cls.join(' ')} title="Public holiday">
                      {inner}
                    </div>
                  ) : (
                    <button
                      key={iso}
                      type="button"
                      className={cls.join(' ')}
                      onClick={() => openPopupForDay(iso)}
                      title="Select leave range"
                    >
                      {inner}
                    </button>
                  )
                })}
              </div>
            </div>

            {drafts.length > 0 ? (
              <div style={{ marginTop: '1rem' }}>
                <div className={styles.hint} style={{ marginBottom: '0.35rem' }}>
                  Ready to submit ({drafts.length} range{drafts.length === 1 ? '' : 's'})
                </div>
                <ul className={styles.ul}>
                  {drafts.map((d) => (
                    <li key={d.localId}>
                      <strong>{d.type}</strong> · {d.start_date} → {d.end_date}
                      {d.reason ? ` — ${d.reason}` : ''}
                      <button
                        type="button"
                        className={styles.linkBtn}
                        style={{ marginLeft: '0.5rem' }}
                        onClick={() => setDrafts((prev) => prev.filter((x) => x.localId !== d.localId))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className={styles.btnSm}
                disabled={drafts.length === 0 || submitting}
                onClick={() => void submitAllDrafts()}
              >
                {submitting ? 'Submitting…' : 'Submit leave request(s)'}
              </button>
            </div>
          </>
        ) : null}
      </section>

      {popupOpen ? (
        <div
          className={leaveStyles.popupBackdrop}
          role="presentation"
          onClick={() => setPopupOpen(false)}
        >
          <div className={leaveStyles.popup} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h4 className={styles.h4} style={{ marginTop: 0 }}>
              Add leave range
            </h4>
            <label className={styles.labelBlock}>
              Leave type
              <select
                className={styles.input}
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                {LEAVE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.labelBlock}>
              From
              <input
                className={styles.input}
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              />
            </label>
            <label className={styles.labelBlock}>
              To
              <input
                className={styles.input}
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              />
            </label>
            <label className={styles.labelBlock}>
              Comments
              <textarea
                className={styles.textarea}
                rows={3}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </label>
            <div className={styles.inline}>
              <button type="button" className={styles.btnSm} onClick={addDraftFromPopup}>
                Add to request
              </button>
              <button type="button" className={styles.btnSm} onClick={() => setPopupOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
