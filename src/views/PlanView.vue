<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { usePlan } from '@/stores/plan'
import { currentWeekIndex, parseDay, PACES, qualityOverview, RULES, type PlanWeek } from '@/lib/plan/solirun'
import { weekTotals } from '@/lib/plan/progress'

const store = usePlan()
onMounted(() => {
  if (!store.loaded) void store.load()
})

const plan = store.plan
const tab = ref<'plan' | 'quality' | 'rules'>('plan')
const nowIdx = currentWeekIndex(plan)

const daysToRace = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((parseDay(plan.raceDate).getTime() - today.getTime()) / 86400000)
})

const fmt = (iso: string) => parseDay(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const km1 = (n: number) => String(Math.round(n * 10) / 10)
const totalsFor = (w: PlanWeek) => weekTotals(w, store.status)
const quality = qualityOverview(plan)
const pct = computed(() => (store.totals.total ? (store.totals.done / store.totals.total) * 100 : 0))

const chip: Record<string, string> = { deload: 'Deload', test: 'Test', rest: 'Rest' }
</script>

<template>
  <main class="page">
    <header class="card top">
      <div>
        <h1>{{ plan.title }}</h1>
        <p class="small muted sub">{{ plan.subtitle }}</p>
      </div>
      <div class="tiles">
        <div class="stat">
          <div class="value num">{{ daysToRace > 0 ? daysToRace : daysToRace === 0 ? 'Today' : 'Done' }}</div>
          <div class="label">Days to race</div>
        </div>
        <div class="stat">
          <div class="value num">{{ store.totals.done }} / {{ store.totals.total }}</div>
          <div class="label">Sessions done</div>
        </div>
        <div class="stat">
          <div class="value num">{{ Math.round(store.totals.km) }} / {{ store.totals.planned }}</div>
          <div class="label">Km logged / planned</div>
        </div>
      </div>
      <div class="bar" role="progressbar" aria-label="Sessions completed" :aria-valuenow="Math.round(pct)" aria-valuemin="0" aria-valuemax="100">
        <i :style="{ width: pct + '%' }" />
      </div>
      <p class="tiny">Imported runs tick the matching session automatically (same day or one day off, similar distance). You can untick or override the km by hand. Everything stays on this device.</p>
    </header>

    <div class="seg" role="tablist" aria-label="Plan sections">
      <button role="tab" :aria-selected="tab === 'plan'" :class="{ on: tab === 'plan' }" @click="tab = 'plan'">Week by week</button>
      <button role="tab" :aria-selected="tab === 'quality'" :class="{ on: tab === 'quality' }" @click="tab = 'quality'">Quality sessions</button>
      <button role="tab" :aria-selected="tab === 'rules'" :class="{ on: tab === 'rules' }" @click="tab = 'rules'">Rules and gym</button>
    </div>

    <section v-if="tab === 'plan'" class="weeks">
      <details v-for="(w, i) in plan.weeks" :key="w.n" class="week" :class="{ now: i === nowIdx }" :open="i === (nowIdx < 0 ? 0 : nowIdx)">
        <summary>
          <span class="wn num">{{ w.n }}</span>
          <span class="wt">
            <strong>
              {{ w.block }}
              <span v-if="chip[w.kind]" class="chip" :class="w.kind">{{ chip[w.kind] }}</span>
              <span v-if="i === nowIdx" class="chip current">This week</span>
              <span v-if="totalsFor(w).done === totalsFor(w).total" class="chip complete">Done</span>
            </strong>
            <small>{{ fmt(w.start) }} – {{ fmt(w.end) }}<template v-if="w.gym"> · Gym: {{ w.gym }}</template></small>
          </span>
          <span class="wk num">{{ totalsFor(w).done }}/{{ totalsFor(w).total }} · {{ km1(totalsFor(w).km) }} / {{ w.plannedKm }} km</span>
        </summary>
        <div class="wbody">
          <div v-for="s in w.sessions" :key="s.id" class="sess" :class="{ done: store.status(s).done }">
            <input
              :id="'c-' + s.id"
              type="checkbox"
              :checked="store.status(s).done"
              :aria-label="'Done: ' + s.name"
              @change="store.setDone(s, ($event.target as HTMLInputElement).checked)"
            />
            <div class="d">
              <label :for="'c-' + s.id"><b>{{ s.day }} · {{ s.name }}</b></label>
              <span class="small muted">{{ s.detail }}</span>
              <RouterLink v-if="store.status(s).activityId" :to="'/runs/' + store.status(s).activityId" class="small">
                {{ store.status(s).auto ? 'Matched run' : 'Linked run' }} →
              </RouterLink>
            </div>
            <div class="k small muted num">
              <span>plan {{ s.km }} km</span>
              <input
                v-if="s.km > 0"
                type="number"
                step="0.1"
                min="0"
                inputmode="decimal"
                :placeholder="store.status(s).done ? km1(store.status(s).km) : 'actual'"
                :value="store.progress.km[s.id] ?? ''"
                :aria-label="'Actual km for ' + s.name"
                @change="store.setKm(s, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
          <textarea
            :value="store.progress.notes[w.n] ?? ''"
            placeholder="Notes: how it felt, HR, shin/knee/calf, anything to adjust"
            :aria-label="'Notes for week ' + w.n"
            rows="2"
            @change="store.setNote(w.n, ($event.target as HTMLTextAreaElement).value)"
          />
        </div>
      </details>
    </section>

    <template v-else-if="tab === 'quality'">
      <section class="card">
        <h2>Paces and heart rate</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Effort</th><th>Pace /km</th><th>HR</th><th>Cadence</th></tr></thead>
            <tbody>
              <tr v-for="p in PACES" :key="p.effort"><td>{{ p.effort }}</td><td>{{ p.pace }}</td><td>{{ p.hr }}</td><td>{{ p.cadence }}</td></tr>
            </tbody>
          </table>
        </div>
        <p class="small muted">All quality paces are provisional. After the 5k time trial in week 11, they are recalculated. Do every quality session on flat road, with a 10 min easy warm-up (3 strides) and a 10 min cooldown.</p>
      </section>
      <section class="card">
        <h2>The 11 quality sessions</h2>
        <div class="q">
          <template v-for="q in quality" :key="q.q">
            <span class="qid">Q{{ q.q }}</span>
            <span><b>{{ q.title }}</b><br /><span class="small muted">Week {{ q.week }} ({{ fmt(q.date) }}). {{ q.note }}</span></span>
          </template>
        </div>
      </section>
    </template>

    <template v-else>
      <section v-for="r in RULES" :key="r.title" class="card">
        <h2>{{ r.title }}</h2>
        <ul>
          <li v-for="item in r.items" :key="item">{{ item }}</li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.top .sub { margin: 4px 0 0; }
.stat .value { font-size: 1.4rem; font-weight: 700; }
.stat .label { font-size: 0.75rem; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.04em; }
.bar { height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--accent); transition: width 0.3s; }
.seg { align-self: flex-start; flex-wrap: wrap; }
.weeks { display: flex; flex-direction: column; gap: 10px; }
details.week { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
details.week.now { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
details.week > summary {
  list-style: none; color: var(--text); font-size: 1rem; padding: 14px 16px;
  display: grid; grid-template-columns: auto 1fr auto; gap: 4px 12px; align-items: center;
}
details.week > summary::-webkit-details-marker { display: none; }
.wn { font-weight: 800; font-size: 1.1rem; min-width: 2em; }
.wt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.wt strong { font-weight: 650; }
.wt small { color: var(--text-2); font-size: 0.8rem; }
.wk { text-align: right; font-size: 0.82rem; color: var(--text-2); white-space: nowrap; }
.chip { display: inline-block; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; margin-left: 4px; vertical-align: middle; background: var(--surface-2); color: var(--text-2); }
.chip.deload { color: var(--series-3); background: color-mix(in srgb, var(--series-3) 15%, transparent); }
.chip.test { color: var(--series-2); background: color-mix(in srgb, var(--series-2) 15%, transparent); }
.chip.current { color: var(--accent); background: color-mix(in srgb, var(--accent) 15%, transparent); }
.chip.complete { color: var(--good); background: color-mix(in srgb, var(--good) 15%, transparent); }
.wbody { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 10px; }
.sess { display: grid; grid-template-columns: auto 1fr auto; gap: 10px 12px; align-items: start; padding: 12px; border: 1px solid var(--border); border-radius: 10px; }
.sess.done { background: color-mix(in srgb, var(--good) 10%, transparent); border-color: transparent; }
.sess input[type='checkbox'] { width: 22px; height: 22px; min-height: 0; margin: 2px 0 0; padding: 0; accent-color: var(--accent); cursor: pointer; }
.sess .d { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sess .d label { cursor: pointer; }
.sess .k { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.sess .k input { width: 80px; min-height: 36px; padding: 6px 8px; text-align: right; }
textarea { width: 100%; font: inherit; font-size: 0.9rem; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); resize: vertical; min-height: 44px; }
.q { display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; }
.qid { font-weight: 800; color: var(--accent); min-width: 2.4em; }
ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
td { white-space: normal; }
@media (max-width: 519px) {
  .sess { grid-template-columns: auto 1fr; }
  .sess .k { grid-column: 2; flex-direction: row; align-items: center; justify-content: space-between; }
  details.week > summary { grid-template-columns: auto 1fr; }
  .wk { grid-column: 2; text-align: left; }
}
@media (prefers-reduced-motion: reduce) { .bar i { transition: none; } }
</style>
