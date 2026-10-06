/**
 * Jack Daniels & Jimmy Gilbert "Oxygen Power" formulas.
 * v in meters/minute, t in minutes.
 */

/** Oxygen cost (ml/kg/min) of running at velocity v (m/min). */
export function vo2AtVelocity(v: number): number {
  return -4.6 + 0.182258 * v + 0.000104 * v * v
}

/** Fraction of VO2max sustainable for a race lasting t minutes. */
export function fractionVo2Max(tMin: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin)
}

/** VDOT from a race performance (meters, seconds). */
export function vdotFromPerformance(distance: number, seconds: number): number {
  if (distance <= 0 || seconds <= 0) throw new RangeError('distance and time must be positive')
  const tMin = seconds / 60
  return vo2AtVelocity(distance / tMin) / fractionVo2Max(tMin)
}

/** Inverse of vo2AtVelocity: velocity (m/min) that costs `vo2`. */
export function velocityAtVo2(vo2: number): number {
  const a = 0.000104
  const b = 0.182258
  const c = -4.6 - vo2
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
}

/** Equivalent race time (seconds) over `distance` for a runner with the given VDOT. */
export function timeForVdot(vdot: number, distance: number): number {
  if (vdot <= 0 || distance <= 0) throw new RangeError('vdot and distance must be positive')
  // vdotFromPerformance is strictly decreasing in time -> bisection is safe.
  let lo = 1 // seconds
  let hi = 60 * 60 * 48
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (vdotFromPerformance(distance, mid) > vdot) lo = mid
    else hi = mid
    if (hi - lo < 1e-3) break
  }
  return (lo + hi) / 2
}

export interface TrainingPaces {
  /** sec/km ranges [fast, slow] or single values. */
  easy: [number, number]
  marathon: number
  threshold: number
  interval: number
}

/** Daniels training paces (sec/km) for a VDOT, using %VO2max intensities. */
export function trainingPaces(vdot: number): TrainingPaces {
  const pace = (pct: number) => 60000 / velocityAtVo2(vdot * pct)
  return {
    easy: [pace(0.7), pace(0.6)],
    marathon: timeForVdot(vdot, 42195) / 42.195,
    threshold: pace(0.88),
    interval: pace(0.975),
  }
}
