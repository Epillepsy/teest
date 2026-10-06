import { riegelPredict } from './riegel'
import { timeForVdot, vdotFromPerformance } from './vdot'
import { weightedMean, weightedStd } from './stats'

const DAY = 86400000
/** z-score for the reported range: ±1.28σ ≈ 80 % interval. */
export const RANGE_Z = 1.28

export interface Effort {
  distance: number
  /** Seconds. */
  time: number
  /** Epoch ms of the activity. */
  date: number
  isRace?: boolean
  activityId?: string
}

export interface PredictionSource {
  effort: Effort
  vdot: number
  riegel: number
  vdotPrediction: number
  weight: number
}

export interface Prediction {
  distance: number
  /** Central estimate, seconds. */
  mid: number
  /** Optimistic and pessimistic ends of the ~80 % range, seconds. */
  low: number
  high: number
  /** Log-scale standard deviations used for the range. */
  sigmaLow: number
  sigmaHigh: number
  riegelMid: number
  vdotMid: number
  /** Weighted current VDOT. */
  vdot: number
  sources: PredictionSource[]
}

export interface PredictOptions {
  now: number
  windowDays?: number
  halfLifeDays?: number
  /** Max number of performances used. */
  maxSources?: number
  /** Ignore efforts shorter than this (meters). */
  minDistance?: number
  /** Drop efforts whose VDOT is more than this fraction below the best one (clearly submaximal). */
  maxVdotGap?: number
}

/**
 * Picks the strongest recent performance from each activity (by VDOT, decayed by age).
 * Fitness is revealed by best efforts, not by the average easy run, so only the top
 * performances are used.
 */
export function selectEfforts(efforts: Effort[], opts: PredictOptions): Effort[] {
  const windowDays = opts.windowDays ?? 120
  const halfLife = opts.halfLifeDays ?? 45
  const minDistance = opts.minDistance ?? 1000
  const maxSources = opts.maxSources ?? 3
  const maxGap = opts.maxVdotGap ?? 0.05
  const byActivity = new Map<string, { e: Effort; score: number; vdot: number }>()
  efforts.forEach((e, i) => {
    const age = (opts.now - e.date) / DAY
    if (age < 0 || age > windowDays || e.distance < minDistance || e.time <= 0) return
    const vdot = vdotFromPerformance(e.distance, e.time)
    const score = vdot * Math.pow(0.5, age / halfLife / 4) * (e.isRace ? 1.03 : 1)
    const key = e.activityId ?? `#${i}`
    const prev = byActivity.get(key)
    if (!prev || score > prev.score) byActivity.set(key, { e, score, vdot })
  })
  const ranked = [...byActivity.values()].sort((a, b) => b.score - a.score)
  if (!ranked.length) return []
  const top = ranked[0].vdot
  return ranked
    .filter((x) => x.vdot >= top * (1 - maxGap))
    .slice(0, maxSources)
    .map((x) => x.e)
}

/**
 * Race-time prediction combining Riegel and VDOT from the selected performances.
 *
 * Central value: weighted geometric mean of both models' predictions from every source
 * (weights: recency half-life, proximity of source distance to target, race flag).
 * Uncertainty (log scale) is the root-sum-square of:
 *   - disagreement between sources/models (weighted std of log predictions),
 *   - extrapolation error growing with |ln(target / source distance)|,
 *   - a floor for day-to-day variability, and a penalty for few sources.
 * If the inputs are mostly training efforts (not races) the optimistic side is widened,
 * since a training effort usually under-states race fitness.
 */
export function predictRace(allEfforts: Effort[], target: number, opts: PredictOptions): Prediction | null {
  const halfLife = opts.halfLifeDays ?? 45
  const efforts = selectEfforts(allEfforts, opts)
  if (!efforts.length) return null

  const sources: PredictionSource[] = efforts.map((e) => {
    const age = Math.max(0, (opts.now - e.date) / DAY)
    const recency = Math.pow(0.5, age / halfLife)
    const proximity = 1 / (1 + Math.abs(Math.log(target / e.distance)))
    const vdot = vdotFromPerformance(e.distance, e.time)
    return {
      effort: e,
      vdot,
      riegel: riegelPredict(e.distance, e.time, target),
      vdotPrediction: timeForVdot(vdot, target),
      weight: recency * proximity * (e.isRace ? 2 : 1),
    }
  })

  const logs: number[] = []
  const ws: number[] = []
  for (const s of sources) {
    logs.push(Math.log(s.riegel), Math.log(s.vdotPrediction))
    ws.push(s.weight, s.weight)
  }
  const w = sources.map((s) => s.weight)
  const mid = Math.exp(weightedMean(logs, ws))
  const riegelMid = Math.exp(weightedMean(sources.map((s) => Math.log(s.riegel)), w))
  const vdotMid = Math.exp(weightedMean(sources.map((s) => Math.log(s.vdotPrediction)), w))
  const vdot = weightedMean(sources.map((s) => s.vdot), w)

  const dispersion = weightedStd(logs, ws)
  const meanLogRatio = weightedMean(sources.map((s) => Math.abs(Math.log(target / s.effort.distance))), w)
  const extrapolation = 0.025 * meanLogRatio
  const floor = 0.015
  const fewSources = 0.01 * Math.max(0, 3 - sources.length)
  const sigma = Math.sqrt(dispersion ** 2 + extrapolation ** 2 + floor ** 2 + fewSources ** 2)

  const raceShare = weightedMean(sources.map((s) => (s.effort.isRace ? 1 : 0)), w)
  const trainingPenalty = 0.03 * (1 - raceShare)
  const sigmaLow = Math.sqrt(sigma ** 2 + trainingPenalty ** 2)
  const sigmaHigh = sigma

  return {
    distance: target,
    mid,
    low: mid * Math.exp(-RANGE_Z * sigmaLow),
    high: mid * Math.exp(RANGE_Z * sigmaHigh),
    sigmaLow,
    sigmaHigh,
    riegelMid,
    vdotMid,
    vdot,
    sources,
  }
}
