import type { ActivitySummary, Settings } from '@/types'
import { EFFORT_DISTANCES } from './bestEfforts'
import { predictRace, type Effort, type Prediction } from './predict/predictor'
import { trainingPaces, type TrainingPaces } from './predict/vdot'
import { activityLoad, fitnessSeries, localDay, type FitnessPoint } from './predict/load'
import { assessGoal, improvementFromRamp, type GoalAssessment } from './predict/goal'

export const PREDICT_DISTANCES = [5000, 10000, 21097.5, 42195]

export interface PersonalRecord {
  distance: number
  time: number
  activityId: string
  date: number
}

export function effortsFrom(activities: ActivitySummary[]): Effort[] {
  const out: Effort[] = []
  for (const a of activities) {
    for (const [d, t] of Object.entries(a.bestEfforts ?? {})) {
      out.push({ distance: Number(d), time: t, date: a.startTime, isRace: a.isRace, activityId: a.id })
    }
  }
  return out
}

/** All-time best per standard distance, plus the best within `sinceMs` if given. */
export function personalRecords(activities: ActivitySummary[], sinceMs = -Infinity): PersonalRecord[] {
  const best = new Map<number, PersonalRecord>()
  for (const a of activities) {
    if (a.startTime < sinceMs) continue
    for (const d of EFFORT_DISTANCES) {
      const t = a.bestEfforts?.[String(d)]
      if (t === undefined) continue
      const cur = best.get(d)
      if (!cur || t < cur.time) best.set(d, { distance: d, time: t, activityId: a.id, date: a.startTime })
    }
  }
  return EFFORT_DISTANCES.filter((d) => best.has(d)).map((d) => best.get(d)!)
}

/** Current VDOT from recent best efforts, as used by the predictor. */
export function currentVdot(activities: ActivitySummary[], s: Settings, now: number): number | undefined {
  const efforts = effortsFrom(activities)
  return predictRace(efforts, PREDICT_DISTANCES[0], { now, windowDays: s.predictorWindowDays })?.vdot
}

export interface Insights {
  predictions: Prediction[]
  vdot?: number
  paces?: TrainingPaces
  fitness: FitnessPoint[]
  /** CTL change over the last 28 days, per week. */
  ctlRamp: number
  goal?: GoalAssessment
  goalPrediction?: Prediction
  weeklyImprovement: number
}

export function computeInsights(activities: ActivitySummary[], s: Settings, now: number, fitnessDays = 365): Insights {
  const efforts = effortsFrom(activities)
  const opts = { now, windowDays: s.predictorWindowDays }
  const predictions = PREDICT_DISTANCES.map((d) => predictRace(efforts, d, opts)).filter((p): p is Prediction => !!p)
  const vdot = predictions[0]?.vdot
  const paces = vdot ? trainingPaces(vdot) : undefined

  const daily = new Map<number, number>()
  const loadSettings = { hrRest: s.hrRest, hrMax: s.hrMax, sex: s.sex, thresholdPace: paces?.threshold }
  for (const a of activities) {
    const d = localDay(a.startTime)
    daily.set(d, (daily.get(d) ?? 0) + activityLoad({ durationSec: a.duration, distance: a.distance, avgHr: a.avgHr }, loadSettings))
  }
  const today = localDay(now)
  const firstDay = activities.length ? Math.min(...activities.map((a) => localDay(a.startTime))) : today
  // Warm up the model from the first activity so CTL isn't biased low, then trim for display.
  const full = fitnessSeries(daily, Math.min(firstDay, today - fitnessDays), today)
  const fitness = full.slice(-fitnessDays)
  const last = full.at(-1)
  const prev = full.at(-29)
  const ctlRamp = last && prev ? ((last.ctl - prev.ctl) / 28) * 7 : 0

  const weeklyImprovement = improvementFromRamp(ctlRamp)
  const goalPrediction = predictRace(efforts, s.goalDistance, opts) ?? undefined
  const goal = goalPrediction
    ? assessGoal({
        goalDistance: s.goalDistance,
        goalTime: s.goalTime,
        goalDate: new Date(s.goalDate + 'T09:00').getTime(),
        now,
        predictedTime: goalPrediction.mid,
        sigma: (goalPrediction.sigmaLow + goalPrediction.sigmaHigh) / 2,
        weeklyImprovement,
      })
    : undefined

  return { predictions, vdot, paces, fitness, ctlRamp, goal, goalPrediction, weeklyImprovement }
}
