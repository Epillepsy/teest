// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseGpx } from '@/lib/parse/gpx'
import { buildActivity } from '@/lib/parse/normalize'

export function gpx(type = 'running', n = 61): string {
  const pts = Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.UTC(2026, 8, 5, 7, 0, i * 10)).toISOString()
    return `<trkpt lat="${(45.0 + i * 0.00027).toFixed(6)}" lon="5.000000"><ele>${200 + (i % 5)}</ele><time>${t}</time>
      <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${150 + (i % 3)}</gpxtpx:hr><gpxtpx:cad>88</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
 <metadata><time>2026-09-05T07:00:00Z</time></metadata>
 <trk><name>Morning Run</name><type>${type}</type><trkseg>${pts}</trkseg></trk></gpx>`
}

describe('parseGpx', () => {
  it('parses Strava-style GPX with HR and cadence extensions', () => {
    const p = parseGpx(gpx())
    expect(p.startTime).toBe(Date.UTC(2026, 8, 5, 7))
    expect(p.sport).toBe('running')
    expect(p.points).toHaveLength(61)
    expect(p.points[1]).toMatchObject({ lat: 45.00027, lon: 5, alt: 201, hr: 151, cadence: 88 })
  })

  it('maps Strava numeric types and builds an activity with GPS distance', () => {
    expect(parseGpx(gpx('9')).sport).toBe('running')
    expect(parseGpx(gpx('1')).sport).toBe('cycling')
    const { summary } = buildActivity(parseGpx(gpx()), 'gpx')
    expect(summary.distance).toBeGreaterThan(1790) // 60 × ~30 m
    expect(summary.distance).toBeLessThan(1810)
    expect(summary.duration).toBe(600)
    expect(summary.avgHr).toBe(151)
  })

  it('rejects GPX without a track', () => {
    expect(() => parseGpx('<gpx xmlns="http://www.topografix.com/GPX/1/1"></gpx>')).toThrow(/track/)
  })
})
