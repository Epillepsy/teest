import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import { db } from '@/lib/db'
import { SOLIRUN_PLAN, type PlanSession } from '@/lib/plan/solirun'
import { emptyProgress, PLAN_PROGRESS_KEY, matchRuns, sessionStatus, weekTotals, type PlanProgress } from '@/lib/plan/progress'
import { useActivities } from './activities'

export const usePlan = defineStore('plan', () => {
  const plan = SOLIRUN_PLAN
  const activities = useActivities()
  const progress = ref<PlanProgress>(emptyProgress())
  const loaded = ref(false)

  async function load() {
    const row = await db.kv.get(PLAN_PROGRESS_KEY)
    progress.value = { ...emptyProgress(), ...((row?.value as Partial<PlanProgress>) ?? {}) }
    loaded.value = true
  }

  async function persist() {
    await db.kv.put({ key: PLAN_PROGRESS_KEY, value: structuredClone(toRaw(progress.value)) })
  }

  const matches = computed(() => matchRuns(plan, activities.list))
  const status = (s: PlanSession) => sessionStatus(s, progress.value, matches.value, activities.byId)

  const totals = computed(() => {
    let done = 0, total = 0, km = 0, planned = 0
    for (const w of plan.weeks) {
      const t = weekTotals(w, status)
      done += t.done
      total += t.total
      km += t.km
      planned += t.planned
    }
    return { done, total, km, planned }
  })

  /** Manual tick. Setting it back to what the matched run says clears the override. */
  async function setDone(s: PlanSession, done: boolean) {
    const p = progress.value
    const auto = matches.value.has(s.id)
    if (done === auto) delete p.done[s.id]
    else p.done[s.id] = done
    progress.value = { ...p }
    await persist()
  }

  async function setKm(s: PlanSession, text: string) {
    const v = parseFloat(text)
    const p = progress.value
    if (text.trim() === '' || !Number.isFinite(v) || v < 0) delete p.km[s.id]
    else p.km[s.id] = v
    progress.value = { ...p }
    await persist()
  }

  async function setNote(week: number, text: string) {
    const p = progress.value
    if (text) p.notes[week] = text
    else delete p.notes[week]
    progress.value = { ...p }
    await persist()
  }

  return { plan, progress, loaded, load, matches, status, totals, setDone, setKm, setNote }
})
