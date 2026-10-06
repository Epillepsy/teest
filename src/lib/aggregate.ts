import type { ActivitySummary } from '@/types'

export type Period = 'week' | 'month'

export interface Bucket {
  /** Local start of the period (epoch ms). */
  start: number
  distance: number
  duration: number
  count: number
  ascent: number
}

/** Local Monday 00:00 of the week containing `ms`. */
export function startOfWeek(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - dow)
  return d.getTime()
}

export function startOfMonth(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

function step(start: number, period: Period, n: number): number {
  const d = new Date(start)
  if (period === 'week') d.setDate(d.getDate() + 7 * n)
  else d.setMonth(d.getMonth() + n)
  return d.getTime()
}

/** The last `count` periods ending with the one containing `now`, oldest first, gaps filled with zeros. */
export function aggregate(activities: Pick<ActivitySummary, 'startTime' | 'distance' | 'duration' | 'ascent'>[], period: Period, count: number, now: number): Bucket[] {
  const startOf = period === 'week' ? startOfWeek : startOfMonth
  const last = startOf(now)
  const buckets: Bucket[] = []
  const index = new Map<number, Bucket>()
  for (let i = count - 1; i >= 0; i--) {
    const start = step(last, period, -i)
    const b = { start, distance: 0, duration: 0, count: 0, ascent: 0 }
    buckets.push(b)
    index.set(start, b)
  }
  for (const a of activities) {
    const b = index.get(startOf(a.startTime))
    if (!b) continue
    b.distance += a.distance
    b.duration += a.duration
    b.ascent += a.ascent ?? 0
    b.count++
  }
  return buckets
}
