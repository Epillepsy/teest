<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import type uPlot from 'uplot'
import { useActivities } from '@/stores/activities'
import { useSettings } from '@/stores/settings'
import { DEFAULT_SETTINGS, type ActivityStreams } from '@/types'
import { computeSplits, rollingPace } from '@/lib/splits'
import { distanceLabel, formatDate, formatDuration, formatKm, formatPace, paceSecPerKm } from '@/lib/format'
import { axis, line } from '@/lib/chartTheme'
import { trainingPaces, vdotFromPerformance } from '@/lib/predict/vdot'
import { activityLoad } from '@/lib/predict/load'
import { currentVdot } from '@/lib/insights'
import { effectiveHrMax, effortLevel, hrZoneOf, hrZones, paceZoneOf, paceZones, timeInZones, type ZoneTime } from '@/lib/zones'
import UChart from '@/components/UChart.vue'
import RunMap from '@/components/RunMap.vue'

const props = defineProps<{ id: string }>()
const store = useActivities()
const settingsStore = useSettings()
const router = useRouter()

const run = computed(() => store.byId.get(props.id))
const streams = shallowRef<ActivityStreams>()
const loading = ref(true)
const cursorIdx = ref<number | null>(null)

watch(
  () => props.id,
  async (id) => {
    loading.value = true
    streams.value = await store.streams(id)
    loading.value = false
  },
  { immediate: true },
)

const splits = computed(() =>
  streams.value ? computeSplits(streams.value.time, streams.value.distance, { hr: streams.value.hr, alt: streams.value.alt }) : [],
)
const splitRange = computed(() => {
  const full = splits.value.filter((s) => s.distance >= 900).map((s) => s.pace)
  return { min: Math.min(...full), max: Math.max(...full) }
})
function splitBar(pace: number) {
  const { min, max } = splitRange.value
  if (!Number.isFinite(min) || max === min) return 100
  // Faster split = longer bar. Keep a 35 % floor so slow splits remain visible.
  return 35 + (65 * (max - pace)) / (max - min)
}

const kmAxis = computed(() => streams.value?.distance.map((d) => d / 1000) ?? [])
const xScale: uPlot.Scale = { time: false }
const xAxis = () => axis({ grid: { show: false }, values: (_u, s) => s.map((v) => `${v} km`) })
const xSeries: uPlot.Series = { label: 'Distance', value: (_u, v) => (v == null ? '–' : `${v.toFixed(2)} km`) }

const paceData = computed<uPlot.AlignedData>(() => {
  const s = streams.value!
  return [kmAxis.value, rollingPace(s.time, s.distance, 30)]
})
const paceOpts = computed<Omit<uPlot.Options, 'width' | 'height'>>(() => ({
  legend: { live: true },
  cursor: { drag: { x: false, y: false }, sync: { key: 'activity' } },
  scales: { x: xScale, y: { dir: -1, range: (_u, min, max) => [Math.max(120, min - 15), Math.min(max + 15, 900)] } },
  series: [xSeries, line('Pace', '--series-1', { value: (_u, v) => (v == null ? '–' : `${formatPace(v)} /km`) })],
  axes: [xAxis(), axis({ size: 48, values: (_u, s) => s.map((v) => formatPace(v)) })],
}))

const hrData = computed<uPlot.AlignedData>(() => [kmAxis.value, streams.value?.hr ?? []])
const hrOpts = computed<Omit<uPlot.Options, 'width' | 'height'>>(() => ({
  legend: { live: true },
  cursor: { drag: { x: false, y: false }, sync: { key: 'activity' } },
  scales: { x: xScale },
  series: [xSeries, line('Heart rate', '--series-2', { value: (_u, v) => (v == null ? '–' : `${Math.round(v)} bpm`) })],
  axes: [xAxis(), axis({ size: 48 })],
}))

const altData = computed<uPlot.AlignedData>(() => [kmAxis.value, streams.value?.alt ?? []])
const altOpts = computed<Omit<uPlot.Options, 'width' | 'height'>>(() => ({
  legend: { live: true },
  cursor: { drag: { x: false, y: false }, sync: { key: 'activity' } },
  scales: { x: xScale },
  series: [xSeries, line('Elevation', '--series-3', { value: (_u, v) => (v == null ? '–' : `${Math.round(v)} m`) })],
  axes: [xAxis(), axis({ size: 48 })],
}))

/** Training paces at the time of this run (falls back to current fitness for early runs). */
const paces = computed(() => {
  if (!run.value) return undefined
  const s = settingsStore.settings
  const vdot = currentVdot(store.list, s, run.value.startTime) ?? currentVdot(store.list, s, Date.now())
  return vdot ? trainingPaces(vdot) : undefined
})

const effort = computed(() => {
  const r = run.value
  if (!r) return undefined
  const s = settingsStore.settings
  const load = activityLoad(
    { durationSec: r.duration, distance: r.distance, avgHr: r.avgHr },
    { hrRest: s.hrRest, hrMax: s.hrMax, sex: s.sex, thresholdPace: paces.value?.threshold },
  )
  return { load, level: effortLevel(load), fromHr: !!(r.avgHr && r.avgHr > s.hrRest) }
})

