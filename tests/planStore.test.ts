import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { db } from '@/lib/db'
import { usePlan } from '@/stores/plan'
import { toPlanFile } from '@/lib/plan/file'
import { SOLIRUN_PLAN } from '@/lib/plan/solirun'

const session = (id: string) => SOLIRUN_PLAN.weeks.flatMap((w) => w.sessions).find((s) => s.id === id)!

beforeEach(async () => {
  await db.kv.clear()
  setActivePinia(createPinia())
})

describe('plan store', () => {
  it('persists ticks, km and notes across a reload', async () => {
    const store = usePlan()
    await store.load()
    await store.setDone(session('w2-long'), true)
    await store.setKm(session('w2-long'), '7.5')
    await store.setNote(2, 'legs ok')

    setActivePinia(createPinia())
    const again = usePlan()
    await again.load()
    expect(again.progress).toEqual({ done: { 'w2-long': true }, km: { 'w2-long': 7.5 }, notes: { 2: 'legs ok' } })
  })

  it('imports a plan file, keeps progress, and resets to the built-in plan', async () => {
    const store = usePlan()
    await store.load()
    await store.setDone(session('w2-long'), true)

    const file = JSON.parse(JSON.stringify(toPlanFile(SOLIRUN_PLAN)))
    file.title = 'Updated plan'
    file.weeks[1].sessions[0].km = 8
    await store.importPlan(file)
    expect(store.imported).toBe(true)
    expect(store.plan.title).toBe('Updated plan')

    setActivePinia(createPinia())
    const again = usePlan()
    await again.load()
    expect(again.plan.title).toBe('Updated plan')
    expect(again.plan.weeks[1].plannedKm).toBe(13)
    expect(again.status(again.plan.weeks[1].sessions[0]).done).toBe(true)

    await again.resetPlan()
    expect(again.imported).toBe(false)
    expect(again.plan.title).toBe(SOLIRUN_PLAN.title)
  })

  it('rejects a bad file and keeps the current plan', async () => {
    const store = usePlan()
    await store.load()
    await expect(store.importPlan({ format: 'nope' })).rejects.toThrow(/Not a Stride plan/)
    expect(store.plan).toBe(SOLIRUN_PLAN)
    expect(await db.kv.get('plan')).toBeUndefined()
  })
})
