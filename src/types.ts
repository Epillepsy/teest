/** Summary row for one activity. Kept small so the full list loads fast. */
export interface ActivitySummary {
  id: string
  /** Epoch milliseconds (UTC). */
  startTime: number
  /** Moving / timer time in seconds (excludes pauses). */
  duration: number
  /** Wall-clock elapsed time in seconds. */
  elapsed: number
  /** Meters. */
  distance: number
  sport: string
  name: string
  source: 'fit' | 'tcx'
  fileName?: string
  importedAt: number
  avgHr?: number
  maxHr?: number
  /** Meters of positive elevation gain. */
  ascent?: number
  hasGps: boolean
  /** User flag: this was a race / all-out effort (weighted higher in predictions). */
  isRace?: boolean
  /** Fastest segment (seconds) for each standard distance (meters, as string key). */
  bestEfforts: Record<string, number>
}

/** Columnar sample data for one activity. Index i of every array is the same sample. */
export interface ActivityStreams {
  id: string
  /** Seconds since activity start. */
  time: number[]
  /** Cumulative meters. */
  distance: number[]
  lat?: (number | null)[]
  lon?: (number | null)[]
  hr?: (number | null)[]
  alt?: (number | null)[]
  cadence?: (number | null)[]
}

/** Intermediate representation produced by the file parsers. */
export interface TrackPoint {
  /** Epoch milliseconds. */
  t: number
  lat?: number
  lon?: number
  /** Cumulative meters, if the file provides it. */
  dist?: number
  hr?: number
  alt?: number
  cadence?: number
}

export interface ParsedActivity {
  startTime: number
  sport: string
  timerTime?: number
  elapsedTime?: number
  totalDistance?: number
  avgHr?: number
  maxHr?: number
  ascent?: number
  points: TrackPoint[]
}

export interface Settings {
  hrMax: number
  hrRest: number
  sex: 'male' | 'female'
  goalDistance: number
  /** Seconds. */
  goalTime: number
  /** ISO date (YYYY-MM-DD). */
  goalDate: string
  /** How many days of history feed the race predictor. */
  predictorWindowDays: number
}

export const DEFAULT_SETTINGS: Settings = {
  hrMax: 190,
  hrRest: 55,
  sex: 'male',
  goalDistance: 10000,
  goalTime: 55 * 60,
  goalDate: '2026-11-15',
  predictorWindowDays: 120,
}