const hrMax = computed(() => effectiveHrMax(settingsStore.settings.hrMax, DEFAULT_SETTINGS.hrMax, store.list.map((a) => a.maxHr)))
const hrMaxEstimated = computed(() => hrMax.value !== settingsStore.settings.hrMax)
const hrZoneTimes = computed(() => {
  const s = streams.value
  if (!s?.hr || !s.hr.some((v) => v != null)) return []
  return timeInZones(s.time, s.hr, hrZones(hrMax.value), hrZoneOf)
})
const paceZoneTimes = computed(() => {
  const s = streams.value
  if (!s || !paces.value || s.time.length < 2) return []
  return timeInZones(s.time, rollingPace(s.time, s.distance, 30), paceZones(paces.value), paceZoneOf)
})

const ZONE_COLORS = ['var(--text-3)', 'var(--series-1)', 'var(--series-3)', 'var(--warning)', 'var(--critical)']
function hrRange(z: ZoneTime) {
  if (z.from === 0) return `< ${z.to}`
  return Number.isFinite(z.to) ? `${z.from}–${z.to - 1}` : `≥ ${z.from}`
}
function paceRange(z: ZoneTime) {
  if (!Number.isFinite(z.from)) return `> ${formatPace(z.to)}`
  return z.to > 0 ? `${formatPace(z.from)}–${formatPace(z.to)}` : `< ${formatPace(z.from)}`
}

const efforts = computed(() =>
  Object.entries(run.value?.bestEfforts ?? {})
    .map(([d, t]) => ({ distance: Number(d), time: t }))
    .sort((a, b) => a.distance - b.distance),
)

const editingName = ref(false)
const nameDraft = ref('')
function startEdit() {
  nameDraft.value = run.value?.name ?? ''
  editingName.value = true
}
async function saveName() {
  if (run.value && nameDraft.value.trim()) await store.update(run.value.id, { name: nameDraft.value.trim() })
  editingName.value = false
}
async function toggleRace() {
  if (run.value) await store.update(run.value.id, { isRace: !run.value.isRace })
}
async function remove() {
  if (run.value && confirm(`Delete “${run.value.name}”? This cannot be undone.`)) {
    await store.remove(run.value.id)
    router.replace('/runs')
  }
}
</script>

