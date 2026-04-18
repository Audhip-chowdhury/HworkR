import { useCallback, useEffect, useMemo, useState } from 'react'
import { listCompanyInterviews, type InterviewCalendarItem } from '../../../api/recruitmentApi'
import cal from './InterviewsCalendar.module.css'
import styles from '../CompanyWorkspacePage.module.css'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function localDateKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return localDateKey(d)
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function monthTitle(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function chipClass(format: string | null | undefined): string {
  const f = (format ?? '').toLowerCase()
  if (f === 'video') return cal.chipVideo
  if (f === 'phone') return cal.chipPhone
  if (f === 'onsite') return cal.chipOnsite
  return cal.chipDefault
}

function formatBadgeClass(format: string | null | undefined): string {
  const f = (format ?? '').toLowerCase()
  if (f === 'video') return cal.fmtVideo
  if (f === 'phone') return cal.fmtPhone
  if (f === 'onsite') return cal.fmtOnsite
  return cal.fmtDefault
}

type DayCell = { date: Date; inMonth: boolean }

function buildMonthCells(year: number, monthIndex: number): DayCell[] {
  const first = new Date(year, monthIndex, 1)
  const dim = new Date(year, monthIndex + 1, 0).getDate()
  const startPad = (first.getDay() + 6) % 7
  const cells: DayCell[] = []
  const prevMonthLast = new Date(year, monthIndex, 0).getDate()
  for (let i = 0; i < startPad; i += 1) {
    const day = prevMonthLast - startPad + i + 1
    cells.push({ date: new Date(year, monthIndex - 1, day), inMonth: false })
  }
  for (let d = 1; d <= dim; d += 1) {
    cells.push({ date: new Date(year, monthIndex, d), inMonth: true })
  }
  const tail = (7 - (cells.length % 7)) % 7
  for (let i = 1; i <= tail; i += 1) {
    cells.push({ date: new Date(year, monthIndex + 1, i), inMonth: false })
  }
  return cells
}

function groupByLocalDay(items: InterviewCalendarItem[]): Map<string, InterviewCalendarItem[]> {
  const m = new Map<string, InterviewCalendarItem[]>()
  for (const it of items) {
    const k = localDateKeyFromIso(it.scheduled_at)
    if (!k) continue
    const list = m.get(k) ?? []
    list.push(it)
    m.set(k, list)
  }
  for (const [, list] of m) {
    list.sort((a, b) => {
      const ta = new Date(a.scheduled_at ?? 0).getTime()
      const tb = new Date(b.scheduled_at ?? 0).getTime()
      return ta - tb
    })
  }
  return m
}

type Props = { companyId: string }

export function InterviewsCalendarPanel({ companyId }: Props) {
  const now = new Date()
  const [cursor, setCursor] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }))
  const [items, setItems] = useState<InterviewCalendarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const range = useMemo(() => {
    const start = new Date(cursor.y, cursor.m, 1, 0, 0, 0, 0)
    const end = new Date(cursor.y, cursor.m + 1, 0, 23, 59, 59, 999)
    return { start, end }
  }, [cursor.y, cursor.m])

  const refresh = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const data = await listCompanyInterviews(companyId, {
        date_from: range.start.toISOString(),
        date_to: range.end.toISOString(),
      })
      setItems(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load interviews')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [companyId, range.start, range.end])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const byDay = useMemo(() => groupByLocalDay(items), [items])

  const cells = useMemo(() => buildMonthCells(cursor.y, cursor.m), [cursor.y, cursor.m])

  const todayKey = localDateKey(new Date())

  useEffect(() => {
    setSelectedKey(localDateKey(new Date()))
  }, [companyId])

  function goPrevMonth() {
    setCursor((c) => {
      const d = new Date(c.y, c.m - 1, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
    setSelectedKey(null)
  }

  function goNextMonth() {
    setCursor((c) => {
      const d = new Date(c.y, c.m + 1, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
    setSelectedKey(null)
  }

  function goToday() {
    const t = new Date()
    setCursor({ y: t.getFullYear(), m: t.getMonth() })
    setSelectedKey(localDateKey(t))
  }

  const selectedList = selectedKey ? byDay.get(selectedKey) ?? [] : []

  const monthInterviewCount = useMemo(() => items.length, [items])

  return (
    <div className={cal.shell}>
      <header className={cal.header}>
        <div>
          <h4 className={cal.headerTitle}>{monthTitle(cursor.y, cursor.m)}</h4>
          <p className={cal.headerSub}>
            {monthInterviewCount} scheduled interview{monthInterviewCount === 1 ? '' : 's'} in view · removed
            (cancelled) slots stay off the calendar
          </p>
        </div>
        <div className={cal.navCluster}>
          <button type="button" className={cal.refreshBtn} onClick={() => void refresh()} disabled={loading}>
            Refresh
          </button>
          <button type="button" className={cal.todayBtn} onClick={goToday}>
            Today
          </button>
          <button type="button" className={cal.navBtn} onClick={goPrevMonth} aria-label="Previous month">
            ‹
          </button>
          <button type="button" className={cal.navBtn} onClick={goNextMonth} aria-label="Next month">
            ›
          </button>
        </div>
      </header>

      {error ? <p className={cal.error}>{error}</p> : null}
      {loading ? <div className={cal.loading}>Loading schedule…</div> : null}

      {!loading && !error ? (
        <div className={cal.layout}>
          <div>
            <div className={cal.weekdays}>
              {WEEKDAYS.map((w) => (
                <div key={w} className={cal.weekday}>
                  {w}
                </div>
              ))}
            </div>
            <div className={cal.grid}>
              {cells.map((cell) => {
                const key = localDateKey(cell.date)
                const dayEvents = byDay.get(key) ?? []
                const isToday = key === todayKey
                const isSel = key === selectedKey
                const show = dayEvents.slice(0, 3)
                const more = dayEvents.length - show.length
                return (
                  <button
                    key={key}
                    type="button"
                    className={[
                      cal.dayCell,
                      !cell.inMonth ? cal.dayCellOther : '',
                      isToday ? cal.dayCellToday : '',
                      isSel ? cal.dayCellSelected : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setSelectedKey(key)}
                  >
                    <span className={cal.dayNum}>{cell.date.getDate()}</span>
                    <div className={cal.chips}>
                      {show.map((ev) => (
                        <span key={ev.id} className={`${cal.chip} ${chipClass(ev.format)}`} title={ev.posting_title ?? ''}>
                          {formatTime(ev.scheduled_at)} {ev.candidate_name?.split(' ')[0] ?? 'Candidate'}
                        </span>
                      ))}
                      {more > 0 ? <span className={cal.more}>+{more} more</span> : null}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <aside className={cal.side} aria-live="polite">
            <h5 className={cal.sideTitle}>
              {selectedKey
                ? new Date(selectedKey + 'T12:00:00').toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })
                : 'Pick a day'}
            </h5>
            {selectedKey && selectedList.length === 0 ? (
              <p className={cal.sideEmpty}>No interviews on this day.</p>
            ) : null}
            {selectedKey && selectedList.length > 0
              ? selectedList.map((ev) => (
                  <div key={ev.id} className={cal.detailCard}>
                    <div className={cal.detailTime}>{formatTime(ev.scheduled_at)}</div>
                    <p className={cal.detailName}>{ev.candidate_name?.trim() || 'Candidate'}</p>
                    <p className={cal.detailRole}>{ev.posting_title?.trim() || 'Role'}</p>
                    <div className={cal.detailMeta}>
                      <span className={`${cal.formatBadge} ${formatBadgeClass(ev.format)}`}>{ev.format ?? '—'}</span>
                      <span className={styles.muted} style={{ fontSize: '0.72rem' }}>
                        Application {ev.application_id.slice(0, 8)}…
                      </span>
                    </div>
                  </div>
                ))
              : null}
            {!selectedKey ? (
              <p className={cal.sideEmpty}>Select a date on the grid to see times, candidates, and roles.</p>
            ) : null}
          </aside>
        </div>
      ) : null}

      <div className={cal.legend}>
        <span className={cal.legendItem}>
          <span className={cal.legendSwatch} style={{ background: 'rgba(99, 102, 241, 0.5)' }} />
          Video
        </span>
        <span className={cal.legendItem}>
          <span className={cal.legendSwatch} style={{ background: 'rgba(16, 185, 129, 0.55)' }} />
          Phone
        </span>
        <span className={cal.legendItem}>
          <span className={cal.legendSwatch} style={{ background: 'rgba(245, 158, 11, 0.55)' }} />
          Onsite
        </span>
      </div>
    </div>
  )
}
