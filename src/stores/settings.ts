import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import { DEFAULT_SETTINGS, type Settings } from '@/types'
import { db } from '@/lib/db'

export const useSettings = defineStore('settings', () => {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS })

  async function load() {
    const row = await db.kv.get('settings')
    settings.value = { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }
  }

  async function save(patch: Partial<Settings>) {
    settings.value = { ...settings.value, ...patch }
    await db.kv.put({ key: 'settings', value: { ...toRaw(settings.value) } })
  }

  return { settings, load, save }
})
