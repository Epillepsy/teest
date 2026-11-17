import { describe, expect, it } from 'vitest'
import type { ActivitySummary } from '@/types'
import { currentWeekIndex, parseDay, SOLIRUN_PLAN as plan } from '@/lib/plan/solirun'
import { emptyProgress, matchRuns, sessionStatus, weekTotals } from '@/lib/plan/progress'

function run(id: string, isoDate: string, km: number, hour = 18): ActivitySummary {
  const d = parseDay(isoDate)
  d.setHours(hour)
  return {
    id, startTime: d.getTime(), duration: km * 400, elapsed: km * 400, distance: km * 1000,
    sport: 'running', name: id, source: 'fit', importedAt: 0, hasGps: false, bestEfforts: {},
  }
}

const session = (id: string) => plan.weeks.flatMap((w) => w.sessions).find((s) => s.id === id)!

describe('Soli\'run plan', () => {
  it('has 18 Monday-start weeks ending on race day', () => {
    expect(plan.weeks).toHaveLength(18)
    expect(plan.weeks[0].start).toBe('2026-11-16')
    expect(parseDay(plan.weeks[0].start).getDay()).toBe(1)
    expect(plan.weeks[17].end).toBe('2027-03-21')
    expect(session('w18-race').date).toBe(plan.raceDate)
  })

  it('places sessions on Mon / Wed / Fri', () => {
    expect(session('w2-long').date).toBe('2026-11-23')
    expect(session('w2-foot').date).toBe('2026-11-25')
    expect(session('w6-q').date).toBe('2026-12-25')
    expect(session('w11-q').name).toBe('5k time trial')
    expect(session('w11-q').date).toBe('2027-01-29')
  })

  it('lists the 11 quality sessions in order', () => {
    const q = plan.quality
    expect(q.map((x) => x.label)).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10', 'Q11'])
    expect(q[0].date).toBe('2026-12-25')
    expect(q[10].week).toBe(17)
  })

  it('finds the current week', () => {
    expect(currentWeekIndex(plan, new Date(2026, 9, 1))).toBe(0)
    expect(currentWeekIndex(plan, new Date(2026, 10, 25))).toBe(1)
    expect(currentWeekIndex(plan, new Date(2027, 2, 21, 23))).toBe(17)
    expect(currentWeekIndex(plan, new Date(2027, 2, 22))).toBe(-1)
  })
})

describe('matchRuns', () => {
  it('matches runs on the planned day or one day off with a similar distance', () => {
    const runs = [
      run('a', '2026-11-23', 7.2), // Mon long run
      run('b', '2026-11-26', 5.1), // Thu, one day late for Wed footing
      run('c', '2026-11-28', 12), // Sat, no session near
    ]
    const m = matchRuns(plan, runs)
    expect(m.get('w2-long')).toBe('a')
    expect(m.get('w2-foot')).toBe('b')
    expect([...m.values()]).not.toContain('c')
  })

  it('rejects runs far off the planned distance', () => {
    const m = matchRuns(plan, [run('short', '2026-11-23', 1.5), run('long', '2026-11-25', 15)])
    expect(m.size).toBe(0)
  })

  it('uses each run once and prefers the same day', () => {
    // Tuesday run sits between Mon long (8 km) and Wed footing (5 km) of week 3.
    const m = matchRuns(plan, [run('tue', '2026-12-01', 6), run('wed', '2026-12-02', 5)])
    expect(m.get('w3-foot')).toBe('wed')
    expect(m.get('w3-long')).toBe('tue')
  })

  it('ignores the rest week', () => {
    expect(matchRuns(plan, [run('x', '2026-11-18', 5)]).size).toBe(0)
  })
})

describe('sessionStatus', () => {
  const runs = [run('a', '2026-11-23', 7.4)]
  const byId = new Map(runs.map((r) => [r.id, r]))
  const matches = matchRuns(plan, runs)

  it('auto-ticks from the matched run and uses its distance', () => {
    const st = sessionStatus(session('w2-long'), emptyProgress(), matches, byId)
    expect(st).toMatchObject({ done: true, auto: true, activityId: 'a' })
    expect(st.km).toBeCloseTo(7.4)
  })

  it('lets a manual untick or km override win', () => {
    const p = emptyProgress()
    p.done['w2-long'] = false
    expect(sessionStatus(session('w2-long'), p, matches, byId)).toMatchObject({ done: false, km: 0, auto: false })
    const q = emptyProgress()
    q.km['w2-long'] = 8
    expect(sessionStatus(session('w2-long'), q, matches, byId).km).toBe(8)
  })

  it('counts a manual tick without a run at the planned km', () => {
    const p = emptyProgress()
    p.done['w2-foot'] = true
    const st = sessionStatus(session('w2-foot'), p, matches, byId)
    expect(st).toMatchObject({ done: true, km: 5, auto: false })
  })

  it('sums week totals', () => {
    const w = plan.weeks[1]
    const t = weekTotals(w, (s) => sessionStatus(s, emptyProgress(), matches, byId))
    expect(t).toMatchObject({ done: 1, total: 2, planned: 12 })
    expect(t.km).toBeCloseTo(7.4)
  })
})
