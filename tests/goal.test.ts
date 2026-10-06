import { describe, expect, it } from 'vitest'
import { assessGoal, improvementFromRamp, verdictFor } from '@/lib/predict/goal'
import { normCdf } from '@/lib/predict/stats'

const DAY = 86400000
const now = Date.UTC(2026, 9, 6)
const goalDate = Date.UTC(2026, 10, 15)
const base = { goalDistance: 10000, goalTime: 3300, goalDate, now, sigma: 0.03 }

describe('normCdf', () => {
  it('matches known values', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7)
    expect(normCdf(1.96)).toBeCloseTo(0.975, 4)
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 4)
    expect(normCdf(1)).toBeCloseTo(0.8413, 4)
    expect(normCdf(Infinity)).toBe(1)
    expect(normCdf(-Infinity)).toBe(0)
  })
})

describe('assessGoal (sub-55 10K, mid-Nov 2026)', () => {
  it('computes weeks to race day', () => {
    const a = assessGoal({ ...base, predictedTime: 3400 })
    expect(a.weeks).toBeCloseTo(40 / 7, 6)
  })

  it('projects improvement with compounding and a cap', () => {
    const a = assessGoal({ ...base, predictedTime: 3400, weeklyImprovement: 0.01, maxImprovement: 0.03 })
    expect(a.improvement).toBe(0.03)
    expect(a.projectedTime).toBeCloseTo(3400 * 0.97, 6)
    const b = assessGoal({ ...base, predictedTime: 3400, weeklyImprovement: 0.002 })
    expect(b.improvement).toBeCloseTo(1 - Math.pow(0.998, 40 / 7), 9)
  })

  it('is 50 % when the projection equals the goal', () => {
    const a = assessGoal({ ...base, goalDate: now, predictedTime: 3300.0001 })
    expect(a.probability).toBeCloseTo(0.5, 3)
  })

  it('probability rises with a faster prediction and with more time', () => {
    const slow = assessGoal({ ...base, predictedTime: 3500 })
    const fast = assessGoal({ ...base, predictedTime: 3350 })
    expect(fast.probability).toBeGreaterThan(slow.probability)
    const later = assessGoal({ ...base, predictedTime: 3500, goalDate: goalDate + 70 * DAY })
    expect(later.probability).toBeGreaterThan(slow.probability)
  })

  it('reports achieved when already predicted under target', () => {
    const a = assessGoal({ ...base, predictedTime: 3200 })
    expect(a.verdict).toBe('achieved')
    expect(a.probability).toBeGreaterThan(0.5)
  })

  it('computes required VDOT and goal pace', () => {
    const a = assessGoal({ ...base, predictedTime: 3500 })
    expect(a.goalPace).toBe(330) // 5:30/km
    expect(a.requiredVdot).toBeGreaterThan(a.currentVdot)
    expect(a.requiredVdot).toBeCloseTo(35.8, 1)
    expect(a.gapNow).toBeCloseTo(200 / 3500, 9)
  })

  it('is very unlikely for a large gap', () => {
    expect(assessGoal({ ...base, predictedTime: 4200 }).verdict).toBe('unlikely')
  })

  it('handles a past goal date (no improvement, no extra variance)', () => {
    const a = assessGoal({ ...base, predictedTime: 3400, goalDate: now - 10 * DAY })
    expect(a.weeks).toBe(0)
    expect(a.improvement).toBe(0)
    expect(a.sigma).toBe(0.03)
  })
})

describe('verdict thresholds & ramp', () => {
  it('maps probabilities to verdicts', () => {
    expect(verdictFor(0.9)).toBe('likely')
    expect(verdictFor(0.5)).toBe('possible')
    expect(verdictFor(0.2)).toBe('stretch')
    expect(verdictFor(0.05)).toBe('unlikely')
  })
  it('improvementFromRamp is clamped', () => {
    expect(improvementFromRamp(0)).toBeCloseTo(0.002, 9)
    expect(improvementFromRamp(100)).toBe(0.005)
    expect(improvementFromRamp(-100)).toBe(0)
  })
})
