import { describe, expect, it } from 'vitest'
import { fractionVo2Max, timeForVdot, trainingPaces, vdotFromPerformance, velocityAtVo2, vo2AtVelocity } from '@/lib/predict/vdot'

describe('VDOT (Daniels–Gilbert)', () => {
  it('matches published Daniels table values for VDOT 50', () => {
    // Daniels' Running Formula, VDOT 50: 5K 19:57, 10K 41:21, HM 1:31:35, M 3:10:49
    expect(timeForVdot(50, 5000)).toBeCloseTo(19 * 60 + 57, -1)
    expect(timeForVdot(50, 10000)).toBeCloseTo(41 * 60 + 21, -1)
    expect(Math.abs(timeForVdot(50, 21097.5) - (91 * 60 + 35))).toBeLessThan(15)
    expect(Math.abs(timeForVdot(50, 42195) - (3 * 3600 + 10 * 60 + 49))).toBeLessThan(30)
  })

  it('computes VDOT from a performance', () => {
    expect(vdotFromPerformance(5000, 20 * 60)).toBeCloseTo(49.8, 1)
    expect(vdotFromPerformance(10000, 55 * 60)).toBeCloseTo(35.8, 1)
  })

  it('timeForVdot inverts vdotFromPerformance', () => {
    for (const [d, t] of [[1609.344, 400], [5000, 1500], [10000, 3300], [42195, 14400]]) {
      const v = vdotFromPerformance(d, t)
      expect(timeForVdot(v, d)).toBeCloseTo(t, 1)
    }
  })

  it('velocityAtVo2 inverts vo2AtVelocity', () => {
    for (const v of [150, 200, 250, 320]) expect(velocityAtVo2(vo2AtVelocity(v))).toBeCloseTo(v, 6)
  })

  it('fraction of VO2max decreases with duration and is ~1 at ~11 min', () => {
    expect(fractionVo2Max(11)).toBeGreaterThan(0.99)
    expect(fractionVo2Max(11)).toBeLessThan(1.01)
    expect(fractionVo2Max(30)).toBeGreaterThan(fractionVo2Max(180))
  })

  it('gives sensible training paces', () => {
    const p = trainingPaces(50)
    // Daniels VDOT 50: T ≈ 4:15/km, I ≈ 3:52/km, E ≈ 5:00–5:40/km
    expect(Math.abs(p.threshold - 255)).toBeLessThan(5)
    expect(Math.abs(p.interval - 233)).toBeLessThan(5)
    expect(p.easy[0]).toBeLessThan(p.easy[1])
    expect(p.easy[0]).toBeGreaterThan(p.marathon)
    expect(p.marathon).toBeGreaterThan(p.threshold)
  })

  it('rejects invalid input', () => {
    expect(() => vdotFromPerformance(0, 100)).toThrow()
    expect(() => timeForVdot(-1, 5000)).toThrow()
  })
})
