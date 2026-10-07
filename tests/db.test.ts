import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { Encoder, Profile, type Mesg } from '@garmin/fitsdk'

const m = (o: Record<string, unknown>) => o as Mesg
import { RunDB } from '@/lib/db'
import { gzipSync } from 'node:zlib'
import { importFiles, type ImportProgress } from '@/lib/importer'
import { buildZip } from './zipBuilder'
import { createBackup, restoreBackup, validateBackup } from '@/lib/backup'

function fitFile(name: string, startMs: number, seconds: number, sport = 'running'): File {
  const start = new Date(startMs)
  const enc = new Encoder()
  enc.onMesg(Profile.MesgNum.FILE_ID, m({ type: 'activity', manufacturer: 'development', product: 0, timeCreated: start, serialNumber: 1 }))
  for (let i = 0; i <= seconds; i += 5) {
    enc.onMesg(Profile.MesgNum.RECORD, m({ timestamp: new Date(startMs + i * 1000), distance: i * 3, heartRate: 145 }))
  }
  enc.onMesg(Profile.MesgNum.SESSION, m({
    timestamp: new Date(startMs + seconds * 1000), startTime: start, sport,
    totalElapsedTime: seconds, totalTimerTime: seconds, totalDistance: seconds * 3,
  }))
  return new File([enc.close() as Uint8Array<ArrayBuffer>], name)
}

let db: RunDB
const t0 = Date.UTC(2026, 8, 1, 6)

beforeEach(async () => {
  db = new RunDB(`test-${Math.random()}`)
  await db.open()
})

describe('importFiles', () => {
  it('imports, dedupes (in DB and in batch), skips non-runs and reports errors', async () => {
    const first = await importFiles([fitFile('a.fit', t0, 1800)], { database: db })
    expect(first[0].status).toBe('imported')

    const res = await importFiles(
      [
        fitFile('a-again.fit', t0 + 2000, 1802), // duplicate of existing
        fitFile('b.fit', t0 + 86400000, 1200),
        fitFile('b-copy.fit', t0 + 86400000, 1200), // duplicate within the batch
        fitFile('ride.fit', t0 + 2 * 86400000, 1200, 'cycling'),
        new File(['hello'], 'notes.txt'),
        new File([new Uint8Array([1, 2, 3])], 'broken.fit'),
      ],
      { database: db },
    )
    const byName = Object.fromEntries(res.map((r) => [r.fileName, r.status]))
    expect(byName).toEqual({
      'a-again.fit': 'duplicate',
      'b.fit': 'imported',
      'b-copy.fit': 'duplicate',
      'ride.fit': 'skipped',
      'notes.txt': 'error',
      'broken.fit': 'error',
    })
    expect(await db.activities.count()).toBe(2)
    expect(await db.streams.count()).toBe(2)
  })
})

describe('backup round-trip', () => {
  it('exports and restores into an empty DB, and is idempotent', async () => {
    await importFiles([fitFile('a.fit', t0, 1800), fitFile('b.fit', t0 + 86400000, 1200)], { database: db })
    const [a] = await db.activities.toArray()
    await db.activities.update(a.id, { isRace: true, name: 'Parkrun' })
    await db.kv.put({ key: 'settings', value: { hrMax: 185 } })

    const backup = JSON.parse(JSON.stringify(await createBackup(db)))
    expect(backup.activities).toHaveLength(2)

    const other = new RunDB(`restore-${Math.random()}`)
    expect(await restoreBackup(backup, { restoreSettings: true }, other)).toEqual({ added: 2, duplicates: 0 })
    expect(await restoreBackup(backup, {}, other)).toEqual({ added: 0, duplicates: 2 })
    const restored = await other.activities.toArray()
    const parkrun = restored.find((r) => r.name === 'Parkrun')!
    expect(parkrun.isRace).toBe(true)
    expect((await other.streams.get(parkrun.id))!.time.length).toBeGreaterThan(10)
    expect((await other.kv.get('settings'))!.value).toEqual({ hrMax: 185 })
  })

  it('rejects foreign JSON', () => {
    expect(() => validateBackup({ hello: 1 })).toThrow()
    expect(() => validateBackup({ format: 'stride-backup', version: 99, activities: [] })).toThrow(/newer/)
  })
})

