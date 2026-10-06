import Dexie, { type Table } from 'dexie'
import type { ActivityStreams, ActivitySummary } from '@/types'

export interface KV {
  key: string
  value: unknown
}

export class RunDB extends Dexie {
  activities!: Table<ActivitySummary, string>
  streams!: Table<ActivityStreams, string>
  kv!: Table<KV, string>

  constructor(name = 'stride') {
    super(name)
    this.version(1).stores({
      activities: 'id, startTime',
      streams: 'id',
      kv: 'key',
    })
  }
}

export const db = new RunDB()

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Ask the browser not to evict our data (important: there is no server copy). */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
