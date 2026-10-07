<script setup lang="ts">
import { computed, ref } from 'vue'
import { useActivities } from '@/stores/activities'
import { formatDate, formatKm } from '@/lib/format'
import ImportButton from '@/components/ImportButton.vue'
import RunRow from '@/components/RunRow.vue'
import type { ActivitySummary } from '@/types'

const store = useActivities()
const query = ref('')
const racesOnly = ref(false)

const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  const out: { key: string; label: string; distance: number; runs: ActivitySummary[] }[] = []
  for (const a of store.list) {
    if (racesOnly.value && !a.isRace) continue
    if (q && !`${a.name} ${a.fileName ?? ''}`.toLowerCase().includes(q)) continue
    const d = new Date(a.startTime)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    let g = out.at(-1)
    if (!g || g.key !== key) {
      g = { key, label: formatDate(a.startTime, { month: 'long', year: 'numeric' }), distance: 0, runs: [] }
      out.push(g)
    }
    g.runs.push(a)
    g.distance += a.distance
  }
  return out
})
</script>

<template>
  <main class="page">
    <header class="page-head">
      <h1>Runs <span class="muted small">({{ store.list.length }})</span></h1>
      <ImportButton />
    </header>

    <div v-if="store.list.length" class="filters">
      <input v-model="query" type="search" placeholder="Search runs" aria-label="Search runs" />
      <label class="check"><input v-model="racesOnly" type="checkbox" /> Races only</label>
    </div>

    <p v-if="store.loaded && !store.list.length" class="card empty">
      No runs yet. Import .fit, .tcx or .gpx files (select many at once), a whole folder, or a .zip archive such as your Strava export (Settings → My Account → Download or Delete Your Account → Request your archive). Duplicates and non-runs are skipped automatically.
    </p>

    <section v-for="g in groups" :key="g.key" class="card">
      <div class="card-head">
        <h2>{{ g.label }}</h2>
        <span class="small muted num">{{ g.runs.length }} runs · {{ formatKm(g.distance, 1) }} km</span>
      </div>
      <div><RunRow v-for="r in g.runs" :key="r.id" :run="r" /></div>
    </section>
  </main>
</template>

<style scoped>
.filters { display: flex; gap: 12px; align-items: center; }
.check { display: flex; gap: 6px; align-items: center; white-space: nowrap; font-size: 0.9rem; color: var(--text-2); }
.check input { width: auto; min-height: 0; }
</style>
