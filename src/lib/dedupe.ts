/** Two activities are the same if they start within `startTolSec` and last within `durTolSec`. */
export interface DedupeKey {
  startTime: number
  duration: number
}

export function isDuplicate(a: DedupeKey, b: DedupeKey, startTolSec = 5, durTolSec = 5): boolean {
  return Math.abs(a.startTime - b.startTime) <= startTolSec * 1000 && Math.abs(a.duration - b.duration) <= durTolSec
}

/** Finds a duplicate of `candidate` in `existing`, which must be sorted by startTime ascending. */
export function findDuplicate<T extends DedupeKey>(existing: T[], candidate: DedupeKey, startTolSec = 5, durTolSec = 5): T | undefined {
  // Binary search to the first entry that could match, then scan the (tiny) window.
  const lo0 = candidate.startTime - startTolSec * 1000
  let lo = 0
  let hi = existing.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (existing[mid].startTime < lo0) lo = mid + 1
    else hi = mid
  }
  for (let i = lo; i < existing.length && existing[i].startTime <= candidate.startTime + startTolSec * 1000; i++) {
    if (isDuplicate(existing[i], candidate, startTolSec, durTolSec)) return existing[i]
  }
  return undefined
}
