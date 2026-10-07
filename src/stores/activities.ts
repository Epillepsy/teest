import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { ActivityStreams, ActivitySummary } from '@/types'
import { db, requestPersistence } from '@/lib/db'
import { importFiles as runImport, type ImportProgress, type ImportResult, type PickedFile } from '@/lib/importer'
import { restoreBackup as runRestore } from '@/lib/backup'

export const useActivities = defineStore('activities', () => {
  /** Newest first. */
  const list = shallowRef<ActivitySummary[]>([])
  const loaded = ref(false)
  const importing = ref(false)
  /** 'scanning' while archives/folders are being listed, then 'importing'. */
  const phase = ref<'scanning' | 'importing'>('scanning')
  const progress = ref<ImportProgress>({ done: 0, total: 0, imported: 0, duplicate: 0, skipped: 0, error: 0 })
  const cancelled = ref(false)
  let abort: AbortController | undefined
  const lastResults = ref<ImportResult[]>([])
  /** Whether the import summary panel is open (survives the import button being re-mounted). */
  const showResults = ref(false)

  const byId = computed(() => new Map(list.value.map((a) => [a.id, a])))

  async function load() {
    list.value = (await db.activities.orderBy('startTime').reverse().toArray())
    loaded.value = true
  }

  async function importFiles(files: (File | PickedFile)[]) {
    if (importing.value) return lastResults.value
    importing.value = true
    cancelled.value = false
    showResults.value = false
    phase.value = 'scanning'
    progress.value = { done: 0, total: 0, imported: 0, duplicate: 0, skipped: 0, error: 0 }
    abort = new AbortController()
    try {
      lastResults.value = await runImport(files, {
        signal: abort.signal,
        onProgress: (p) => {
          phase.value = 'importing'
          progress.value = p
        },
      })
      cancelled.value = abort.signal.aborted
      showResults.value = true
      if (lastResults.value.some((r) => r.status === 'imported')) void requestPersistence()
      await load()
      return lastResults.value
    } finally {
      importing.value = false
      abort = undefined
    }
  }

  /** Stops a running import; activities already parsed are kept. */
  function cancelImport() {
    abort?.abort()
  }

  async function restore(data: unknown, restoreSettings: boolean) {
    const r = await runRestore(data, { restoreSettings })
    await load()
    return r
  }

  async function update(id: string, patch: Partial<Pick<ActivitySummary, 'name' | 'isRace'>>) {
    await db.activities.update(id, patch)
    list.value = list.value.map((a) => (a.id === id ? { ...a, ...patch } : a))
  }

  async function remove(id: string) {
    await db.transaction('rw', db.activities, db.streams, async () => {
      await db.activities.delete(id)
      await db.streams.delete(id)
    })
    list.value = list.value.filter((a) => a.id !== id)
  }

  async function clearAll() {
    await db.transaction('rw', db.activities, db.streams, async () => {
      await db.activities.clear()
      await db.streams.clear()
    })
    list.value = []
  }

  function streams(id: string): Promise<ActivityStreams | undefined> {
    return db.streams.get(id)
  }

  return { list, loaded, importing, phase, progress, cancelled, lastResults, showResults, cancelImport, byId, load, importFiles, restore, update, remove, clearAll, streams }
})
