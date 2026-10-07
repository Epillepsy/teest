import { describe, expect, it } from 'vitest'
import {
  effectiveHrMax,
  effortLevel,
  estimateHrMax,
  hrZoneOf,
  hrZones,
  MAX_SAMPLE_GAP,
  paceZoneOf,
  paceZones,
  timeInZones,
} from '@/lib/zones'
import { trainingPaces } from '@/lib/predict/vdot'
import { rollingPace } from '@/lib/splits'
import { synthStream } from './helpers'

describe('HR zones', () => {
  const zones = hrZones(200)
  it('splits at 60/70/80/90 % of max HR', () => {
    expect(zones.map((z) => [z.from, z.to])).toEqual([
      [0, 120],
      [120, 140],
      [140, 160],
      [160, 180],
      [180, Infinity],
    ])
  })
  it('classifies boundaries into the upper zone', () => {
    expect(hrZoneOf(100, zones)).toBe(0)
    expect(hrZoneOf(119, zones)).toBe(0)
    expect(hrZoneOf(120, zones)).toBe(1)
    expect(hrZoneOf(179, zones)).toBe(3)
    expect(hrZoneOf(180, zones)).toBe(4)
    expect(hrZoneOf(230, zones)).toBe(4)
  })
})

describe('max HR estimate', () => {
  it('needs at least 3 runs', () => {
    expect(estimateHrMax([180, 185])).toBeUndefined()
  })
  it('ignores a single spike and implausible values', () => {
    expect(estimateHrMax([178, 240, 186, 199, undefined, 90])).toBe(186)
  })
  it('prefers a user-changed setting, else the estimate, else the default', () => {
    expect(effectiveHrMax(182, 190, [170, 175, 176])).toBe(182)
    expect(effectiveHrMax(190, 190, [170, 175, 176])).toBe(175)
    expect(effectiveHrMax(190, 190, [])).toBe(190)
  })
})

describe('pace zones', () => {
  const p = trainingPaces(50)
  const zones = paceZones(p)
  it('are ordered slow to fast around Daniels paces', () => {
    for (let i = 1; i < zones.length; i++) expect(zones[i].from).toBeLessThan(zones[i - 1].from)
    expect(zones[0].from).toBe(Infinity)
    expect(zones[4].to).toBe(0)
  })
  it('puts each training pace in its own zone', () => {
    expect(paceZoneOf(p.easy[1] + 30, zones)).toBe(0)
    expect(paceZoneOf((p.easy[0] + p.easy[1]) / 2, zones)).toBe(1)
    expect(paceZoneOf(p.marathon, zones)).toBe(2)
    expect(paceZoneOf(p.threshold, zones)).toBe(3)
    expect(paceZoneOf(p.interval, zones)).toBe(4)
  })
})

describe('timeInZones', () => {
  const zones = hrZones(200)
  it('credits each interval to the zone of its end sample', () => {
    const time = [0, 10, 20, 30, 40]
    const hr = [110, 110, 130, 150, 185]
    const out = timeInZones(time, hr, zones, hrZoneOf)
    expect(out.map((z) => z.seconds)).toEqual([10, 10, 10, 0, 10])
    expect(out.reduce((a, z) => a + z.share, 0)).toBeCloseTo(1, 9)
  })
  it('skips missing values and pauses', () => {
    const time = [0, 5, 10, 10 + MAX_SAMPLE_GAP + 1, 15 + MAX_SAMPLE_GAP + 1]
    const hr = [130, null, 130, 130, 130]
    const out = timeInZones(time, hr, zones, hrZoneOf)
    expect(out[1].seconds).toBe(10)
  })
  it('returns zero shares when nothing is zoned', () => {
    const out = timeInZones([0, 1], [null, null], zones, hrZoneOf)
    expect(out.every((z) => z.seconds === 0 && z.share === 0)).toBe(true)
  })
  it('works on a pace stream', () => {
    const p = trainingPaces(50)
    const s = synthStream([
      [600, Math.round(p.easy[0] + 10)],
      [300, Math.round(p.threshold)],
    ])
    const out = timeInZones(s.time, rollingPace(s.time, s.distance, 30), paceZones(p), paceZoneOf)
    expect(out[1].seconds).toBeGreaterThan(560)
    expect(out[3].seconds).toBeGreaterThan(260)
    expect(out[1].seconds + out[2].seconds + out[3].seconds).toBe(900)
  })
})

describe('effortLevel', () => {
  it('maps load scores to labels', () => {
    expect(effortLevel(30)).toBe('Easy')
    expect(effortLevel(80)).toBe('Moderate')
    expect(effortLevel(150)).toBe('Hard')
    expect(effortLevel(250)).toBe('Very hard')
    expect(effortLevel(400)).toBe('Extreme')
  })
})
