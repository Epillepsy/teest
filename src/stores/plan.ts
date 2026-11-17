import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { db } from '@/lib/db'
import { SOLIRUN_PLAN, type Plan, type PlanSession } from '@/lib/plan/solirun'
import { parsePlanFile, toPlanFile } from '@/lib/plan/file'
import { emptyProgress, PLAN_KEY, PLAN_PROGRESS_KEY, matchRuns, sessionStatus, weekTotals, type PlanProgress } from '@/lib/plan/progress'
import { useActivities } from './activities'

export const usePlan = defineStore('plan', () => {
  /** The imported plan, or the built-in one until a plan file is imported. */
  const plan = shallowRef<Plan>(SOLIRUN_PLAN)
  const imported = ref(false)
  const activities = useActivities()
  const progress = ref<PlanProgress>(emptyProgress())
  const loaded = ref(false)

  async function load() {
    const [row, planRow] = await Promise.all([db.kv.get(PLAN_PROGRESS_KEY), db.kv.get(PLAN_KEY)])
    plan.value = SOLIRUN_PLAN
    imported.value = false
    if (planRow) {
      try {
        plan.value = parsePlanFile(planRow.value)
        imported.value = true
      } catch {
        // A stored plan that no longer validates falls back to the built-in one.
      }
    }
    progress.value = { ...emptyProgress(), ...((row?.value as Partial<PlanProgress>) ?? {}) }
    loaded.value = true
  }

  async function persist() {
    await db.kv.put({ key: PLAN_PROGRESS_KEY, value: JSON.parse(JSON.stringify(progress.value)) })
  }

  const matches = computed(() => matchRuns(plan.value, activities.list))
  const status = (s: PlanSession) => sessionStatus(s, progress.value, matches.value, activities.byId)

  const totals = computed(() => {
    let done = 0, total = 0, km = 0, planned = 0
    for (const w of plan.value.weeks) {
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

  /**
   * Replaces the plan with a plan file. Ticks, km and notes are kept: they are keyed by
   * session id and week number, so sessions that still exist keep their progress.
   */
  async function importPlan(data: unknown) {
    const next = parsePlanFile(data)
    await db.kv.put({ key: PLAN_KEY, value: toPlanFile(next) })
    plan.value = next
    imported.value = true
    return next
  }

  async function resetPlan() {
    await db.kv.delete(PLAN_KEY)
    plan.value = SOLIRUN_PLAN
    imported.value = false
  }

  return { plan, imported, importPlan, resetPlan, progress, loaded, load, matches, status, totals, setDone, setKm, setNote }
})
