import { describe, expect, it } from 'vitest'
import { findDuplicate, isDuplicate } from '@/lib/dedupe'

const t = Date.UTC(2026, 8, 1, 7)
describe('dedupe by start time + duration', () => {
  it('matches within tolerance', () => {
    expect(isDuplicate({ startTime: t, duration: 3000 }, { startTime: t + 3000, duration: 3004 })).toBe(true)
    expect(isDuplicate({ startTime: t, duration: 3000 }, { startTime: t + 6000, duration: 3000 })).toBe(false)
    expect(isDuplicate({ startTime: t, duration: 3000 }, { startTime: t, duration: 3010 })).toBe(false)
  })
  it('finds a duplicate in a sorted list', () => {
    const list = [0, 1, 2, 3, 4].map((i) => ({ id: i, startTime: t + i * 3600_000, duration: 1800 }))
    expect(findDuplicate(list, { startTime: t + 2 * 3600_000 + 1000, duration: 1801 })?.id).toBe(2)
    expect(findDuplicate(list, { startTime: t + 2 * 3600_000 + 1000, duration: 1500 })).toBeUndefined()
    expect(findDuplicate(list, { startTime: t - 3600_000, duration: 1800 })).toBeUndefined()
    expect(findDuplicate([], { startTime: t, duration: 1 })).toBeUndefined()
  })
})