<template>
  <main class="page">
    <button class="back btn" @click="router.back()">← Back</button>
    <p v-if="store.loaded && !run" class="card empty">Activity not found.</p>

    <template v-if="run">
      <header>
        <div v-if="!editingName" class="title-row">
          <h1>{{ run.name }}</h1>
          <button class="btn" style="min-height: 32px; padding: 4px 10px" @click="startEdit">Rename</button>
        </div>
        <form v-else class="title-row" @submit.prevent="saveName">
          <input v-model="nameDraft" aria-label="Activity name" />
          <button class="btn primary">Save</button>
        </form>
        <p class="muted small">
          {{ formatDate(run.startTime, { dateStyle: 'full', timeStyle: 'short' }) }} · {{ run.source.toUpperCase() }}
          <span v-if="run.fileName">· {{ run.fileName }}</span>
        </p>
      </header>

      <section class="tiles">
        <div class="tile"><div class="label">Distance</div><div class="value">{{ formatKm(run.distance) }}</div><div class="sub">km</div></div>
        <div class="tile"><div class="label">Moving time</div><div class="value">{{ formatDuration(run.duration) }}</div><div class="sub">elapsed {{ formatDuration(run.elapsed) }}</div></div>
        <div class="tile"><div class="label">Avg pace</div><div class="value">{{ formatPace(paceSecPerKm(run.distance, run.duration)) }}</div><div class="sub">/km</div></div>
        <div v-if="run.avgHr" class="tile"><div class="label">Heart rate</div><div class="value">{{ run.avgHr }}</div><div class="sub">avg · max {{ run.maxHr ?? '–' }} bpm</div></div>
        <div v-if="run.ascent != null" class="tile"><div class="label">Elevation</div><div class="value">{{ run.ascent }}</div><div class="sub">m gain</div></div>
        <div v-if="effort" class="tile"><div class="label">Effort</div><div class="value">{{ Math.round(effort.load) }}</div><div class="sub">{{ effort.level }} · {{ effort.fromHr ? 'from HR' : 'est. from pace' }}</div></div>
      </section>

      <section class="card race">
        <div>
          <h3>Race / all-out effort</h3>
          <p class="small muted">Races count more in predictions.<span v-if="run.isRace"> VDOT {{ vdotFromPerformance(run.distance, run.duration).toFixed(1) }}.</span></p>
        </div>
        <button class="btn" :class="{ primary: run.isRace }" :aria-pressed="!!run.isRace" @click="toggleRace">
          {{ run.isRace ? 'Race ✓' : 'Mark as race' }}
        </button>
      </section>

      <p v-if="loading" class="muted">Loading samples…</p>
      <template v-else-if="streams">
        <section v-if="streams.lat && streams.lon" class="card">
          <RunMap :lat="streams.lat" :lon="streams.lon" :highlight="cursorIdx" />
        </section>

        <section v-if="hrZoneTimes.length" class="card">
          <div class="card-head">
            <h2>Heart rate zones</h2>
            <span class="small muted">max HR {{ hrMax }}<span v-if="hrMaxEstimated"> (estimated)</span></span>
          </div>
          <div class="zones">
            <div v-for="z in hrZoneTimes" :key="z.index" class="zone-row">
              <span class="zname"><b>Z{{ z.index }}</b> {{ z.name }}</span>
              <span class="zrange small muted">{{ hrRange(z) }} bpm</span>
              <div class="ztrack"><div class="zbar" :style="{ width: z.share * 100 + '%', background: ZONE_COLORS[z.index - 1] }"></div></div>
              <span class="ztime">{{ formatDuration(z.seconds) }}</span>
              <span class="zpct small muted">{{ Math.round(z.share * 100) }}%</span>
            </div>
          </div>
        </section>

        <section v-if="paceZoneTimes.length" class="card">
          <div class="card-head">
            <h2>Pace zones</h2>
            <span class="small muted">threshold {{ formatPace(paces!.threshold) }} /km</span>
          </div>
          <div class="zones">
            <div v-for="z in paceZoneTimes" :key="z.index" class="zone-row">
              <span class="zname"><b>Z{{ z.index }}</b> {{ z.name }}</span>
              <span class="zrange small muted">{{ paceRange(z) }} /km</span>
              <div class="ztrack"><div class="zbar" :style="{ width: z.share * 100 + '%', background: ZONE_COLORS[z.index - 1] }"></div></div>
              <span class="ztime">{{ formatDuration(z.seconds) }}</span>
              <span class="zpct small muted">{{ Math.round(z.share * 100) }}%</span>
            </div>
          </div>
        </section>
        <p v-else-if="!paces" class="small muted">Pace zones appear once you have a run of 1 km or more to estimate your fitness from.</p>

        <section v-if="splits.length" class="card">
          <h2>Splits</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Km</th><th>Pace</th><th class="barcol"></th><th v-if="streams.hr">HR</th><th v-if="streams.alt">Elev</th></tr></thead>
              <tbody>
                <tr v-for="s in splits" :key="s.index">
                  <td>{{ s.distance < 990 ? formatKm(s.distance) : s.index }}</td>
                  <td>{{ formatPace(s.pace) }}</td>
                  <td class="barcol"><div class="bar" :style="{ width: splitBar(s.pace) + '%' }"></div></td>
                  <td v-if="streams.hr">{{ s.avgHr ? Math.round(s.avgHr) : '–' }}</td>
                  <td v-if="streams.alt">{{ s.elevation != null ? (s.elevation > 0 ? '+' : '') + Math.round(s.elevation) : '–' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-if="streams.time.length > 1" class="card">
          <h2>Pace</h2>
          <UChart :data="paceData" :options="paceOpts" :height="180" label="Pace over distance" @cursor="cursorIdx = $event" />
          <template v-if="streams.hr">
            <h2>Heart rate</h2>
            <UChart :data="hrData" :options="hrOpts" :height="160" label="Heart rate over distance" @cursor="cursorIdx = $event" />
          </template>
          <template v-if="streams.alt">
            <h2>Elevation</h2>
            <UChart :data="altData" :options="altOpts" :height="120" label="Elevation over distance" @cursor="cursorIdx = $event" />
          </template>
        </section>
      </template>

      <section v-if="efforts.length" class="card">
        <h2>Best efforts in this run</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Distance</th><th>Time</th><th>Pace</th></tr></thead>
            <tbody>
              <tr v-for="e in efforts" :key="e.distance">
                <td>{{ distanceLabel(e.distance) }}</td>
                <td>{{ formatDuration(e.time) }}</td>
                <td>{{ formatPace(paceSecPerKm(e.distance, e.time)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <button class="btn danger" @click="remove">Delete activity</button>
    </template>
  </main>
</template>

<style scoped>
.back { align-self: flex-start; min-height: 36px; padding: 6px 12px; }
.title-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
.race { flex-direction: row; justify-content: space-between; align-items: center; }
.race p { margin: 2px 0 0; }
.barcol { width: 40%; }
.zones { display: flex; flex-direction: column; gap: 8px; }
.zone-row { display: grid; grid-template-columns: minmax(110px, 1.2fr) minmax(80px, 1fr) 2fr auto 3ch; gap: 8px; align-items: center; font-variant-numeric: tabular-nums; }
.zname { white-space: nowrap; }
.ztrack { height: 10px; background: var(--surface-2); border-radius: 4px; overflow: hidden; }
.zbar { height: 100%; border-radius: 0 4px 4px 0; }
.ztime, .zpct { text-align: right; }
@media (max-width: 480px) {
  .zone-row { grid-template-columns: 1fr auto auto; }
  .zrange { grid-column: 1; grid-row: 2; }
  .ztrack { grid-column: 1 / -1; grid-row: 3; }
}
.bar { height: 10px; border-radius: 0 4px 4px 0; background: var(--series-1); }
</style>
