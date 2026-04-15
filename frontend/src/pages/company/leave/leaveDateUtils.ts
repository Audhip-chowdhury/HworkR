/** Date strings YYYY-MM-DD, local noon to avoid DST issues */

export function datesBetweenInclusive(start: string, end: string): string[] {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return []
  const a = s <= e ? s : e
  const b = s <= e ? e : s
  const out: string[] = []
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

export function dateInRange(isoDay: string, start: string, end: string): boolean {
  return isoDay >= start.slice(0, 10) && isoDay <= end.slice(0, 10)
}

export function calendarWeeks(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1)
  const dim = new Date(year, month + 1, 0).getDate()
  const pad = first.getDay()
  const cells: (number | null)[] = []
  for (let i = 0; i < pad; i++) cells.push(null)
  for (let d = 1; d <= dim; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const rows: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
}

export function toISODate(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}
