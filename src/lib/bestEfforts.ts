export const EFFORT_DISTANCES = [400, 1000, 1609.344, 5000, 10000, 21097.5, 42195] as const

/**
 * Fastest time (seconds) to cover `target` meters anywhere inside the activity.
 * Uses a two-pointer sweep with linear interpolation of the segment start, O(n).
 * `time` and `distance` must be the same length and non-decreasing.
 */
export function bestEffort(time: number[], distance: number[], target: number): number | undefined {
  const n = Math.min(time.length, distance.length)
  if (n < 2 || distance[n - 1] - distance[0] < target) return undefined
  let best = Infinity
  let i = 0
  for (let j = 1; j < n; j++) {
    const endDist = distance[j]
    if (endDist - distance[0] < target) continue
    const startDist = endDist - target
    // Advance i so that distance[i] <= startDist < distance[i+1].
    while (i + 1 < j && distance[i + 1] <= startDist) i++
    const d0 = distance[i]
    const d1 = distance[i + 1]
    const frac = d1 > d0 ? (startDist - d0) / (d1 - d0) : 0
    const startTime = time[i] + frac * (time[i + 1] - time[i])
    const dt = time[j] - startTime
    if (dt > 0 && dt < best) best = dt
  }
  return Number.isFinite(best) ? best : undefined
}

export function computeBestEfforts(time: number[], distance: number[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const d of EFFORT_DISTANCES) {
    const t = bestEffort(time, distance, d)
    if (t !== undefined) out[String(d)] = Math.round(t * 10) / 10
  }
  return out
}
