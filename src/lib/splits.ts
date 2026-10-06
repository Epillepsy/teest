export interface Split {
  index: number
  /** Meters in this split (1000 except possibly the last). */
  distance: number
  /** Seconds. */
  time: number
  /** Seconds per km. */
  pace: number
  avgHr?: number
  /** Net elevation change in meters. */
  elevation?: number
}

function interp(xs: number[], ys: number[], x: number, from: number): number {
  let i = from
  while (i + 1 < xs.length && xs[i + 1] < x) i++
  if (i + 1 >= xs.length) return ys[xs.length - 1]
  const x0 = xs[i]
  const x1 = xs[i + 1]
  const f = x1 > x0 ? (x - x0) / (x1 - x0) : 0
  return ys[i] + f * (ys[i + 1] - ys[i])
}

/**
 * Split an activity into fixed-length segments (default 1 km) by interpolating the time at
 * each boundary. A trailing partial split is included if it is at least `minPartial` meters.
 */
export function computeSplits(
  time: number[],
  distance: number[],
  opts: { hr?: (number | null)[]; alt?: (number | null)[]; splitLength?: number; minPartial?: number } = {},
): Split[] {
  const len = opts.splitLength ?? 1000
  const minPartial = opts.minPartial ?? 50
  const n = Math.min(time.length, distance.length)
  if (n < 2) return []
  const total = distance[n - 1]
  const splits: Split[] = []
  let prevDist = distance[0]
  let prevTime = time[0]
  let sampleIdx = 0
  for (let k = 1; prevDist < total; k++) {
    const boundary = Math.min(distance[0] + k * len, total)
    const segLen = boundary - prevDist
    if (segLen < minPartial && boundary === total && splits.length > 0) break
    const t = interp(distance, time, boundary, Math.max(0, sampleIdx - 1))
    let hrSum = 0
    let hrN = 0
    let altStart: number | null = null
    let altEnd: number | null = null
    while (sampleIdx < n && distance[sampleIdx] <= boundary) {
      const h = opts.hr?.[sampleIdx]
      if (h != null) {
        hrSum += h
        hrN++
      }
      const a = opts.alt?.[sampleIdx]
      if (a != null) {
        if (altStart === null) altStart = a
        altEnd = a
      }
      sampleIdx++
    }
    const dt = t - prevTime
    splits.push({
      index: k,
      distance: segLen,
      time: dt,
      pace: segLen > 0 ? dt / (segLen / 1000) : NaN,
      avgHr: hrN ? hrSum / hrN : undefined,
      elevation: altStart !== null && altEnd !== null ? altEnd - altStart : undefined,
    })
    prevDist = boundary
    prevTime = t
  }
  return splits
}

/**
 * Pace (sec/km) per sample using a centred rolling window of `windowSec` seconds.
 * Returns null where the runner is (almost) stationary.
 */
export function rollingPace(time: number[], distance: number[], windowSec = 20): (number | null)[] {
  const n = time.length
  const out: (number | null)[] = new Array(n).fill(null)
  let lo = 0
  let hi = 0
  const half = windowSec / 2
  for (let i = 0; i < n; i++) {
    while (lo < i && time[i] - time[lo] > half) lo++
    while (hi + 1 < n && time[hi + 1] - time[i] <= half) hi++
    const dt = time[hi] - time[lo]
    const dd = distance[hi] - distance[lo]
    if (dt > 0 && dd > 0) {
      const pace = dt / (dd / 1000)
      out[i] = pace < 1800 ? pace : null // slower than 30:00/km = standing
    }
  }
  return out
}
