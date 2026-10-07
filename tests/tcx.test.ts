// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseTcx } from '@/lib/parse/tcx'
import { buildActivity } from '@/lib/parse/normalize'

function tcx(withDistance: boolean): string {
  const pts = Array.from({ length: 11 }, (_, i) => {
    const time = new Date(Date.UTC(2026, 8, 1, 6, 0, i * 30)).toISOString()
    const lat = 48.85 + i * 0.0009 // ~100 m per step
    return `<Trackpoint><Time>${time}</Time><Position><LatitudeDegrees>${lat}</LatitudeDegrees><LongitudeDegrees>2.35</LongitudeDegrees></Position>
      <AltitudeMeters>${35 + i}</AltitudeMeters>${withDistance ? `<DistanceMeters>${i * 100}</DistanceMeters>` : ''}
      <HeartRateBpm><Value>${140 + i}</Value></HeartRateBpm>
      <Extensions><ns3:TPX><ns3:RunCadence>85</ns3:RunCadence></ns3:TPX></Extensions></Trackpoint>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
 <Activities><Activity Sport="Running"><Id>2026-09-01T06:00:00.000Z</Id>
  <Lap StartTime="2026-09-01T06:00:00.000Z"><TotalTimeSeconds>300</TotalTimeSeconds><DistanceMeters>1000</DistanceMeters>
   <MaximumHeartRateBpm><Value>150</Value></MaximumHeartRateBpm><Track>${pts}</Track></Lap>
 </Activity></Activities></TrainingCenterDatabase>`
}

describe('parseTcx', () => {
  it('parses summary and trackpoints', () => {
    const p = parseTcx(tcx(true))
    expect(p.startTime).toBe(Date.UTC(2026, 8, 1, 6))
    expect(p.sport).toBe('running')
    expect(p.timerTime).toBe(300)
    expect(p.totalDistance).toBe(1000)
    expect(p.maxHr).toBe(150)
    expect(p.points).toHaveLength(11)
    expect(p.points[3]).toMatchObject({ dist: 300, hr: 143, alt: 38, cadence: 85, lon: 2.35 })
  })

  it('derives distance from GPS when trackpoints have none', () => {
    const { summary, streams } = buildActivity(parseTcx(tcx(false)), 'tcx')
    expect(streams.distance.at(-1)).toBeGreaterThan(990)
    expect(streams.distance.at(-1)).toBeLessThan(1010)
    expect(summary.hasGps).toBe(true)
    expect(summary.ascent).toBeGreaterThan(0)
    expect(summary.avgHr).toBe(145)
  })

  it('rejects garbage', () => {
    expect(() => parseTcx('<nope')).toThrow()
    expect(() => parseTcx('<a/>')).toThrow(/Activity/)
  })
})
