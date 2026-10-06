<script setup lang="ts">
import { computed, ref } from 'vue'
import { useActivities } from '@/stores/activities'

withDefaults(defineProps<{ primary?: boolean }>(), { primary: true })
const store = useActivities()
const input = ref<HTMLInputElement>()

const summary = computed(() => {
  const r = store.lastResults
  const n = (s: string) => r.filter((x) => x.status === s).length
  return { imported: n('imported'), duplicate: n('duplicate'), skipped: n('skipped'), error: n('error') }
})

async function onChange(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? [])
  ;(e.target as HTMLInputElement).value = ''
  if (!files.length) return
  await store.importFiles(files)
}
</script>

<template>
  <div class="import">
    <!-- No `accept` filter: iOS greys out unknown extensions like .fit; files are validated on parse. -->
    <input ref="input" type="file" multiple hidden @change="onChange" />
    <button class="btn" :class="{ primary }" :disabled="store.importing" @click="input?.click()">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M11 4v9.2L7.4 9.6 6 11l6 6 6-6-1.4-1.4-3.6 3.6V4h-2zM5 18v2h14v-2H5z" /></svg>
      <span v-if="store.importing">Importing {{ store.progress.done }}/{{ store.progress.total }}…</span>
      <span v-else>Import FIT / TCX</span>
    </button>
    <div v-if="store.showResults && store.lastResults.length" class="results card" role="status">
      <div class="card-head">
        <h3>Import finished</h3>
        <button class="btn" style="min-height: 32px; padding: 4px 10px" @click="store.showResults = false">Close</button>
      </div>
      <p class="small">
        <strong>{{ summary.imported }}</strong> imported · {{ summary.duplicate }} duplicate · {{ summary.skipped }} skipped ·
        {{ summary.error }} failed
      </p>
      <details v-if="summary.duplicate + summary.skipped + summary.error > 0">
        <summary>Details</summary>
        <ul class="small">
          <li v-for="r in store.lastResults.filter((x) => x.status !== 'imported')" :key="r.fileName + r.status">
            <strong>{{ r.fileName }}</strong> — {{ r.status }}<span v-if="r.message">: {{ r.message }}</span>
          </li>
        </ul>
      </details>
    </div>
  </div>
</template>

<style scoped>
.import { display: flex; flex-direction: column; gap: 12px; align-items: flex-end; }
.results { align-self: stretch; text-align: left; }
ul { margin: 0; padding-left: 18px; word-break: break-word; }
</style>
