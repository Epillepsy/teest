import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { ActivityStreams, ActivitySummary } from '@/types'
import { db, requestPersistence } from '@/lib/db'
import { importFiles as runImport, type ImportResult } from '@/lib/importer'
import { restoreBackup as runRestore } from '@/lib/backup'

export const useActivities = defineStore('activities', () => {
  /** Newest first. */
  const list = shallowRef<ActivitySummary[]>([])
  const loaded = ref(false)
  const importing = ref(false)
  const progress = ref({ done: 0, total: 0 })
  const lastResults = ref<ImportResult[]>([])
  /** Whether the import summary panel is open (survives the import button being re-mounted). */
  const showResults = ref(false)

  const byId = computed(() => new Map(list.value.map((a) => [a.id, a])))

  async function load() {
    list.value = (await db.activities.orderBy('startTime').reverse().toArray())
    loaded.value = true
  }

  async function importFiles(files: File[]) {
    importing.value = true
    progress.value = { done: 0, total: files.length }
    try {
      lastResults.value = await runImport(files, (done, total) => (progress.value = { done, total }))
      showResults.value = true
      if (lastResults.value.some((r) => r.status === 'imported')) void requestPersistence()
      await load()
      return lastResults.value
    } finally {
      importing.value = false
    }
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

  return { list, loaded, importing, progress, lastResults, showResults, byId, load, importFiles, restore, update, remove, clearAll, streams }
})
