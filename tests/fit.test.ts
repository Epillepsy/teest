import { describe, expect, it } from 'vitest'
import { Encoder, Profile, type Mesg } from '@garmin/fitsdk'

const m = (o: Record<string, unknown>) => o as Mesg
import { parseFit } from '@/lib/parse/fit'
import { buildActivity, isRunningSport } from '@/lib/parse/normalize'

const DEG_TO_SEMI = 2 ** 31 / 180

function makeFit(): ArrayBuffer {
  const start = new Date(Date.UTC(2026, 8, 10, 6, 30))
  const enc = new Encoder()
  enc.onMesg(Profile.MesgNum.FILE_ID, m({ type: 'activity', manufacturer: 'development', product: 0, timeCreated: start, serialNumber: 1 }))
  for (let i = 0; i <= 600; i++) {
    enc.onMesg(Profile.MesgNum.RECORD, m({
      timestamp: new Date(start.getTime() + i * 1000),
      positionLat: Math.round((45 + i * 0.00003) * DEG_TO_SEMI),
      positionLong: Math.round(5 * DEG_TO_SEMI),
      distance: i * 3.333,
      heartRate: 150,
      enhancedAltitude: 200,
    }))
  }
  enc.onMesg(Profile.MesgNum.SESSION, m({
    timestamp: new Date(start.getTime() + 600_000),
    startTime: start,
    sport: 'running',
    totalElapsedTime: 600,
    totalTimerTime: 590,
    totalDistance: 2000,
    avgHeartRate: 150,
    maxHeartRate: 160,
  }))
  const bytes = enc.close()
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

describe('parseFit', () => {
  it('decodes session and records', () => {
    const p = parseFit(makeFit())
    expect(p.startTime).toBe(Date.UTC(2026, 8, 10, 6, 30))
    expect(p.sport).toBe('running')
    expect(p.timerTime).toBeCloseTo(590)
    expect(p.totalDistance).toBeCloseTo(2000)
    expect(p.maxHr).toBe(160)
    expect(p.points).toHaveLength(601)
    expect(p.points[100].lat).toBeCloseTo(45.003, 4)
    expect(p.points[100].lon).toBeCloseTo(5, 5)
    expect(p.points[100].dist).toBeCloseTo(333.3, 1)
  })

  it('builds a stored activity', () => {
    const { summary, streams } = buildActivity(parseFit(makeFit()), 'fit', 'run.fit')
    expect(summary.duration).toBeCloseTo(590)
    expect(summary.elapsed).toBeCloseTo(600)
    expect(summary.hasGps).toBe(true)
    expect(summary.bestEfforts['1000']).toBeCloseTo(300, 0)
    expect(streams.time).toHaveLength(601)
    expect(streams.hr?.[10]).toBe(150)
  })

  it('rejects non-FIT data', () => {
    expect(() => parseFit(new Uint8Array([1, 2, 3, 4]).buffer)).toThrow()
  })
})

describe('isRunningSport', () => {
  it('keeps runs and unknown sports, drops others', () => {
    expect(isRunningSport('running')).toBe(true)
    expect(isRunningSport('generic')).toBe(true)
    expect(isRunningSport('other')).toBe(true)
    expect(isRunningSport('cycling')).toBe(false)
    expect(isRunningSport('Biking')).toBe(false)
  })
})
