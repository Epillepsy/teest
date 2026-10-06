import { normCdf } from './stats'
import { vdotFromPerformance } from './vdot'

const DAY = 86400000

export interface GoalInput {
  goalDistance: number
  /** Target time in seconds. */
  goalTime: number
  goalDate: number
  now: number
  /** Current predicted time over goalDistance (seconds) and its log-scale sigma. */
  predictedTime: number
  sigma: number
  /** Expected fractional time improvement per week of consistent training. */
  weeklyImprovement?: number
  /** Cap on total improvement before race day. */
  maxImprovement?: number
  /** Extra log-sigma per sqrt(week) for uncertain training response. */
  responseSigmaPerSqrtWeek?: number
}

export type GoalVerdict = 'achieved' | 'likely' | 'possible' | 'stretch' | 'unlikely'

export interface GoalAssessment {
  weeks: number
  projectedTime: number
  improvement: number
  sigma: number
  /** Probability of beating goalTime on goalDate (0..1). */
  probability: number
  verdict: GoalVerdict
  currentVdot: number
  requiredVdot: number
  /** Fractional gap the runner still needs to close today ((pred − goal) / pred). */
  gapNow: number
  /** sec/km needed. */
  goalPace: number
}

export function verdictFor(p: number): Exclude<GoalVerdict, 'achieved'> {
  if (p >= 0.7) return 'likely'
  if (p >= 0.4) return 'possible'
  if (p >= 0.15) return 'stretch'
  return 'unlikely'
}

/**
 * Projects current race fitness to race day with a compounding weekly improvement
 * (capped), then treats the race-day time as log-normal to get P(time < goal).
 */
export function assessGoal(input: GoalInput): GoalAssessment {
  const weekly = input.weeklyImprovement ?? 0.0025
  const cap = input.maxImprovement ?? 0.05
  const respSigma = input.responseSigmaPerSqrtWeek ?? 0.008
  const weeks = Math.max(0, (input.goalDate - input.now) / (7 * DAY))
  const improvement = Math.min(cap, 1 - Math.pow(1 - weekly, weeks))
  const projectedTime = input.predictedTime * (1 - improvement)
  const sigma = Math.sqrt(input.sigma ** 2 + respSigma ** 2 * weeks)
  const z = sigma > 0 ? (Math.log(input.goalTime) - Math.log(projectedTime)) / sigma : projectedTime <= input.goalTime ? Infinity : -Infinity
  const probability = normCdf(z)
  const currentVdot = vdotFromPerformance(input.goalDistance, input.predictedTime)
  const requiredVdot = vdotFromPerformance(input.goalDistance, input.goalTime)
  return {
    weeks,
    projectedTime,
    improvement,
    sigma,
    probability,
    verdict: input.predictedTime <= input.goalTime ? 'achieved' : verdictFor(probability),
    currentVdot,
    requiredVdot,
    gapNow: (input.predictedTime - input.goalTime) / input.predictedTime,
    goalPace: input.goalTime / (input.goalDistance / 1000),
  }
}

/** Highest weekly improvement that's plausible, scaled by recent CTL ramp (TRIMP/week). */
export function improvementFromRamp(ctlRampPerWeek: number): number {
  // Building fitness → faster gains; detraining → none. Clamp to 0..0.5 %/week.
  return Math.min(0.005, Math.max(0, 0.002 + 0.0002 * ctlRampPerWeek))
}
