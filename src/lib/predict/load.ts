/** Banister training impulse from average heart rate. */
export function trimp(
  durationSec: number,
  avgHr: number,
  hrRest: number,
  hrMax: number,
  sex: 'male' | 'female' = 'male',
): number {
  if (hrMax <= hrRest) throw new RangeError('hrMax must exceed hrRest')
  const hrr = Math.min(1, Math.max(0, (avgHr - hrRest) / (hrMax - hrRest)))
  const [a, b] = sex === 'male' ? [0.64, 1.92] : [0.86, 1.67]
  return (durationSec / 60) * hrr * a * Math.exp(b * hrr)
}

/**
 * Estimated heart-rate reserve fraction when no HR is recorded, from intensity
 * (speed relative to threshold speed). ~0.85 HRR at threshold, ~0.7 for easy running.
 */
export function estimateHrr(paceSecPerKm: number, thresholdPaceSecPerKm?: number): number {
  if (!thresholdPaceSecPerKm || !Number.isFinite(paceSecPerKm) || paceSecPerKm <= 0) return 0.7
  const intensity = thresholdPaceSecPerKm / paceSecPerKm
  return Math.min(0.95, Math.max(0.5, 0.25 + 0.6 * intensity))
}

export interface LoadInput {
  durationSec: number
  distance: number
  avgHr?: number
}

export interface LoadSettings {
  hrRest: number
  hrMax: number
  sex: 'male' | 'female'
  thresholdPace?: number
}

/** TRIMP from HR when available, otherwise from pace-estimated intensity. */
export function activityLoad(a: LoadInput, s: LoadSettings): number {
  if (a.durationSec <= 0) return 0
  if (a.avgHr && a.avgHr > s.hrRest) return trimp(a.durationSec, a.avgHr, s.hrRest, s.hrMax, s.sex)
  const pace = a.distance > 0 ? a.durationSec / (a.distance / 1000) : NaN
  const hrr = estimateHrr(pace, s.thresholdPace)
  const avgHr = s.hrRest + hrr * (s.hrMax - s.hrRest)
  return trimp(a.durationSec, avgHr, s.hrRest, s.hrMax, s.sex)
}

export interface FitnessPoint {
  /** Local day index (days since epoch in local time). */
  day: number
  load: number
  /** Chronic training load ("fitness"). */
  ctl: number
  /** Acute training load ("fatigue"). */
  atl: number
  /** Training stress balance ("form") = yesterday's CTL − ATL. */
  tsb: number
}

/**
 * Exponentially-weighted fitness/fatigue model (Banister / PMC style).
 * x_t = x_{t-1} + (load_t − x_{t-1}) · (1 − e^{−1/τ})
 */
export function fitnessSeries(
  dailyLoad: Map<number, number>,
  fromDay: number,
  toDay: number,
  ctlTau = 42,
  atlTau = 7,
): FitnessPoint[] {
  const kc = 1 - Math.exp(-1 / ctlTau)
  const ka = 1 - Math.exp(-1 / atlTau)
  let ctl = 0
  let atl = 0
  const out: FitnessPoint[] = []
  for (let d = fromDay; d <= toDay; d++) {
    const load = dailyLoad.get(d) ?? 0
    const tsb = ctl - atl
    ctl += (load - ctl) * kc
    atl += (load - atl) * ka
    out.push({ day: d, load, ctl, atl, tsb })
  }
  return out
}

/** Days since the Unix epoch in local time. */
export function localDay(ms: number): number {
  const d = new Date(ms)
  return Math.floor((ms - d.getTimezoneOffset() * 60000) / 86400000)
}

export function dayToMs(day: number): number {
  const utcMidnight = day * 86400000
  return utcMidnight + new Date(utcMidnight).getTimezoneOffset() * 60000
}
