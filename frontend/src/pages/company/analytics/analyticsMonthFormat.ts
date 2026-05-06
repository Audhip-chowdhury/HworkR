const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** `YYYY-MM` or ISO date prefix → `Jan 2026`. Falls back to original string if not parseable. */
export function formatChartMonthLabel(ymOrDate: string): string {
  const raw = ymOrDate.trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})/.exec(raw)
  if (!m) return ymOrDate
  const y = m[1]
  const mo = Number.parseInt(m[2], 10)
  if (mo < 1 || mo > 12) return ymOrDate
  return `${SHORT[mo - 1]} ${y}`
}
