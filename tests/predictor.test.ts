import { describe, expect, it } from 'vitest'
import { predictRace, selectEfforts, type Effort } from '@/lib/predict/predictor'
import { riegelPredict } from '@/lib/predict/riegel'
import { timeForVdot, vdotFromPerformance } from '@/lib/predict/vdot'

const DAY = 86400000
const now = Date.UTC(2026, 9, 6)

describe('selectEfforts', () => {
  it('keeps one (the strongest) effort per activity, within the window, above min distance', () => {
    const efforts: Effort[] = [
      { distance: 5000, time: 1500, date: now - DAY, activityId: 'a' },
      { distance: 1000, time: 240, date: now - DAY, activityId: 'a' }, // stronger in VDOT terms
      { distance: 400, time: 60, date: now - DAY, activityId: 'a' }, // too short
      { distance: 5000, time: 1400, date: now - 400 * DAY, activityId: 'b' }, // too old
      { distance: 5000, time: 1600, date: now + DAY, activityId: 'c' }, // future
    ]
    const sel = selectEfforts(efforts, { now })
    expect(sel).toHaveLength(1)
    expect(sel[0].distance).toBe(1000)
  })

  it('limits the number of sources to the strongest ones', () => {
    const efforts: Effort[] = [1500, 1480, 1600, 1700, 1520].map((t, i) => ({ distance: 5000, time: t, date: now - DAY * (i + 1), activityId: String(i) }))
    const sel = selectEfforts(efforts, { now, maxSources: 3 })
    expect(sel.map((e) => e.time).sort()).toEqual([1480, 1500, 1520])
  })

  it('drops clearly submaximal efforts (easy runs) relative to the best', () => {
    const efforts: Effort[] = [
      { distance: 5000, time: 1500, date: now - DAY, activityId: 'race', isRace: true },
      { distance: 5000, time: 1530, date: now - 2 * DAY, activityId: 'tempo' }, // ~2 % slower: kept
      { distance: 5000, time: 1800, date: now - 3 * DAY, activityId: 'easy' }, // 20 % slower: dropped
    ]
    expect(selectEfforts(efforts, { now }).map((e) => e.activityId)).toEqual(['race', 'tempo'])
  })
})

describe('predictRace', () => {
  it('returns null without data', () => {
    expect(predictRace([], 10000, { now })).toBeNull()
  })

  it('blends Riegel and VDOT for a single race', () => {
    const p = predictRace([{ distance: 5000, time: 1500, date: now, isRace: true }], 10000, { now })!
    const r = riegelPredict(5000, 1500, 10000)
    const v = timeForVdot(vdotFromPerformance(5000, 1500), 10000)
    expect(p.riegelMid).toBeCloseTo(r, 6)
    expect(p.vdotMid).toBeCloseTo(v, 6)
    expect(p.mid).toBeCloseTo(Math.sqrt(r * v), 6) // geometric mean of the two
    expect(p.low).toBeLessThan(p.mid)
    expect(p.high).toBeGreaterThan(p.mid)
    expect(p.vdot).toBeCloseTo(vdotFromPerformance(5000, 1500), 6)
  })

  it('predicting the source distance returns ~the source time', () => {
    const p = predictRace([{ distance: 10000, time: 3000, date: now, isRace: true }], 10000, { now })!
    expect(p.mid).toBeCloseTo(3000, 2)
  })

  it('widens the range with extrapolation distance', () => {
    const e: Effort[] = [{ distance: 5000, time: 1500, date: now, isRace: true }]
    const near = predictRace(e, 10000, { now })!
    const far = predictRace(e, 42195, { now })!
    expect(far.sigmaHigh).toBeGreaterThan(near.sigmaHigh)
  })

  it('widens the optimistic side for training efforts only', () => {
    const race = predictRace([{ distance: 5000, time: 1500, date: now, isRace: true }], 10000, { now })!
    const training = predictRace([{ distance: 5000, time: 1500, date: now }], 10000, { now })!
    expect(training.sigmaLow).toBeGreaterThan(race.sigmaLow)
    expect(training.sigmaHigh).toBeCloseTo(race.sigmaHigh, 10)
  })

  it('weights recent performances more', () => {
    const efforts: Effort[] = [
      { distance: 10000, time: 3000, date: now - 2 * DAY, activityId: 'new' },
      { distance: 10000, time: 3300, date: now - 100 * DAY, activityId: 'old' },
    ]
    const p = predictRace(efforts, 10000, { now })!
    expect(p.mid).toBeLessThan(3150)
    expect(p.mid).toBeGreaterThan(3000)
  })

  it('more sources that agree reduce the uncertainty', () => {
    const one = predictRace([{ distance: 10000, time: 3000, date: now, isRace: true, activityId: 'a' }], 10000, { now })!
    const three = predictRace(
      ['a', 'b', 'c'].map((id, i) => ({ distance: 10000, time: 3000, date: now - i * DAY, isRace: true, activityId: id })),
      10000,
      { now },
    )!
    expect(three.sigmaHigh).toBeLessThan(one.sigmaHigh)
  })
})
