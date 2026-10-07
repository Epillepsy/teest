import { describe, expect, it } from 'vitest'
import { computeInsights, personalRecords } from '@/lib/insights'
import { DEFAULT_SETTINGS, type ActivitySummary } from '@/types'

const DAY = 86400000
const now = new Date(2026, 9, 6, 12).getTime()

function run(daysAgo: number, km: number, paceSec: number, extra: Partial<ActivitySummary> = {}): ActivitySummary {
  const best: Record<string, number> = {}
  for (const d of [1000, 5000, 10000]) if (km * 1000 >= d) best[String(d)] = (d / 1000) * paceSec
  return {
    id: `r${daysAgo}`, startTime: now - daysAgo * DAY, duration: km * paceSec, elapsed: km * paceSec,
    distance: km * 1000, sport: 'running', name: 'run', source: 'fit', importedAt: 0, hasGps: false,
    avgHr: 150, bestEfforts: best, ...extra,
  }
}

describe('personalRecords', () => {
  it('picks the fastest per distance', () => {
    const prs = personalRecords([run(1, 10, 330), run(5, 5, 300), run(400, 5, 280)])
    const five = prs.find((p) => p.distance === 5000)!
    expect(five.time).toBe(1400)
    expect(five.activityId).toBe('r400')
    const recent = personalRecords([run(1, 10, 330), run(5, 5, 300), run(400, 5, 280)], now - 90 * DAY)
    expect(recent.find((p) => p.distance === 5000)!.time).toBe(1500)
  })
})

describe('computeInsights', () => {
  it('produces predictions, a fitness curve and a goal assessment', () => {
    const acts = Array.from({ length: 40 }, (_, i) => run(i * 2 + 1, 8, 345)).concat(run(3, 5, 310, { id: 'race', isRace: true }))
    const ins = computeInsights(acts, DEFAULT_SETTINGS, now, 180)
    expect(ins.predictions.map((p) => p.distance)).toEqual([5000, 10000, 21097.5, 42195])
    const tenK = ins.predictions[1]
    expect(tenK.low).toBeLessThan(tenK.mid)
    expect(tenK.mid).toBeGreaterThan(3100)
    expect(tenK.mid).toBeLessThan(3400)
    expect(ins.fitness).toHaveLength(180)
    expect(ins.fitness.at(-1)!.ctl).toBeGreaterThan(0)
    expect(ins.goal).toBeDefined()
    expect(ins.goal!.probability).toBeGreaterThan(0)
    expect(ins.goal!.probability).toBeLessThanOrEqual(1)
    expect(ins.paces!.threshold).toBeLessThan(ins.paces!.easy[0])
  })
  it('handles no data', () => {
    const ins = computeInsights([], DEFAULT_SETTINGS, now)
    expect(ins.predictions).toEqual([])
    expect(ins.goal).toBeUndefined()
  })
})
