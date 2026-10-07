import { describe, expect, it } from 'vitest'
import { baseName, isStravaRunType, parseCsv, parseStravaActivities } from '@/lib/csv'

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded commas/newlines and CRLF', () => {
    expect(parseCsv('a,b,c\r\n"x, y","say ""hi""","multi\nline"\r\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'multi\nline'],
      ['1', '', '3'],
    ])
    expect(parseCsv('a,b\n')).toEqual([['a', 'b']])
    expect(parseCsv('')).toEqual([])
  })
})

describe('Strava activities.csv', () => {
  // Real exports have many columns, some duplicated ("Elapsed Time", "Distance").
  const csv =
    '﻿Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Filename,Elapsed Time\n' +
    '111,"Sep 1, 2026, 6:00:00 AM","Tempo, 3x2k",Run,,2400,8.1,activities/111.fit.gz,2400\n' +
    '222,"Sep 2, 2026, 6:00:00 AM",Commute,Ride,,1800,10,activities/222.gpx,1800\n' +
    '333,"Sep 3, 2026, 6:00:00 AM",Manual entry,Run,,1800,5,,1800\n'

  it('maps base file names to names and types', () => {
    const m = parseStravaActivities(csv)
    expect(m.size).toBe(2)
    expect(m.get('111.fit.gz')).toEqual({ name: 'Tempo, 3x2k', type: 'Run' })
    expect(m.get('222.gpx')?.type).toBe('Ride')
  })

  it('ignores CSVs without a Filename column', () => {
    expect(parseStravaActivities('a,b\n1,2').size).toBe(0)
  })

  it('classifies run types', () => {
    for (const t of ['Run', 'Trail Run', 'Virtual Run']) expect(isStravaRunType(t)).toBe(true)
    for (const t of ['Ride', 'Walk', 'Hike', 'Swim']) expect(isStravaRunType(t)).toBe(false)
  })

  it('baseName strips folders and lowercases', () => {
    expect(baseName('export_1/activities/ABC.FIT.GZ')).toBe('abc.fit.gz')
    expect(baseName('x.tcx')).toBe('x.tcx')
  })
})
