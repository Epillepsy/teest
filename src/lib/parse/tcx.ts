import type { ParsedActivity, TrackPoint } from '@/types'

// TCX uses a default namespace plus an extension namespace (ns3/TPX); match on local names.
function children(el: Element | Document, name: string): Element[] {
  return Array.from(el.getElementsByTagNameNS('*', name))
}

function first(el: Element, name: string): Element | undefined {
  return el.getElementsByTagNameNS('*', name)[0]
}

function numText(el: Element | undefined): number | undefined {
  if (!el?.textContent) return undefined
  const v = Number(el.textContent.trim())
  return Number.isFinite(v) ? v : undefined
}

export function parseTcx(text: string): ParsedActivity {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid TCX (XML parse error)')
  const activity = children(doc, 'Activity')[0]
  if (!activity) throw new Error('TCX has no <Activity>')

  const sport = (activity.getAttribute('Sport') ?? 'other').toLowerCase()
  const idText = first(activity, 'Id')?.textContent?.trim()

  let timerTime = 0
  let totalDistance = 0
  let maxHr: number | undefined
  const points: TrackPoint[] = []

  for (const lap of children(activity, 'Lap')) {
    // Only take the lap's own direct summary children, not nested trackpoint values.
    for (const c of Array.from(lap.children)) {
      if (c.localName === 'TotalTimeSeconds') timerTime += numText(c) ?? 0
      else if (c.localName === 'DistanceMeters') totalDistance += numText(c) ?? 0
      else if (c.localName === 'MaximumHeartRateBpm') {
        const v = numText(first(c, 'Value'))
        if (v !== undefined) maxHr = Math.max(maxHr ?? 0, v)
      }
    }
    for (const tp of children(lap, 'Trackpoint')) {
      const timeText = first(tp, 'Time')?.textContent?.trim()
      const t = timeText ? Date.parse(timeText) : NaN
      if (!Number.isFinite(t)) continue
      const pos = first(tp, 'Position')
      const hrEl = first(tp, 'HeartRateBpm')
      // Trackpoint DistanceMeters is a direct child; a Position never contains one.
      const distEl = Array.from(tp.children).find((c) => c.localName === 'DistanceMeters')
      points.push({
        t,
        lat: pos ? numText(first(pos, 'LatitudeDegrees')) : undefined,
        lon: pos ? numText(first(pos, 'LongitudeDegrees')) : undefined,
        alt: numText(first(tp, 'AltitudeMeters')),
        dist: numText(distEl),
        hr: hrEl ? numText(first(hrEl, 'Value')) : undefined,
        cadence: numText(first(tp, 'RunCadence')) ?? numText(first(tp, 'Cadence')),
      })
    }
  }

  const startTime = (idText ? Date.parse(idText) : NaN) || points[0]?.t
  if (!Number.isFinite(startTime)) throw new Error('TCX has no start time')

  return {
    startTime,
    sport,
    timerTime: timerTime || undefined,
    totalDistance: totalDistance || undefined,
    maxHr,
    points,
  }
}
