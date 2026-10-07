import { describe, expect, it } from 'vitest'
import { aggregate, startOfMonth, startOfWeek } from '@/lib/aggregate'

describe('aggregate', () => {
  it('startOfWeek is local Monday midnight', () => {
    const wed = new Date(2026, 9, 7, 15).getTime() // Wed 7 Oct 2026
    expect(startOfWeek(wed)).toBe(new Date(2026, 9, 5).getTime())
    const sun = new Date(2026, 9, 11, 23).getTime()
    expect(startOfWeek(sun)).toBe(new Date(2026, 9, 5).getTime())
    expect(startOfMonth(wed)).toBe(new Date(2026, 9, 1).getTime())
  })
  it('buckets weeks with zero-filled gaps', () => {
    const now = new Date(2026, 9, 7).getTime()
    const runs = [
      { startTime: new Date(2026, 9, 6, 7).getTime(), distance: 10000, duration: 3000, ascent: 50 },
      { startTime: new Date(2026, 9, 5, 7).getTime(), distance: 5000, duration: 1500 },
      { startTime: new Date(2026, 8, 22, 7).getTime(), distance: 8000, duration: 2400 },
      { startTime: new Date(2025, 0, 1).getTime(), distance: 1, duration: 1 }, // out of range
    ]
    const b = aggregate(runs, 'week', 3, now)
    expect(b.map((x) => x.distance)).toEqual([8000, 0, 15000])
    expect(b[2].count).toBe(2)
    expect(b[2].ascent).toBe(50)
    expect(b[0].start).toBe(new Date(2026, 8, 21).getTime())
  })
  it('buckets months across a year boundary', () => {
    const now = new Date(2026, 0, 15).getTime()
    const b = aggregate([{ startTime: new Date(2025, 11, 31, 8).getTime(), distance: 5000, duration: 1500 }], 'month', 2, now)
    expect(b.map((x) => x.distance)).toEqual([5000, 0])
    expect(b[0].start).toBe(new Date(2025, 11, 1).getTime())
  })
})
