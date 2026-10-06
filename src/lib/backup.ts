import type { ActivityStreams, ActivitySummary, Settings } from '@/types'
import { db, type RunDB } from './db'
import { saveActivities } from './importer'

export const BACKUP_FORMAT = 'stride-backup'
export const BACKUP_VERSION = 1

export interface BackupActivity extends ActivitySummary {
  streams?: Omit<ActivityStreams, 'id'>
}

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  settings?: Settings
  activities: BackupActivity[]
}

export async function createBackup(database: RunDB = db): Promise<Backup> {
  const [activities, streams, settings] = await Promise.all([
    database.activities.orderBy('startTime').toArray(),
    database.streams.toArray(),
    database.kv.get('settings'),
  ])
  const byId = new Map(streams.map((s) => [s.id, s]))
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: settings?.value as Settings | undefined,
    activities: activities.map((a) => {
      const s = byId.get(a.id)
      if (!s) return a
      const { id: _id, ...rest } = s
      return { ...a, streams: rest }
    }),
  }
}

export function validateBackup(data: unknown): Backup {
  const b = data as Partial<Backup>
  if (!b || b.format !== BACKUP_FORMAT || !Array.isArray(b.activities)) throw new Error('Not a Stride backup file')
  if ((b.version ?? 0) > BACKUP_VERSION) throw new Error(`Backup version ${b.version} is newer than this app supports`)
  for (const a of b.activities) {
    if (typeof a.startTime !== 'number' || typeof a.duration !== 'number' || typeof a.distance !== 'number') {
      throw new Error('Backup contains a malformed activity')
    }
  }
  return b as Backup
}

/** Merge a backup into the local database. Existing activities win (deduped by start+duration). */
export async function restoreBackup(data: unknown, opts: { restoreSettings?: boolean } = {}, database: RunDB = db) {
  const backup = validateBackup(data)
  const items = backup.activities.map(({ streams, id: _id, importedAt: _i, ...summary }) => ({
    activity: { summary, streams: streams ?? { time: [], distance: [] } },
    fileName: summary.fileName ?? summary.name,
    extra: { isRace: summary.isRace, name: summary.name },
  }))
  const results = await saveActivities(items, database)
  if (opts.restoreSettings && backup.settings) await database.kv.put({ key: 'settings', value: backup.settings })
  return {
    added: results.filter((r) => r.status === 'imported').length,
    duplicates: results.filter((r) => r.status === 'duplicate').length,
  }
}

export function backupFileName(date = new Date()): string {
  return `stride-backup-${date.toISOString().slice(0, 10)}.json`
}
