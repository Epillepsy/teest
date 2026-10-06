import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { Encoder, Profile, type Mesg } from '@garmin/fitsdk'

const m = (o: Record<string, unknown>) => o as Mesg
import { RunDB } from '@/lib/db'
import { importFiles } from '@/lib/importer'
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
    const first = await importFiles([fitFile('a.fit', t0, 1800)], undefined, db)
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
      undefined,
      db,
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
    await importFiles([fitFile('a.fit', t0, 1800), fitFile('b.fit', t0 + 86400000, 1200)], undefined, db)
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
