import { describe, expect, it } from 'vitest'
import { computeSplits, rollingPace } from '@/lib/splits'
import { synthStream } from './helpers'

describe('computeSplits', () => {
  it('splits a constant-pace run into km with a trailing partial', () => {
    const s = synthStream([[3150, 300]]) // 10.5 km @ 5:00
    const splits = computeSplits(s.time, s.distance)
    expect(splits).toHaveLength(11)
    for (const sp of splits.slice(0, 10)) {
      expect(sp.distance).toBeCloseTo(1000, 6)
      expect(sp.time).toBeCloseTo(300, 6)
      expect(sp.pace).toBeCloseTo(300, 6)
    }
    expect(splits[10].distance).toBeCloseTo(500, 6)
    expect(splits[10].pace).toBeCloseTo(300, 6)
  })
  it('captures pace changes at the right km', () => {
    const s = synthStream([[300, 300], [240, 240]]) // 1 km @5:00 then 1 km @4:00
    const splits = computeSplits(s.time, s.distance)
    expect(splits[0].time).toBeCloseTo(300, 6)
    expect(splits[1].time).toBeCloseTo(240, 6)
  })
  it('drops a tiny trailing partial', () => {
    const s = synthStream([[606, 300]]) // 2.02 km
    expect(computeSplits(s.time, s.distance)).toHaveLength(2)
  })
  it('averages HR and elevation change per split', () => {
    const s = synthStream([[600, 300]])
    const hr = s.time.map((t) => (t <= 300 ? 140 : 160))
    const alt = s.time.map((t) => t / 10)
    const splits = computeSplits(s.time, s.distance, { hr, alt })
    expect(splits[0].avgHr).toBeCloseTo(140, 0)
    expect(splits[1].avgHr).toBeCloseTo(160, 0)
    expect(splits[0].elevation).toBeCloseTo(30, 0)
  })
  it('returns [] for empty input', () => {
    expect(computeSplits([], [])).toEqual([])
  })
})

describe('rollingPace', () => {
  it('returns the true pace for a constant run and null when stopped', () => {
    const s = synthStream([[100, 300], [60, 1e9], [100, 300]])
    const p = rollingPace(s.time, s.distance, 10)
    expect(p[50]).toBeCloseTo(300, 3)
    expect(p[130]).toBeNull()
  })
})
