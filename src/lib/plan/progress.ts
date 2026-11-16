import type { ActivitySummary } from '@/types'
import { addDays, isoDay, parseDay, type Plan, type PlanSession, type PlanWeek } from './solirun'

/** kv key holding the runner's plan progress. */
export const PLAN_PROGRESS_KEY = 'plan-progress'

/** What the runner set by hand. Anything missing falls back to the matched run. */
export interface PlanProgress {
  /** Manual tick state; overrides the auto-match either way. */
  done: Record<string, boolean>
  /** Manual actual km; overrides the matched run's distance. */
  km: Record<string, number>
  /** Notes per week number. */
  notes: Record<string, string>
}

export const emptyProgress = (): PlanProgress => ({ done: {}, km: {}, notes: {} })

export interface SessionStatus {
  done: boolean
  /** Actual km counted for this session (0 when not done). */
  km: number
  /** The imported run matched to this session, if any. */
  activityId?: string
  /** True when the tick comes from a matched run rather than a manual tick. */
  auto: boolean
}

/** How far from the planned day a run may be and still count (Mon long run done on Tue, etc.). */
const DAY_SLACK = 1
/** Accepted distance range relative to planned km. Wide, because quality km include warm-up guesses. */
const MIN_RATIO = 0.4
const MAX_RATIO = 2

const dayDiff = (a: string, b: string) => Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / 86400000)

/**
 * Pairs imported runs with planned sessions. Each run fills at most one session and each session
 * takes at most one run. Closest day wins, then closest distance.
 */
export function matchRuns(plan: Plan, runs: ActivitySummary[]): Map<string, string> {
  const sessions = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.date && s.km > 0)
  if (!sessions.length) return new Map()
  const first = isoDay(addDays(parseDay(sessions[0].date), -DAY_SLACK))
  const last = isoDay(addDays(parseDay(sessions[sessions.length - 1].date), DAY_SLACK))

  const pairs: { s: PlanSession; run: ActivitySummary; score: number }[] = []
  for (const run of runs) {
    const day = isoDay(new Date(run.startTime))
    if (day < first || day > last) continue
    const km = run.distance / 1000
    for (const s of sessions) {
      const dd = Math.abs(dayDiff(day, s.date))
      if (dd > DAY_SLACK) continue
      const ratio = km / s.km
      if (ratio < MIN_RATIO || ratio > MAX_RATIO) continue
      pairs.push({ s, run, score: dd + Math.abs(Math.log(ratio)) })
    }
  }
  pairs.sort((a, b) => a.score - b.score || a.run.startTime - b.run.startTime)

  const out = new Map<string, string>()
  const used = new Set<string>()
  for (const p of pairs) {
    if (out.has(p.s.id) || used.has(p.run.id)) continue
    out.set(p.s.id, p.run.id)
    used.add(p.run.id)
  }
  return out
}

export function sessionStatus(
  s: PlanSession,
  progress: PlanProgress,
  matches: Map<string, string>,
  runsById: Map<string, ActivitySummary>,
): SessionStatus {
  const activityId = matches.get(s.id)
  const run = activityId ? runsById.get(activityId) : undefined
  const manual = progress.done[s.id]
  const done = manual ?? !!run
  const auto = manual === undefined && !!run
  const manualKm = progress.km[s.id]
  const km = !done ? 0 : manualKm ?? (run ? run.distance / 1000 : s.km)
  return { done, km, activityId: run?.id, auto }
}

export function weekTotals(w: PlanWeek, status: (s: PlanSession) => SessionStatus) {
  let done = 0
  let km = 0
  for (const s of w.sessions) {
    const st = status(s)
    if (st.done) done++
    km += st.km
  }
  return { done, total: w.sessions.length, km, planned: w.plannedKm }
}