describe('bulk import', () => {
  const day = 86400000
  async function fitBytes(name: string, start: number, seconds: number, sport = 'running') {
    return new Uint8Array(await fitFile(name, start, seconds, sport).arrayBuffer())
  }

  async function stravaZip() {
    const csv =
      'Activity ID,Activity Date,Activity Name,Activity Type,Filename\n' +
      '1,x,"Parkrun, PB!",Run,activities/1.fit.gz\n' +
      '2,x,Easy,Run,activities/2.fit\n' +
      '3,x,Commute,Ride,activities/3.fit.gz\n'
    return new File(
      [
        buildZip([
          { name: 'export_42/activities.csv', data: csv },
          { name: 'export_42/activities/1.fit.gz', data: gzipSync(await fitBytes('1', t0, 1500)), store: true },
          { name: 'export_42/activities/2.fit', data: await fitBytes('2', t0 + day, 1800) },
          // Corrupt on purpose: the CSV says it's a ride, so it must be skipped without parsing.
          { name: 'export_42/activities/3.fit.gz', data: 'garbage' },
          { name: 'export_42/activities/4.fit', data: 'not a fit file' },
          { name: 'export_42/media/photo.jpg', data: 'jpeg' },
          { name: '__MACOSX/export_42/activities/._1.fit.gz', data: 'junk' },
        ]) as Uint8Array<ArrayBuffer>,
      ],
      'export_42.zip',
    )
  }

  it('imports a Strava export zip using activities.csv for names and types', async () => {
    const progress: ImportProgress[] = []
    const res = await importFiles([await stravaZip()], { database: db, batchSize: 1, onProgress: (p) => progress.push(p) })
    const byName = Object.fromEntries(res.map((r) => [r.fileName, r.status]))
    expect(byName).toEqual({
      'export_42/activities/1.fit.gz': 'imported',
      'export_42/activities/2.fit': 'imported',
      'export_42/activities/3.fit.gz': 'skipped',
      'export_42/activities/4.fit': 'error',
    })
    const names = (await db.activities.orderBy('startTime').toArray()).map((a) => a.name)
    expect(names).toEqual(['Parkrun, PB!', 'Easy'])
    expect(progress.at(-1)).toEqual({ done: 4, total: 4, imported: 2, duplicate: 0, skipped: 1, error: 1 })

    // Re-importing the same archive: everything already there is a duplicate.
    const again = await importFiles([await stravaZip()], { database: db })
    expect(again.filter((r) => r.status === 'duplicate')).toHaveLength(2)
    expect(await db.activities.count()).toBe(2)
  })

  it('dedupes across batches within one import', async () => {
    const files = [fitFile('a.fit', t0, 1200), fitFile('b.fit', t0 + day, 1200), fitFile('a-copy.fit', t0, 1200)]
    const res = await importFiles(files, { database: db, batchSize: 1 })
    expect(res.map((r) => r.status)).toEqual(['imported', 'imported', 'duplicate'])
  })

  it('stops on cancel and keeps what was already parsed', async () => {
    const ctrl = new AbortController()
    const files = Array.from({ length: 6 }, (_, i) => fitFile(`${i}.fit`, t0 + i * day, 1200))
    const res = await importFiles(files, {
      database: db,
      batchSize: 50,
      signal: ctrl.signal,
      onProgress: (p) => {
        if (p.done === 2) ctrl.abort()
      },
    })
    expect(res).toHaveLength(2)
    expect(await db.activities.count()).toBe(2)
  })

  it('from a folder, ignores unrelated files; loose unknown files are reported', async () => {
    const folder = [
      { file: fitFile('run.fit', t0, 1200), path: 'Garmin/Activity/run.fit' },
      { file: new File(['x'], 'notes.txt'), path: 'Garmin/notes.txt' },
    ]
    const res = await importFiles([...folder, new File(['x'], 'loose.txt')], { database: db })
    expect(Object.fromEntries(res.map((r) => [r.fileName, r.status]))).toEqual({
      'Garmin/Activity/run.fit': 'imported',
      'loose.txt': 'error',
    })
  })

  it('reports a corrupt zip without aborting the rest', async () => {
    const res = await importFiles([new File(['nope'], 'broken.zip'), fitFile('ok.fit', t0, 1200)], { database: db })
    expect(res.map((r) => [r.fileName, r.status])).toEqual([
      ['broken.zip', 'error'],
      ['ok.fit', 'imported'],
    ])
  })
})
