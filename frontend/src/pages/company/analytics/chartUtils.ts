/** Upper bound for a “nice” axis (counts / currency-friendly). */
export function niceAxisMax(n: number, pad = 1.08): number {
  if (!Number.isFinite(n) || n <= 0) {
    return 1
  }
  const t = n * pad
  const p = 10 ** Math.floor(Math.log10(t))
  const f = t / p
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nf * p
}

/** Integer-friendly axis max for count data. */
export function niceCountAxisMax(n: number): number {
  return Math.max(1, Math.ceil(niceAxisMax(n, 1.05)))
}

/** Evenly spaced ticks from 0 to a nice `axisMax` derived from the data max. */
export function axisTicks0ToMax(dataMax: number, tickCount: number = 5): { axisMax: number; ticks: number[] } {
  const axisMax = niceCountAxisMax(dataMax)
  if (tickCount < 2) {
    return { axisMax, ticks: [0, axisMax] }
  }
  const ticks = Array.from({ length: tickCount }, (_, i) =>
    i === 0 ? 0 : Math.round((i / (tickCount - 1)) * axisMax),
  )
  return { axisMax, ticks: [...new Set(ticks)].sort((a, b) => a - b) }
}

export function formatAxisNumber(v: number): string {
  if (Math.abs(v) >= 1_000_000) {
    return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`
  }
  if (Math.abs(v) >= 10_000) {
    return `${(v / 1_000).toFixed(v % 1_000 === 0 ? 0 : 1)}k`
  }
  if (Number.isInteger(v)) {
    return String(v)
  }
  return v.toFixed(1)
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}
