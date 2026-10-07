import { describe, expect, it } from 'vitest'
import { formatDuration, formatPace, paceSecPerKm, parseDuration } from '@/lib/format'

describe('format', () => {
  it('formats durations', () => {
    expect(formatDuration(305)).toBe('5:05')
    expect(formatDuration(3725)).toBe('1:02:05')
    expect(formatDuration(59.6)).toBe('1:00')
    expect(formatDuration(NaN)).toBe('–')
  })
  it('formats pace', () => {
    expect(formatPace(paceSecPerKm(10000, 3300))).toBe('5:30')
    expect(formatPace(Infinity)).toBe('–')
  })
  it('parses durations', () => {
    expect(parseDuration('55:00')).toBe(3300)
    expect(parseDuration('1:02:03')).toBe(3723)
    expect(parseDuration('90')).toBe(90)
    expect(parseDuration('a:b')).toBeNaN()
  })
})
