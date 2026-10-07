<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type uPlot from 'uplot'
import { useActivities } from '@/stores/activities'
import { useSettings } from '@/stores/settings'
import { computeInsights, personalRecords } from '@/lib/insights'
import { distanceLabel, formatDate, formatDuration, formatPace, paceSecPerKm } from '@/lib/format'
import { dayToMs } from '@/lib/predict/load'
import { axis, line } from '@/lib/chartTheme'
import UChart from '@/components/UChart.vue'

const store = useActivities()
const settingsStore = useSettings()
const now = Date.now()
const range = ref<90 | 180 | 365>(180)
const prScope = ref<'all' | 'year' | '90'>('all')

const insights = computed(() => computeInsights(store.list, settingsStore.settings, now, range.value))
const prs = computed(() => {
  const since = prScope.value === 'all' ? -Infinity : now - (prScope.value === 'year' ? 365 : 90) * 86400000
  return personalRecords(store.list, since)
})

const verdict = computed(() => {
  const g = insights.value.goal
  if (!g) return undefined
  const map = {
    achieved: { text: 'Already on target', color: 'var(--good)' },
    likely: { text: 'Likely', color: 'var(--good)' },
    possible: { text: 'Possible', color: 'var(--accent)' },
    stretch: { text: 'Stretch', color: 'var(--warning)' },
    unlikely: { text: 'Unlikely for now', color: 'var(--critical)' },
  } as const
  return map[g.verdict]
})

const fitnessData = computed<uPlot.AlignedData>(() => {
  const f = insights.value.fitness
  return [f.map((p) => dayToMs(p.day) / 1000), f.map((p) => p.ctl), f.map((p) => p.atl)]
})
const formData = computed<uPlot.AlignedData>(() => {
  const f = insights.value.fitness
  return [f.map((p) => dayToMs(p.day) / 1000), f.map((p) => p.tsb)]
})
const dateSeries: uPlot.Series = { label: 'Day', value: (_u, v) => (v == null ? '–' : formatDate(v * 1000)) }
const dateAxis = () => axis({ grid: { show: false }, values: (_u, s) => s.map((v) => formatDate(v * 1000, { day: 'numeric', month: 'short' })) })
const fitnessOpts = computed<Omit<uPlot.Options, 'width' | 'height'>>(() => ({
  legend: { live: true },
  cursor: { drag: { x: false, y: false }, sync: { key: 'fitness' } },
  scales: { x: { time: true }, y: { range: (_u, _min, max) => [0, Math.max(10, max * 1.1)] } },
  series: [
    dateSeries,
    line('Fitness (CTL)', '--series-1', { value: (_u, v) => (v == null ? '–' : v.toFixed(0)) }),
    line('Fatigue (ATL)', '--series-2', { value: (_u, v) => (v == null ? '–' : v.toFixed(0)) }),
  ],
  axes: [dateAxis(), axis({ size: 40 })],
}))
const formOpts = computed<Omit<uPlot.Options, 'width' | 'height'>>(() => ({
  legend: { live: true },
  cursor: { drag: { x: false, y: false }, sync: { key: 'fitness' } },
  scales: { x: { time: true } },
  series: [dateSeries, line('Form (TSB)', '--series-3', { value: (_u, v) => (v == null ? '–' : v.toFixed(0)) })],
  axes: [dateAxis(), axis({ size: 40 })],
}))

const current = computed(() => insights.value.fitness.at(-1))
const pct = (x: number) => `${(x * 100).toFixed(0)}%`
</script>

