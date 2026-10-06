<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import uPlot from 'uplot'
import { useActivities } from '@/stores/activities'
import { useSettings } from '@/stores/settings'
import { aggregate, startOfMonth, startOfWeek, type Period } from '@/lib/aggregate'
import { formatDate, formatDuration, formatKm, formatPace, paceSecPerKm } from '@/lib/format'
import { axis, cssVar } from '@/lib/chartTheme'
import { computeInsights } from '@/lib/insights'
import UChart from '@/components/UChart.vue'
import ImportButton from '@/components/ImportButton.vue'
import RunRow from '@/components/RunRow.vue'

const store = useActivities()
const settingsStore = useSettings()
const period = ref<Period>('week')
const now = Date.now()

function totals(since: number) {
  const runs = store.list.filter((a) => a.startTime >= since)
  const distance = runs.reduce((s, a) => s + a.distance, 0)
  const duration = runs.reduce((s, a) => s + a.duration, 0)
  return { count: runs.length, distance, duration }
}

const week = computed(() => totals(startOfWeek(now)))
const month = computed(() => totals(startOfMonth(now)))
const year = computed(() => totals(new Date(new Date(now).getFullYear(), 0, 1).getTime()))
const last4 = computed(() => {
  const b = aggregate(store.list, 'week', 5, now).slice(0, 4) // 4 full weeks before this one
  return b.reduce((s, x) => s + x.distance, 0) / 4
})

const buckets = computed(() => aggregate(store.list, period.value, 12, now))
const chartData = computed<uPlot.AlignedData>(() => [
  buckets.value.map((b) => b.start / 1000),
  buckets.value.map((b) => b.distance / 1000),
])
const bucketLabel = (ms: number) =>
  period.value === 'week' ? `Week of ${formatDate(ms, { day: 'numeric', month: 'short' })}` : formatDate(ms, { month: 'long', year: 'numeric' })

const chartOptions = computed<Omit<uPlot.Options, 'width' | 'height'>>(() => {
  const p = period.value
  return {
    padding: [8, 8, 0, 0],
    legend: { show: true, live: true },
    cursor: { points: { show: false }, drag: { x: false, y: false } },
    scales: { x: { time: true }, y: { range: (_u, _min, max) => [0, Math.max(5, max * 1.1)] } },
    series: [
      { label: p === 'week' ? 'Week' : 'Month', value: (_u, v) => (v == null ? '–' : bucketLabel(v * 1000)) },
      {
        label: 'Distance (km)',
        fill: cssVar('--series-1'),
        stroke: cssVar('--series-1'),
        width: 0,
        paths: uPlot.paths.bars!({ size: [0.7, 48], radius: 0.15 }),
        points: { show: false },
        value: (_u, v) => (v == null ? '–' : v.toFixed(1)),
      },
    ],
    axes: [
      axis({
        grid: { show: false },
        values: (_u, splits) => splits.map((s) => formatDate(s * 1000, p === 'week' ? { day: 'numeric', month: 'short' } : { month: 'short' })),
      }),
      axis({ size: 40 }),
    ],
  }
})

const insights = computed(() => (store.list.length ? computeInsights(store.list, settingsStore.settings, now, 60) : undefined))
const verdictText: Record<string, string> = {
  achieved: 'On track — already there',
  likely: 'Likely',
  possible: 'Possible',
  stretch: 'Stretch',
  unlikely: 'Unlikely for now',
}
</script>

<template>
  <main class="page">
    <header class="page-head">
      <h1>Dashboard</h1>
      <ImportButton v-if="store.loaded && store.list.length" :primary="false" />
    </header>

    <section v-if="store.loaded && !store.list.length" class="card empty">
      <h2>Welcome to Stride</h2>
      <p>Import your runs from FIT or TCX files (Garmin, Coros, Strava export…). Everything stays on this device.</p>
      <ImportButton />
    </section>

    <template v-else-if="store.loaded">
      <section class="tiles" aria-label="Totals">
        <div class="tile">
          <div class="label">This week</div>
          <div class="value">{{ formatKm(week.distance, 1) }} <small>km</small></div>
          <div class="sub">{{ week.count }} runs · {{ formatDuration(week.duration) }}</div>
        </div>
        <div class="tile">
          <div class="label">This month</div>
          <div class="value">{{ formatKm(month.distance, 1) }} <small>km</small></div>
          <div class="sub">{{ month.count }} runs · {{ formatDuration(month.duration) }}</div>
        </div>
        <div class="tile">
          <div class="label">This year</div>
          <div class="value">{{ formatKm(year.distance, 0) }} <small>km</small></div>
          <div class="sub">{{ year.count }} runs · {{ formatPace(paceSecPerKm(year.distance, year.duration)) }}/km avg</div>
        </div>
        <div class="tile">
          <div class="label">4-week avg</div>
          <div class="value">{{ formatKm(last4, 1) }} <small>km/wk</small></div>
          <div class="sub">previous 4 full weeks</div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Distance per {{ period }}</h2>
          <div class="seg" role="group" aria-label="Period">
            <button :class="{ on: period === 'week' }" @click="period = 'week'">Weeks</button>
            <button :class="{ on: period === 'month' }" @click="period = 'month'">Months</button>
          </div>
        </div>
        <UChart :data="chartData" :options="chartOptions" :height="220" :label="`Distance per ${period}, last 12`" />
        <details>
          <summary>Table</summary>
          <div class="table-wrap">
            <table>
              <thead><tr><th>{{ period === 'week' ? 'Week of' : 'Month' }}</th><th>Runs</th><th>km</th><th>Time</th><th>Pace</th></tr></thead>
              <tbody>
                <tr v-for="b in [...buckets].reverse()" :key="b.start">
                  <td>{{ bucketLabel(b.start) }}</td>
                  <td>{{ b.count }}</td>
                  <td>{{ formatKm(b.distance, 1) }}</td>
                  <td>{{ formatDuration(b.duration) }}</td>
                  <td>{{ formatPace(paceSecPerKm(b.distance, b.duration)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <RouterLink v-if="insights?.goal" to="/insights" class="card goal">
        <div class="card-head">
          <h2>Goal: {{ formatKm(settingsStore.settings.goalDistance, 1) }} km in {{ formatDuration(settingsStore.settings.goalTime) }}</h2>
          <span class="tiny">{{ formatDate(new Date(settingsStore.settings.goalDate + 'T09:00').getTime()) }}</span>
        </div>
        <div class="goal-row">
          <div class="big num">{{ Math.round(insights.goal.probability * 100) }}%</div>
          <div>
            <div><strong>{{ verdictText[insights.goal.verdict] }}</strong></div>
            <div class="small muted">Race-day projection {{ formatDuration(insights.goal.projectedTime) }} · {{ insights.goal.weeks.toFixed(1) }} weeks left</div>
          </div>
        </div>
      </RouterLink>

      <section class="card">
        <div class="card-head">
          <h2>Recent runs</h2>
          <RouterLink to="/runs" class="small">All runs →</RouterLink>
        </div>
        <div><RunRow v-for="r in store.list.slice(0, 5)" :key="r.id" :run="r" /></div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.goal { color: var(--text); }
.goal-row { display: flex; gap: 16px; align-items: center; }
.big { font-size: 2.2rem; font-weight: 800; color: var(--accent); }
small { font-size: 0.8rem; font-weight: 500; color: var(--text-2); }
</style>
