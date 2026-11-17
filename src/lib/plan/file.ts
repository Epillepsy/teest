import type { Plan, PlanSession, PlanWeek, SessionType, WeekKind } from './solirun'

/**
 * Plan file: a JSON export of a training plan, e.g. from the "Download for Stride" button
 * on the plan artifact. Importing one replaces the plan without rebuilding the app.
 *
 * {
 *   "format": "stride-plan", "version": 1,
 *   "id", "title", "subtitle", "raceDate": "YYYY-MM-DD",
 *   "paces": [{ "effort", "pace", "hr", "cadence" }], "paceNote",
 *   "quality": [{ "label", "title", "note", "week", "date" }],
 *   "rules": [{ "title", "items": [string] }],
 *   "weeks": [{ "n", "block", "kind", "start", "end", "gym"?,
 *               "sessions": [{ "id", "date", "day", "type", "name", "detail", "km" }] }]
 * }
 *
 * Session ids are what ticks, km and notes hang on, so keep them stable across versions
 * of the same plan (e.g. "w9-q").
 */
export const PLAN_FORMAT = 'stride-plan'
export const PLAN_VERSION = 1

export interface PlanFile extends Plan {
  format: typeof PLAN_FORMAT
  version: number
}

const WEEK_KINDS: WeekKind[] = ['build', 'rest', 'deload', 'test']
const SESSION_TYPES: SessionType[] = ['rest', 'long', 'footing', 'quality', 'test', 'race']
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

class PlanFileError extends Error {}

function fail(msg: string): never {
  throw new PlanFileError(msg)
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
function str(o: Record<string, unknown>, k: string, where: string, optional = false): string {
  const v = o[k]
  if (v === undefined || v === null) {
    if (optional) return ''
    fail(`${where}: "${k}" is missing`)
  }
  if (typeof v !== 'string') fail(`${where}: "${k}" should be text`)
  return v
}
function day(o: Record<string, unknown>, k: string, where: string, allowEmpty = false): string {
  const v = str(o, k, where, allowEmpty)
  if (allowEmpty && v === '') return v
  if (!DAY_RE.test(v)) fail(`${where}: "${k}" should be a date like 2027-03-21`)
  return v
}
function num(o: Record<string, unknown>, k: string, where: string): number {
  const v = o[k]
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) fail(`${where}: "${k}" should be a number`)
  return v
}
function arr(o: Record<string, unknown>, k: string, where: string, optional = false): unknown[] {
  const v = o[k]
  if (v === undefined && optional) return []
  if (!Array.isArray(v)) fail(`${where}: "${k}" should be a list`)
  return v
}

/** Validates and normalises a parsed plan file. Throws with a readable message when it is not usable. */
export function parsePlanFile(data: unknown): Plan {
  if (!isObj(data) || data.format !== PLAN_FORMAT) fail('Not a Stride plan file')
  const version = typeof data.version === 'number' ? data.version : 0
  if (version > PLAN_VERSION) fail(`Plan file version ${version} is newer than this app supports`)

  const ids = new Set<string>()
  const weeks: PlanWeek[] = arr(data, 'weeks', 'Plan').map((w, i) => {
    const where = `Week ${i + 1}`
    if (!isObj(w)) fail(`${where} is malformed`)
    const kind = str(w, 'kind', where, true) || 'build'
    if (!WEEK_KINDS.includes(kind as WeekKind)) fail(`${where}: unknown kind "${kind}"`)
    const sessions: PlanSession[] = arr(w, 'sessions', where).map((s, j) => {
      const sw = `${where}, session ${j + 1}`
      if (!isObj(s)) fail(`${sw} is malformed`)
      const id = str(s, 'id', sw)
      if (ids.has(id)) fail(`${sw}: duplicate id "${id}"`)
      ids.add(id)
      const type = str(s, 'type', sw)
      if (!SESSION_TYPES.includes(type as SessionType)) fail(`${sw}: unknown type "${type}"`)
      return {
        id,
        date: day(s, 'date', sw, true),
        day: str(s, 'day', sw),
        type: type as SessionType,
        name: str(s, 'name', sw),
        detail: str(s, 'detail', sw, true),
        km: num(s, 'km', sw),
      }
    })
    const n = num(w, 'n', where)
    return {
      n,
      block: str(w, 'block', where),
      kind: kind as WeekKind,
      start: day(w, 'start', where),
      end: day(w, 'end', where),
      gym: str(w, 'gym', where, true) || undefined,
      sessions,
      plannedKm: sessions.reduce((a, s) => a + s.km, 0),
    }
  })
  if (!weeks.length) fail('Plan has no weeks')
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i].start <= weeks[i - 1].start) fail(`Week ${weeks[i].n} starts before the week above it`)
  }

  return {
    id: str(data, 'id', 'Plan'),
    title: str(data, 'title', 'Plan'),
    subtitle: str(data, 'subtitle', 'Plan', true),
    raceDate: day(data, 'raceDate', 'Plan'),
    paces: arr(data, 'paces', 'Plan', true).map((p, i) => {
      const where = `Pace row ${i + 1}`
      if (!isObj(p)) fail(`${where} is malformed`)
      return { effort: str(p, 'effort', where), pace: str(p, 'pace', where), hr: str(p, 'hr', where, true), cadence: str(p, 'cadence', where, true) }
    }),
    paceNote: str(data, 'paceNote', 'Plan', true),
    quality: arr(data, 'quality', 'Plan', true).map((q, i) => {
      const where = `Quality session ${i + 1}`
      if (!isObj(q)) fail(`${where} is malformed`)
      return { label: str(q, 'label', where), title: str(q, 'title', where), note: str(q, 'note', where, true), week: num(q, 'week', where), date: day(q, 'date', where, true) }
    }),
    rules: arr(data, 'rules', 'Plan', true).map((r, i) => {
      const where = `Rule section ${i + 1}`
      if (!isObj(r)) fail(`${where} is malformed`)
      return {
        title: str(r, 'title', where),
        items: arr(r, 'items', where).map((x) => (typeof x === 'string' ? x : fail(`${where}: items should be text`))),
      }
    }),
    weeks,
  }
}

export function toPlanFile(plan: Plan): PlanFile {
  return { format: PLAN_FORMAT, version: PLAN_VERSION, ...plan }
}
