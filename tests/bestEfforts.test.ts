import { describe, expect, it } from 'vitest'
import { bestEffort, computeBestEfforts } from '@/lib/bestEfforts'
import { synthStream } from './helpers'

describe('bestEffort', () => {
  it('constant pace gives distance × pace', () => {
    const s = synthStream([[3600, 300]]) // 12 km @ 5:00/km
    expect(bestEffort(s.time, s.distance, 5000)).toBeCloseTo(1500, 6)
    expect(bestEffort(s.time, s.distance, 1000)).toBeCloseTo(300, 6)
  })
  it('finds the fast segment in the middle', () => {
    const s = synthStream([[600, 360], [1200, 240], [600, 360]]) // 5 km @ 4:00 in the middle
    expect(bestEffort(s.time, s.distance, 5000)).toBeCloseTo(1200, 6)
    expect(bestEffort(s.time, s.distance, 1000)).toBeCloseTo(240, 6)
  })
  it('interpolates partially into a fast section', () => {
    const s = synthStream([[300, 300], [300, 200]]) // 1 km slow, 1.5 km fast
    expect(bestEffort(s.time, s.distance, 2000)).toBeCloseTo(300 + 0.5 * 300, 6)
  })
  it('returns undefined when the activity is too short', () => {
    const s = synthStream([[600, 300]])
    expect(bestEffort(s.time, s.distance, 5000)).toBeUndefined()
    expect(bestEffort([0], [0], 1)).toBeUndefined()
  })
  it('computes the standard set', () => {
    const s = synthStream([[3000, 300]]) // 10 km
    const e = computeBestEfforts(s.time, s.distance)
    expect(Object.keys(e).sort()).toEqual(['1000', '10000', '1609.344', '400', '5000'].sort())
    expect(e['10000']).toBeCloseTo(3000, 0)
  })
})
