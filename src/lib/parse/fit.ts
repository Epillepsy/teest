import { Decoder, Stream } from '@garmin/fitsdk'
import type { ParsedActivity, TrackPoint } from '@/types'

const SEMICIRCLE_TO_DEG = 180 / 2 ** 31

function toMs(v: unknown): number | undefined {
  if (v instanceof Date) return v.getTime()
  return undefined
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

export function parseFit(buffer: ArrayBuffer): ParsedActivity {
  const stream = Stream.fromArrayBuffer(buffer)
  const decoder = new Decoder(stream)
  if (!decoder.isFIT()) throw new Error('Not a FIT file')
  const { messages, errors } = decoder.read({
    convertDateTimesToDates: true,
    convertTypesToStrings: true,
    applyScaleAndOffset: true,
    expandComponents: true,
    mergeHeartRates: true,
  })
  const records = messages.recordMesgs ?? []
  if (errors.length && records.length === 0) throw errors[0]

  const points: TrackPoint[] = []
  for (const r of records) {
    const t = toMs(r.timestamp)
    if (t === undefined) continue
    const latRaw = num(r.positionLat)
    const lonRaw = num(r.positionLong)
    points.push({
      t,
      lat: latRaw !== undefined && lonRaw !== undefined ? latRaw * SEMICIRCLE_TO_DEG : undefined,
      lon: latRaw !== undefined && lonRaw !== undefined ? lonRaw * SEMICIRCLE_TO_DEG : undefined,
      dist: num(r.distance),
      hr: num(r.heartRate),
      alt: num(r.enhancedAltitude) ?? num(r.altitude),
      cadence: num(r.cadence),
    })
  }

  const session = messages.sessionMesgs?.[0]
  const sport = String(session?.sport ?? messages.sportMesgs?.[0]?.sport ?? 'generic')
  const startTime = toMs(session?.startTime) ?? points[0]?.t
  if (startTime === undefined) throw new Error('FIT file has no start time')

  return {
    startTime,
    sport,
    timerTime: num(session?.totalTimerTime),
    elapsedTime: num(session?.totalElapsedTime),
    totalDistance: num(session?.totalDistance),
    avgHr: num(session?.avgHeartRate),
    maxHr: num(session?.maxHeartRate),
    ascent: num(session?.totalAscent),
    points,
  }
}
