import type { ActivityStreams, ActivitySummary, ParsedActivity } from '@/types'
import { haversine } from '@/lib/geo'
import { computeBestEfforts } from '@/lib/bestEfforts'

const NON_RUN_SPORTS = new Set([
  'cycling', 'biking', 'swimming', 'rowing', 'e_biking', 'motorcycling', 'alpine_skiing',
  'cross_country_skiing', 'snowboarding', 'paddling', 'kayaking', 'sailing', 'golf',
  'training', 'fitness_equipment', 'mountaineering', 'stand_up_paddleboarding', 'surfing',
])

/** Runs, plus files with an unknown sport (TCX "Other", FIT "generic"). */
export function isRunningSport(sport: string): boolean {
  return !NON_RUN_SPORTS.has(sport.toLowerCase())
}

/** Elevation gain with a hysteresis threshold to ignore GPS/barometer noise. */
export function elevationGain(alt: (number | null)[], threshold = 3): number {
  let gain = 0
  let ref: number | null = null
  for (const a of alt) {
    if (a == null) continue
    if (ref === null) {
      ref = a
      continue
    }
    if (a - ref >= threshold) {
      gain += a - ref
      ref = a
    } else if (a < ref) {
      ref = a
    }
  }
  return gain
}

export function activityName(startTime: number): string {
  const h = new Date(startTime).getHours()
  const part = h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 14 ? 'Lunch' : h < 18 ? 'Afternoon' : h < 22 ? 'Evening' : 'Night'
  return `${part} run`
}

export type NewActivity = { summary: Omit<ActivitySummary, 'id' | 'importedAt'>; streams: Omit<ActivityStreams, 'id'> }

/** Turn parser output into the stored summary + columnar streams. */
export function buildActivity(parsed: ParsedActivity, source: 'fit' | 'tcx', fileName?: string): NewActivity {
  const pts = parsed.points.filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t)
  const t0 = pts[0]?.t ?? parsed.startTime

  const time: number[] = []
  const distance: number[] = []
  const lat: (number | null)[] = []
  const lon: (number | null)[] = []
  const hr: (number | null)[] = []
  const alt: (number | null)[] = []
  const cadence: (number | null)[] = []

  const fileHasDistance = pts.some((p) => p.dist !== undefined)
  let cum = 0
  let lastLat: number | undefined
  let lastLon: number | undefined
  for (const p of pts) {
    const hasPos = p.lat !== undefined && p.lon !== undefined && !(p.lat === 0 && p.lon === 0)
    if (fileHasDistance) {
      // Forward-fill gaps and never let distance go backwards.
      if (p.dist !== undefined && p.dist > cum) cum = p.dist
    } else if (hasPos) {
      if (lastLat !== undefined && lastLon !== undefined) cum += haversine(lastLat, lastLon, p.lat!, p.lon!)
    }
    if (hasPos) {
      lastLat = p.lat
      lastLon = p.lon
    }
    time.push((p.t - t0) / 1000)
    distance.push(cum)
    lat.push(hasPos ? p.lat! : null)
    lon.push(hasPos ? p.lon! : null)
    hr.push(p.hr ?? null)
    alt.push(p.alt ?? null)
    cadence.push(p.cadence ?? null)
  }

  const any = (xs: (number | null)[]) => xs.some((x) => x != null)
  const hrVals = hr.filter((x): x is number => x != null && x > 0)
  const elapsed = parsed.elapsedTime ?? (time.length ? time[time.length - 1] : 0)
  const totalDistance = parsed.totalDistance ?? (distance.length ? distance[distance.length - 1] : 0)

  const summary: NewActivity['summary'] = {
    startTime: parsed.startTime,
    duration: parsed.timerTime ?? elapsed,
    elapsed,
    distance: totalDistance,
    sport: parsed.sport,
    name: activityName(parsed.startTime),
    source,
    fileName,
    avgHr: parsed.avgHr ?? (hrVals.length ? Math.round(hrVals.reduce((a, b) => a + b, 0) / hrVals.length) : undefined),
    maxHr: parsed.maxHr ?? (hrVals.length ? Math.max(...hrVals) : undefined),
    ascent: parsed.ascent ?? (any(alt) ? Math.round(elevationGain(alt)) : undefined),
    hasGps: any(lat),
    bestEfforts: computeBestEfforts(time, distance),
  }

  const streams: NewActivity['streams'] = { time, distance }
  if (any(lat)) {
    streams.lat = lat
    streams.lon = lon
  }
  if (any(hr)) streams.hr = hr
  if (any(alt)) streams.alt = alt
  if (any(cadence)) streams.cadence = cadence
  return { summary, streams }
}
