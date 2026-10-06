import { describe, expect, it } from 'vitest'
import { activityLoad, dayToMs, estimateHrr, fitnessSeries, localDay, trimp } from '@/lib/predict/load'

describe('TRIMP', () => {
  it('matches the Banister formula', () => {
    // 60 min at 50% HRR (male): 60 · 0.5 · 0.64 · e^(1.92·0.5)
    expect(trimp(3600, 120, 50, 190)).toBeCloseTo(60 * 0.5 * 0.64 * Math.exp(0.96), 6)
    expect(trimp(3600, 120, 50, 190, 'female')).toBeCloseTo(60 * 0.5 * 0.86 * Math.exp(0.835), 6)
  })
  it('clamps HRR to [0, 1]', () => {
    expect(trimp(3600, 40, 50, 190)).toBe(0)
    expect(trimp(3600, 250, 50, 190)).toBeCloseTo(60 * 0.64 * Math.exp(1.92), 6)
  })
  it('scales linearly with duration', () => {
    expect(trimp(7200, 150, 50, 190)).toBeCloseTo(2 * trimp(3600, 150, 50, 190), 9)
  })
  it('throws for invalid HR settings', () => {
    expect(() => trimp(60, 100, 190, 50)).toThrow()
  })
})

describe('activityLoad fallback', () => {
  const s = { hrRest: 50, hrMax: 190, sex: 'male' as const, thresholdPace: 270 }
  it('uses HR when present', () => {
    expect(activityLoad({ durationSec: 3600, distance: 10000, avgHr: 150 }, s)).toBeCloseTo(trimp(3600, 150, 50, 190), 9)
  })
  it('estimates from pace without HR: faster = more load', () => {
    const easy = activityLoad({ durationSec: 3600, distance: 10000 }, s)
    const hard = activityLoad({ durationSec: 3600, distance: 13000 }, s)
    expect(hard).toBeGreaterThan(easy)
  })
  it('estimateHrr is ~0.85 at threshold and bounded', () => {
    expect(estimateHrr(270, 270)).toBeCloseTo(0.85, 6)
    expect(estimateHrr(100, 270)).toBe(0.95)
    expect(estimateHrr(1000, 270)).toBe(0.5)
    expect(estimateHrr(300)).toBe(0.7)
  })
})

describe('fitnessSeries', () => {
  it('converges to a constant daily load', () => {
    const loads = new Map<number, number>()
    for (let d = 0; d < 400; d++) loads.set(d, 100)
    const s = fitnessSeries(loads, 0, 399)
    expect(s.at(-1)!.ctl).toBeCloseTo(100, 1)
    expect(s.at(-1)!.atl).toBeCloseTo(100, 6)
  })
  it('has the right time constants (63.2 % after τ days)', () => {
    const loads = new Map<number, number>()
    for (let d = 0; d < 100; d++) loads.set(d, 100)
    const s = fitnessSeries(loads, 0, 99)
    expect(s[41].ctl).toBeCloseTo(100 * (1 - Math.exp(-1)), 6)
    expect(s[6].atl).toBeCloseTo(100 * (1 - Math.exp(-1)), 6)
  })
  it('form is yesterday’s CTL − ATL and turns negative under a block', () => {
    const loads = new Map<number, number>([[0, 200], [1, 200]])
    const s = fitnessSeries(loads, 0, 30)
    expect(s[0].tsb).toBe(0)
    expect(s[1].tsb).toBeCloseTo(s[0].ctl - s[0].atl, 9)
    expect(s[2].tsb).toBeLessThan(0)
    expect(s[30].tsb).toBeGreaterThan(s[2].tsb)
  })
  it('localDay and dayToMs round-trip', () => {
    const ms = new Date(2026, 9, 6, 7, 30).getTime()
    const d = localDay(ms)
    expect(dayToMs(d)).toBe(new Date(2026, 9, 6).getTime())
    expect(localDay(new Date(2026, 9, 6, 23, 59).getTime())).toBe(d)
    expect(localDay(new Date(2026, 9, 7, 0, 1).getTime())).toBe(d + 1)
  })
})
