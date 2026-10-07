import type { ParsedActivity, TrackPoint } from '@/types'

function local(el: Element | Document, name: string): Element[] {
  return Array.from(el.getElementsByTagNameNS('*', name))
}

function num(text: string | null | undefined): number | undefined {
  if (text == null || text.trim() === '') return undefined
  const v = Number(text.trim())
  return Number.isFinite(v) ? v : undefined
}

// Strava/Garmin GPX <type> values: names ("running") or Strava's numeric codes (9 = Run).
const GPX_TYPES: Record<string, string> = { '9': 'running', '1': 'cycling', '10': 'walking', '4': 'hiking' }

export function parseGpx(text: string): ParsedActivity {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid GPX (XML parse error)')
  const trk = local(doc, 'trk')[0]
  if (!trk) throw new Error('GPX has no track')

  const typeText = Array.from(trk.children).find((c) => c.localName === 'type')?.textContent?.trim().toLowerCase()
  const sport = typeText ? (GPX_TYPES[typeText] ?? typeText) : 'other'

  const points: TrackPoint[] = []
  for (const pt of local(trk, 'trkpt')) {
    const t = Date.parse(local(pt, 'time')[0]?.textContent?.trim() ?? '')
    if (!Number.isFinite(t)) continue
    points.push({
      t,
      lat: num(pt.getAttribute('lat')),
      lon: num(pt.getAttribute('lon')),
      alt: num(local(pt, 'ele')[0]?.textContent),
      hr: num(local(pt, 'hr')[0]?.textContent),
      cadence: num(local(pt, 'cad')[0]?.textContent),
    })
  }
  const metaTime = Date.parse(local(doc, 'metadata')[0]?.getElementsByTagNameNS('*', 'time')[0]?.textContent ?? '')
  const startTime = points[0]?.t ?? metaTime
  if (!Number.isFinite(startTime)) throw new Error('GPX has no timestamps')
  return { startTime, sport, points }
}