<template>
  <main class="page">
    <h1>Insights</h1>

    <p v-if="store.loaded && !store.list.length" class="card empty">Import some runs to see records, predictions and fitness.</p>

    <template v-else>
      <!-- Goal -->
      <section class="card">
        <div class="card-head">
          <h2>Goal: {{ distanceLabel(settingsStore.settings.goalDistance) }} under {{ formatDuration(settingsStore.settings.goalTime) }}</h2>
          <RouterLink to="/settings" class="small">Edit</RouterLink>
        </div>
        <template v-if="insights.goal && verdict">
          <div class="goal-row">
            <div class="big num" :style="{ color: verdict.color }">{{ pct(insights.goal.probability) }}</div>
            <div>
              <div><strong :style="{ color: verdict.color }">{{ verdict.text }}</strong></div>
              <div class="small muted">chance of beating {{ formatDuration(settingsStore.settings.goalTime) }} on {{ formatDate(new Date(settingsStore.settings.goalDate + 'T09:00').getTime()) }}</div>
            </div>
          </div>
          <div class="tiles">
            <div class="tile"><div class="label">Today</div><div class="value">{{ formatDuration(insights.goal.projectedTime / (1 - insights.goal.improvement)) }}</div><div class="sub">predicted now</div></div>
            <div class="tile"><div class="label">Race day</div><div class="value">{{ formatDuration(insights.goal.projectedTime) }}</div><div class="sub">projected (−{{ (insights.goal.improvement * 100).toFixed(1) }}%)</div></div>
            <div class="tile"><div class="label">VDOT</div><div class="value">{{ insights.goal.currentVdot.toFixed(1) }}</div><div class="sub">need {{ insights.goal.requiredVdot.toFixed(1) }}</div></div>
            <div class="tile"><div class="label">Goal pace</div><div class="value">{{ formatPace(insights.goal.goalPace) }}</div><div class="sub">/km · {{ insights.goal.weeks.toFixed(1) }} wk left</div></div>
          </div>
          <details>
            <summary>How this is calculated</summary>
            <p class="small muted">
              Today's prediction comes from the race predictor below. It is projected to race day assuming
              {{ (insights.weeklyImprovement * 100).toFixed(2) }}% faster per week (based on your fitness ramp of
              {{ insights.ctlRamp.toFixed(1) }} CTL/week, capped at 5% total), and treated as log-normal with
              σ = {{ (insights.goal.sigma * 100).toFixed(1) }}% (prediction uncertainty plus uncertainty in how you'll respond to training).
              Gap to close today: {{ (insights.goal.gapNow * 100).toFixed(1) }}%.
            </p>
          </details>
        </template>
        <p v-else class="small muted">No recent efforts long enough to predict this distance yet.</p>
      </section>

      <!-- Predictor -->
      <section class="card">
        <div class="card-head">
          <h2>Race predictor</h2>
          <span v-if="insights.vdot" class="badge">VDOT {{ insights.vdot.toFixed(1) }}</span>
        </div>
        <div v-if="insights.predictions.length" class="table-wrap">
          <table>
            <thead><tr><th>Race</th><th>Predicted</th><th>Pace</th><th class="wide-only">Riegel</th><th class="wide-only">VDOT</th></tr></thead>
            <tbody>
              <tr v-for="p in insights.predictions" :key="p.distance">
                <td>{{ distanceLabel(p.distance) }}</td>
                <td>
                  <strong>{{ formatDuration(p.mid) }}</strong>
                  <div class="tiny">{{ formatDuration(p.low) }} – {{ formatDuration(p.high) }}</div>
                </td>
                <td>{{ formatPace(paceSecPerKm(p.distance, p.mid)) }}</td>
                <td class="muted wide-only">{{ formatDuration(p.riegelMid) }}</td>
                <td class="muted wide-only">{{ formatDuration(p.vdotMid) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="small muted">Needs at least one effort of 1 km or more in the last {{ settingsStore.settings.predictorWindowDays }} days.</p>
        <details v-if="insights.predictions.length">
          <summary>Based on</summary>
          <ul class="small">
            <li v-for="s in insights.predictions[0].sources" :key="s.effort.activityId">
              {{ distanceLabel(s.effort.distance) }} in {{ formatDuration(s.effort.time) }} on
              <RouterLink :to="`/runs/${s.effort.activityId}`">{{ formatDate(s.effort.date) }}</RouterLink>
              <span v-if="s.effort.isRace" class="badge">Race</span> · VDOT {{ s.vdot.toFixed(1) }}
            </li>
          </ul>
          <p class="tiny">
            The small line under each prediction is the likely (~80%) range. Mixes Riegel (T₂ = T₁·(D₂/D₁)^1.06) and Daniels VDOT from your strongest recent efforts, weighted by recency,
            distance proximity and race flag. The range is ~80%; it is wider on the fast side when no races are marked,
            since training efforts usually understate race fitness. Mark races on the activity page for better predictions.
          </p>
        </details>
      </section>

      <!-- Training paces -->
      <section v-if="insights.paces" class="card">
        <h2>Training paces</h2>
        <div class="tiles">
          <div class="tile"><div class="label">Easy</div><div class="value">{{ formatPace(insights.paces.easy[0]) }}–{{ formatPace(insights.paces.easy[1]) }}</div></div>
          <div class="tile"><div class="label">Marathon</div><div class="value">{{ formatPace(insights.paces.marathon) }}</div></div>
          <div class="tile"><div class="label">Threshold</div><div class="value">{{ formatPace(insights.paces.threshold) }}</div></div>
          <div class="tile"><div class="label">Interval</div><div class="value">{{ formatPace(insights.paces.interval) }}</div></div>
        </div>
      </section>

      <!-- Fitness -->
      <section class="card">
        <div class="card-head">
          <h2>Fitness &amp; load</h2>
          <div class="seg" role="group" aria-label="Range">
            <button v-for="r in [90, 180, 365] as const" :key="r" :class="{ on: range === r }" @click="range = r">{{ r }}d</button>
          </div>
        </div>
        <p v-if="current" class="small muted num">
          Today: fitness <strong>{{ current.ctl.toFixed(0) }}</strong> · fatigue <strong>{{ current.atl.toFixed(0) }}</strong> ·
          form <strong>{{ (current.ctl - current.atl).toFixed(0) }}</strong> · ramp {{ insights.ctlRamp >= 0 ? '+' : '' }}{{ insights.ctlRamp.toFixed(1) }}/wk
        </p>
        <UChart :data="fitnessData" :options="fitnessOpts" :height="200" label="Fitness and fatigue over time" />
        <UChart :data="formData" :options="formOpts" :height="120" label="Form over time" />
        <p class="tiny">
          Daily load is Banister TRIMP from average heart rate (estimated from pace when there's no HR). Fitness = 42-day,
          fatigue = 7-day exponentially weighted load; form = fitness − fatigue. Positive form ≈ fresh, below −20 ≈ heavy block.
        </p>
      </section>

      <!-- PRs -->
      <section class="card">
        <div class="card-head">
          <h2>Personal records</h2>
          <div class="seg" role="group" aria-label="PR period">
            <button :class="{ on: prScope === 'all' }" @click="prScope = 'all'">All time</button>
            <button :class="{ on: prScope === 'year' }" @click="prScope = 'year'">12 mo</button>
            <button :class="{ on: prScope === '90' }" @click="prScope = '90'">90 d</button>
          </div>
        </div>
        <div v-if="prs.length" class="table-wrap">
          <table>
            <thead><tr><th>Distance</th><th>Time</th><th>Pace</th><th>Date</th></tr></thead>
            <tbody>
              <tr v-for="p in prs" :key="p.distance">
                <td>{{ distanceLabel(p.distance) }}</td>
                <td><strong>{{ formatDuration(p.time) }}</strong></td>
                <td>{{ formatPace(paceSecPerKm(p.distance, p.time)) }}</td>
                <td><RouterLink :to="`/runs/${p.activityId}`">{{ formatDate(p.date) }}</RouterLink></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="small muted">No efforts in this period.</p>
        <p class="tiny">Fastest segment of each distance found inside any run (elapsed time).</p>
      </section>
    </template>
  </main>
</template>

<style scoped>
.goal-row { display: flex; gap: 16px; align-items: center; }
.big { font-size: 2.6rem; font-weight: 800; }
ul { margin: 8px 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
</style>
