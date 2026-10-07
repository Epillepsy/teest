<script setup lang="ts">
import { computed, ref } from 'vue'
import { useActivities } from '@/stores/activities'
import { supportsFolderPicker } from '@/lib/dropFiles'

withDefaults(defineProps<{ primary?: boolean }>(), { primary: true })
const store = useActivities()
const fileInput = ref<HTMLInputElement>()
const folderInput = ref<HTMLInputElement>()
const canPickFolder = supportsFolderPicker()

const summary = computed(() => {
  const r = store.lastResults
  const n = (s: string) => r.filter((x) => x.status === s).length
  return { imported: n('imported'), duplicate: n('duplicate'), skipped: n('skipped'), error: n('error') }
})
const problems = computed(() => store.lastResults.filter((x) => x.status === 'error' || x.status === 'duplicate'))
const skippedCount = computed(() => summary.value.skipped)
const percent = computed(() => (store.progress.total ? Math.round((100 * store.progress.done) / store.progress.total) : 0))

async function onChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length) await store.importFiles(files)
}
</script>

<template>
  <div class="import" :class="{ expanded: store.importing || (store.showResults && store.lastResults.length) }">
    <!-- No `accept` filter: iOS greys out unknown extensions like .fit; files are validated on parse. -->
    <input ref="fileInput" type="file" multiple hidden @change="onChange" />
    <input v-if="canPickFolder" ref="folderInput" type="file" webkitdirectory multiple hidden @change="onChange" />
    <div class="buttons">
      <button class="btn" :class="{ primary }" :disabled="store.importing" @click="fileInput?.click()">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M11 4v9.2L7.4 9.6 6 11l6 6 6-6-1.4-1.4-3.6 3.6V4h-2zM5 18v2h14v-2H5z" /></svg>
        Import
      </button>
      <button v-if="canPickFolder" class="btn" :disabled="store.importing" @click="folderInput?.click()">Folder…</button>
    </div>

    <div v-if="store.importing" class="card panel" role="status" aria-live="polite">
      <div class="card-head">
        <h3>{{ store.phase === 'scanning' ? 'Reading files…' : `Importing ${store.progress.done} / ${store.progress.total}` }}</h3>
        <button class="btn small-btn" @click="store.cancelImport()">Cancel</button>
      </div>
      <div class="bar" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
        <div :style="{ width: percent + '%' }"></div>
      </div>
      <p class="small muted num">
        {{ store.progress.imported }} new · {{ store.progress.duplicate }} duplicate · {{ store.progress.skipped }} skipped ·
        {{ store.progress.error }} failed
      </p>
    </div>

    <div v-else-if="store.showResults && store.lastResults.length" class="card panel" role="status">
      <div class="card-head">
        <h3>{{ store.cancelled ? 'Import cancelled' : 'Import finished' }}</h3>
        <button class="btn small-btn" @click="store.showResults = false">Close</button>
      </div>
      <p class="small">
        <strong>{{ summary.imported }}</strong> imported · {{ summary.duplicate }} duplicate · {{ summary.skipped }} skipped (not runs) ·
        {{ summary.error }} failed
      </p>
      <p v-if="store.cancelled" class="small muted">Runs imported before cancelling were kept. Import again to continue; duplicates are skipped.</p>
      <details v-if="problems.length || skippedCount">
        <summary>Details</summary>
        <ul class="small">
          <li v-for="r in store.lastResults.filter((x) => x.status !== 'imported').slice(0, 200)" :key="r.fileName + r.status">
            <strong>{{ r.fileName }}</strong> — {{ r.status }}<span v-if="r.message">: {{ r.message }}</span>
          </li>
        </ul>
        <p v-if="store.lastResults.length - summary.imported > 200" class="tiny">…and {{ store.lastResults.length - summary.imported - 200 }} more.</p>
      </details>
    </div>
  </div>
</template>

<style scoped>
.import { display: flex; flex-direction: column; gap: 12px; align-items: flex-end; }
/* While a panel is open, take the full row so progress and results have room. */
.import.expanded { width: 100%; }
.buttons { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.panel { align-self: stretch; text-align: left; }
.small-btn { min-height: 32px; padding: 4px 10px; }
.bar { height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
.bar > div { height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.2s; }
ul { margin: 0; padding-left: 18px; word-break: break-word; }
</style>
