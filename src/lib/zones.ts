import type { TrainingPaces } from './predict/vdot'

export interface Zone {
  /** 1-based zone number. */
  index: number
  name: string
  /** Inclusive lower bound (bpm for HR zones, sec/km for pace zones, where "lower" = slower). */
  from: number
  /** Exclusive upper bound; Infinity / 0 for the open-ended top zone. */
  to: number
}

export interface ZoneTime extends Zone {
  seconds: number
  /** Share of the zoned time, 0..1. */
  share: number
}

/** Upper bounds of zones 1–4 as a fraction of max HR (zone 5 is everything above). */
export const HR_ZONE_FRACTIONS = [0.6, 0.7, 0.8, 0.9] as const
const HR_ZONE_NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Max']

/** Five heart-rate zones as %HRmax: <60, 60–70, 70–80, 80–90, ≥90. */
export function hrZones(hrMax: number): Zone[] {
  const bounds = [0, ...HR_ZONE_FRACTIONS.map((f) => Math.round(f * hrMax)), Infinity]
  return HR_ZONE_NAMES.map((name, i) => ({ index: i + 1, name, from: bounds[i], to: bounds[i + 1] }))
}

export function hrZoneOf(hr: number, zones: Zone[]): number {
  for (let i = zones.length - 1; i >= 0; i--) if (hr >= zones[i].from) return i
  return 0
}

/**
 * Max HR estimated from recorded per-run maxima. Uses the second-highest plausible value
 * so a single strap spike doesn't set the zones. Undefined with fewer than 3 runs.
 */
export function estimateHrMax(runMaxes: (number | undefined)[]): number | undefined {
  const vals = runMaxes.filter((v): v is number => v != null && v >= 120 && v <= 225).sort((a, b) => b - a)
  if (vals.length < 3) return undefined
  return vals[1]
}

/**
 * Max HR to build zones from: the user's setting when they changed it from the default,
 * otherwise an estimate from their runs (falling back to the default).
 */
export function effectiveHrMax(settingHrMax: number, defaultHrMax: number, runMaxes: (number | undefined)[]): number {
  if (settingHrMax !== defaultHrMax) return settingHrMax
  return estimateHrMax(runMaxes) ?? settingHrMax
}

const PACE_ZONE_NAMES = ['Recovery', 'Easy', 'Marathon', 'Threshold', 'Interval']

/**
 * Five pace zones from Daniels training paces. Boundaries sit at the slow end of easy
 * and midway between neighbouring training paces. Bounds are sec/km, slow → fast.
 */
export function paceZones(p: TrainingPaces): Zone[] {
  const bounds = [
    Infinity,
    p.easy[1],
    (p.easy[0] + p.marathon) / 2,
    (p.marathon + p.threshold) / 2,
    (p.threshold + p.interval) / 2,
    0,
  ]
  return PACE_ZONE_NAMES.map((name, i) => ({ index: i + 1, name, from: bounds[i], to: bounds[i + 1] }))
}

export function paceZoneOf(pace: number, zones: Zone[]): number {
  for (let i = zones.length - 1; i >= 0; i--) if (pace <= zones[i].from) return i
  return 0
}

/** Samples further apart than this are treated as a pause and not counted. */
export const MAX_SAMPLE_GAP = 30

/**
 * Seconds spent in each zone. Each interval [t[i-1], t[i]] is credited to the zone of
 * value[i]; null values and gaps longer than MAX_SAMPLE_GAP are skipped.
 */
export function timeInZones(
  time: number[],
  values: (number | null | undefined)[],
  zones: Zone[],
  zoneOf: (v: number, zones: Zone[]) => number,
): ZoneTime[] {
  const secs = zones.map(() => 0)
  for (let i = 1; i < time.length; i++) {
    const v = values[i]
    const dt = time[i] - time[i - 1]
    if (v == null || !Number.isFinite(v) || dt <= 0 || dt > MAX_SAMPLE_GAP) continue
    secs[zoneOf(v, zones)] += dt
  }
  const total = secs.reduce((a, b) => a + b, 0)
  return zones.map((z, i) => ({ ...z, seconds: secs[i], share: total > 0 ? secs[i] / total : 0 }))
}

export type EffortLevel = 'Easy' | 'Moderate' | 'Hard' | 'Very hard' | 'Extreme'

/** Effort label for a TRIMP-style load score. */
export function effortLevel(load: number): EffortLevel {
  if (load < 60) return 'Easy'
  if (load < 120) return 'Moderate'
  if (load < 200) return 'Hard'
  if (load < 300) return 'Very hard'
  return 'Extreme'
}
