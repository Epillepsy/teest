<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useActivities } from '@/stores/activities'
import { useSettings } from '@/stores/settings'
import { backupFileName, createBackup } from '@/lib/backup'
import { formatDuration, parseDuration } from '@/lib/format'
import { requestPersistence } from '@/lib/db'
import type { Settings } from '@/types'

const store = useActivities()
const settingsStore = useSettings()

const draft = ref<Settings>({ ...settingsStore.settings })
const goalTimeText = ref(formatDuration(draft.value.goalTime))
watch(
  () => settingsStore.settings,
  (s) => {
    draft.value = { ...s }
    goalTimeText.value = formatDuration(s.goalTime)
  },
)
const goalTimeValid = computed(() => parseDuration(goalTimeText.value) > 0)
const saved = ref(false)

async function save() {
  if (!goalTimeValid.value) return
  if (draft.value.hrMax <= draft.value.hrRest) {
    alert('Max HR must be higher than resting HR.')
    return
  }
  await settingsStore.save({ ...draft.value, goalTime: parseDuration(goalTimeText.value) })
  saved.value = true
  setTimeout(() => (saved.value = false), 1500)
}

// --- Backup ---
const busy = ref(false)
const message = ref('')
const restoreSettings = ref(true)
const fileInput = ref<HTMLInputElement>()

async function exportJson() {
  busy.value = true
  try {
    const backup = await createBackup()
    const name = backupFileName()
    const file = new File([JSON.stringify(backup)], name, { type: 'application/json' })
    // On phones, the share sheet is the reliable way to save to Files / iCloud / Drive.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name })
        message.value = `Shared backup with ${backup.activities.length} runs.`
        return
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return
      }
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    message.value = `Exported ${backup.activities.length} runs.`
  } finally {
    busy.value = false
  }
}

async function importJson(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  busy.value = true
  try {
    const data = JSON.parse(await file.text())
    const r = await store.restore(data, restoreSettings.value)
    if (restoreSettings.value) await settingsStore.load()
    message.value = `Restored ${r.added} runs (${r.duplicates} already present).`
  } catch (err) {
    message.value = `Restore failed: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    busy.value = false
  }
}

// --- Storage ---
const persisted = ref<boolean | null>(null)
const usage = ref('')
async function refreshStorage() {
  persisted.value = (await navigator.storage?.persisted?.()) ?? null
  const est = await navigator.storage?.estimate?.()
  if (est?.usage != null) usage.value = `${(est.usage / 1e6).toFixed(1)} MB used`
}
async function askPersist() {
  await requestPersistence()
  await refreshStorage()
}
onMounted(refreshStorage)

async function deleteAll() {
  if (!confirm(`Delete all ${store.list.length} runs from this device? Export a backup first — this cannot be undone.`)) return
  await store.clearAll()
  message.value = 'All runs deleted.'
}
</script>

<template>
  <main class="page">
    <h1>Settings</h1>

    <form class="card" @submit.prevent="save">
      <h2>Heart rate</h2>
      <div class="form-grid">
        <label class="field">Max HR<input v-model.number="draft.hrMax" type="number" inputmode="numeric" min="120" max="230" /></label>
        <label class="field">Resting HR<input v-model.number="draft.hrRest" type="number" inputmode="numeric" min="30" max="100" /></label>
        <label class="field">TRIMP formula
          <select v-model="draft.sex"><option value="male">Male</option><option value="female">Female</option></select>
        </label>
      </div>

      <h2>Goal</h2>
      <div class="form-grid">
        <label class="field">Distance
          <select v-model.number="draft.goalDistance">
            <option :value="5000">5 km</option>
            <option :value="10000">10 km</option>
            <option :value="21097.5">Half marathon</option>
            <option :value="42195">Marathon</option>
          </select>
        </label>
        <label class="field">Target time
          <input v-model="goalTimeText" placeholder="55:00" inputmode="numeric" :aria-invalid="!goalTimeValid" />
        </label>
        <label class="field">Race date<input v-model="draft.goalDate" type="date" /></label>
      </div>

      <h2>Predictor</h2>
      <div class="form-grid">
        <label class="field">History window (days)<input v-model.number="draft.predictorWindowDays" type="number" min="14" max="730" /></label>
      </div>
      <div><button class="btn primary" :disabled="!goalTimeValid">{{ saved ? 'Saved ✓' : 'Save settings' }}</button></div>
    </form>

    <section class="card">
      <h2>Backup</h2>
      <p class="small muted">
        Your data lives only in this browser. Export a JSON backup regularly (e.g. to iCloud Drive / Google Drive) — it includes
        every run with its GPS and heart-rate samples, plus these settings.
      </p>
      <div class="row">
        <button class="btn primary" :disabled="busy || !store.list.length" @click="exportJson">Export backup</button>
        <button class="btn" :disabled="busy" @click="fileInput?.click()">Restore from backup…</button>
        <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importJson" />
      </div>
      <label class="check"><input v-model="restoreSettings" type="checkbox" /> Also restore settings</label>
      <p v-if="message" class="small" role="status">{{ message }}</p>
    </section>

    <section class="card">
      <h2>Storage</h2>
      <p class="small muted">
        {{ store.list.length }} runs<span v-if="usage"> · {{ usage }}</span> ·
        <template v-if="persisted === true">persistent storage granted ✓</template>
        <template v-else-if="persisted === false">browser may evict data under storage pressure</template>
      </p>
      <div class="row">
        <button v-if="persisted === false" class="btn" @click="askPersist">Request persistent storage</button>
        <button class="btn danger" :disabled="!store.list.length" @click="deleteAll">Delete all runs</button>
      </div>
    </section>

    <p class="tiny">Stride · local-only running dashboard · no account, no tracking, no server.</p>
  </main>
</template>

<style scoped>
.row { display: flex; gap: 8px; flex-wrap: wrap; }
.check { display: flex; gap: 8px; align-items: center; font-size: 0.9rem; color: var(--text-2); }
.check input { width: auto; min-height: 0; }
form h2 { margin-top: 4px; }
</style>
