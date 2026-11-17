import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parsePlanFile, toPlanFile } from '@/lib/plan/file'
import { SOLIRUN_PLAN } from '@/lib/plan/solirun'
import { matchRuns } from '@/lib/plan/progress'

function readmeExample(): unknown {
  const md = readFileSync(resolve(__dirname, '../README.md'), 'utf8')
  const m = /## Plan file format[\s\S]*?```json\n([\s\S]*?)```/.exec(md)
  if (!m) throw new Error('README example not found')
  return JSON.parse(m[1])
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

describe('plan file', () => {
  it('round-trips the built-in plan through JSON', () => {
    const back = parsePlanFile(clone(toPlanFile(SOLIRUN_PLAN)))
    expect(back).toEqual(clone(SOLIRUN_PLAN))
  })

  it('accepts the README example', () => {
    const p = parsePlanFile(readmeExample())
    expect(p.weeks).toHaveLength(2)
    expect(p.weeks[0].kind).toBe('rest')
    expect(p.weeks[1].plannedKm).toBe(17)
    expect(p.weeks[1].gym).toBe('Deload')
    expect(p.quality[0].label).toBe('Q1')
  })

  it('fills optional fields with defaults', () => {
    const p = parsePlanFile({
      format: 'stride-plan', version: 1, id: 'x', title: 'X', raceDate: '2027-01-10',
      weeks: [{ n: 1, block: 'B', start: '2027-01-04', end: '2027-01-10', sessions: [
        { id: 'a', date: '2027-01-04', day: 'Mon', type: 'long', name: 'Long', km: 8 },
      ] }],
    })
    expect(p).toMatchObject({ subtitle: '', paces: [], quality: [], rules: [], paceNote: '' })
    expect(p.weeks[0]).toMatchObject({ kind: 'build', gym: undefined, plannedKm: 8 })
    expect(p.weeks[0].sessions[0].detail).toBe('')
  })

  it('works with run matching', () => {
    const p = parsePlanFile(readmeExample())
    const start = new Date(2026, 10, 25, 18).getTime()
    const run = { id: 'r', startTime: start, duration: 1800, elapsed: 1800, distance: 5100, sport: 'running', name: 'r', source: 'fit' as const, importedAt: 0, hasGps: false, bestEfforts: {} }
    expect(matchRuns(p, [run]).get('w2-foot')).toBe('r')
  })

  it.each([
    [{ hello: 1 }, /Not a Stride plan/],
    [{ format: 'stride-plan', version: 9 }, /newer/],
    [{ ...base(), weeks: [] }, /no weeks/],
    [{ ...base(), raceDate: '21/03/2027' }, /raceDate.*date/],
    [withSession({ type: 'swim' }), /unknown type "swim"/],
    [withSession({ km: '5' }), /"km" should be a number/],
    [withSession({ id: undefined }), /"id" is missing/],
    [{ ...base(), weeks: [week(1, '2027-01-04', 'a'), week(2, '2027-01-04', 'b')] }, /starts before/],
    [{ ...base(), weeks: [week(1, '2027-01-04', 'a'), week(2, '2027-01-11', 'a')] }, /duplicate id "a"/],
  ])('rejects a bad file (%#)', (data, msg) => {
    expect(() => parsePlanFile(data)).toThrow(msg)
  })
})

function week(n: number, start: string, id: string) {
  return { n, block: 'B', kind: 'build', start, end: start, sessions: [{ id, date: start, day: 'Mon', type: 'long', name: 'L', detail: '', km: 5 }] }
}
function base() {
  return { format: 'stride-plan', version: 1, id: 'x', title: 'X', raceDate: '2027-03-21', weeks: [week(1, '2027-01-04', 'a')] }
}
function withSession(patch: Record<string, unknown>) {
  const b = base()
  Object.assign(b.weeks[0].sessions[0], patch)
  return b
}
