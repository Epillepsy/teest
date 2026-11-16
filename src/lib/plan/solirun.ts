/**
 * The Soli'run 10 km training plan (race Sunday 21 March 2027, goal sub 55).
 * 18 weeks starting Monday 16 November 2026. Hard-coded for now; a plan editor can come later.
 */

export type WeekKind = 'build' | 'rest' | 'deload' | 'test'
export type SessionType = 'rest' | 'long' | 'footing' | 'quality' | 'test' | 'race'

export interface PlanSession {
  id: string
  /** Local date, YYYY-MM-DD. Empty for the all-week rest entry. */
  date: string
  /** Label shown before the name, e.g. "Mon 23 Nov" or "All week". */
  day: string
  type: SessionType
  name: string
  detail: string
  /** Planned km (0 for rest). */
  km: number
}

export interface PlanWeek {
  n: number
  block: string
  kind: WeekKind
  /** Local dates, YYYY-MM-DD. */
  start: string
  end: string
  gym?: string
  sessions: PlanSession[]
  plannedKm: number
}

export interface Plan {
  id: string
  title: string
  subtitle: string
  raceDate: string
  weeks: PlanWeek[]
}

/** YYYY-MM-DD for a local date. */
export function isoDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Local midnight for a YYYY-MM-DD string. */
export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

const shortDay = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export const PACES = [
  { effort: 'Easy (footing, long run)', pace: '6:45–7:15', hr: '≤ 145 (Z2)', cadence: '165–170' },
  { effort: 'Aerobic speed reps', pace: '~5:40', hr: 'hard but smooth', cadence: '170–175' },
  { effort: 'Threshold', pace: '5:48–5:50', hr: '~165–172', cadence: '170–175' },
  { effort: 'Race-specific', pace: '5:25–5:32', hr: '~172–180', cadence: '175–180' },
  { effort: 'Goal 10k (sub 55)', pace: '5:30', hr: '—', cadence: '—' },
]

export const QUALITY: Record<number, [string, string]> = {
  1: ['8 × 1 min at ~5:40, 1 min easy between', 'Aerobic speed. Smooth, not a sprint.'],
  2: ['6 × 2 min at ~5:40, 1 min easy between', 'Same pace, longer reps.'],
  3: ['6 × 1 min at 5:40, 1 min easy between', 'Deload week, keep it light.'],
  4: ['4 × 4 min at 5:50 (threshold), 90 s jog between', 'Comfortably hard. You could say a few words, not a sentence.'],
  5: ['3 × 7 min at 5:48, 2 min jog between', 'Longer threshold blocks.'],
  6: ['5 × 1 min at 5:30, 1 min easy between', 'Deload week, short and sharp.'],
  7: ['5 × 1 km at 5:25, 90 s jog between', 'First race-specific session.'],
  8: ['4 × 2 km at 5:32, 2:30 jog between', 'Hold the pace evenly across all four.'],
  9: ['3 × 3 km at 5:30, 3 min jog between', 'Goal pace. This is the key session of the block.'],
  10: ['6 × 1 min at 5:25, 1 min easy between', 'Deload week, stay fresh.'],
  11: ['3 × 2 km at 5:28, 2:30 jog between', 'Last hard session. Finish by Wed Mar 10.'],
}

export const RULES: { title: string; items: string[] }[] = [
  {
    title: 'Weekly layout',
    items: [
      'Monday: long run with your group, conversational.',
      'Wednesday: footing, easy, run home from the office.',
      'Friday: quality session (starts Dec 21).',
      'Keep heavy squat or deadlift days at least 48 h away from the quality session and the long run.',
    ],
  },
  {
    title: 'Progressive overload',
    items: [
      'Build weeks rise about 8–10% in volume. The long run grows 1 km a week, capped at 11 km.',
      'Week 6 is the one bigger jump because the third session arrives. The other two runs stay flat that week.',
      'After that, quality work grows from 1 min efforts to 9 km at goal pace.',
    ],
  },
  {
    title: 'Gym (5/3/1, reduced leg volume)',
    items: [
      'Deload weeks Dec 7, Jan 4, Feb 1 and Mar 1 match the gym deloads.',
      'Last cycle: a 5s week on Mar 8, then a deload in race week (Mar 15).',
      'No heavy top-set singles within 3 weeks of the race.',
      'Rest week Nov 16–22 and the week after the race (Mar 22–28): easy or off.',
    ],
  },
  {
    title: 'Body and safety',
    items: [
      'Calf raises, dorsiflexion with the kettlebell and eccentric work 2–3 times a week.',
      'If shin, knee or calf flares up: drop the quality session first, then shorten the long run.',
      'Red flags that mean stop and get it checked: point tenderness, pain at night, swelling, locking.',
      'Raise cadence about 5 spm every few weeks, never in the final weeks.',
      "If the Soli'run turns out to be gravel, run some long runs on similar ground from week 13.",
      'Christmas and New Year weeks can slide by a day or two, but keep the deload in week 8.',
    ],
  },
  {
    title: 'Race week',
    items: [
      'Last hard session is Q11, done by Wed Mar 10.',
      'Mar 15 week: 4 km easy with strides, 3 km shakeout the day before, carbs up Friday and Saturday.',
      'Race-day breakfast: familiar food, 2.5–3 h before the start. Open at 5:35, settle at 5:30, push from km 7.',
    ],
  },
]

const START = '2026-11-16'
const GYM: Record<number, string> = { 4: 'Deload', 8: 'Deload', 12: 'Deload', 16: 'Deload', 17: '5s week, no max singles', 18: 'Deload' }
const EASY = 'Easy, 6:45–7:15/km, HR ≤ 145. Finish with calf and ankle work.'

/** [week, block, kind, footing km, long km, quality km, quality # or 'TT'] */
const WEEKS: [number, string, WeekKind, number, number, number, number | 'TT' | null][] = [
  [1, 'Rest', 'rest', 0, 0, 0, null],
  [2, 'Base', 'build', 5, 7, 0, null],
  [3, 'Base', 'build', 5, 8, 0, null],
  [4, 'Deload', 'deload', 4, 6, 0, null],
  [5, 'Base', 'build', 6, 9, 0, null],
  [6, 'Aerobic speed', 'build', 5, 8, 5, 1],
  [7, 'Aerobic speed', 'build', 6, 9, 6, 2],
  [8, 'Deload', 'deload', 4, 6, 5, 3],
  [9, 'Threshold', 'build', 6, 10, 8, 4],
  [10, 'Threshold', 'build', 6, 11, 9, 5],
  [11, 'Threshold and test', 'test', 5, 9, 9, 'TT'],
  [12, 'Deload', 'deload', 4, 7, 5, 6],
  [13, 'Race-specific', 'build', 6, 11, 9, 7],
  [14, 'Race-specific', 'build', 6, 11, 11, 8],
  [15, 'Race-specific', 'build', 5, 10, 12, 9],
  [16, 'Deload', 'deload', 4, 7, 5, 10],
  [17, 'Sharpen', 'build', 5, 8, 10, 11],
  [18, 'Taper and race', 'deload', 4, 3, 0, null],
]

function buildWeeks(): PlanWeek[] {
  const start = parseDay(START)
  return WEEKS.map(([n, block, kind, foot, long, qual, q]) => {
    const s = addDays(start, (n - 1) * 7)
    const e = addDays(s, 6)
    const at = (offset: number) => {
      const d = addDays(s, offset)
      return { date: isoDay(d), day: shortDay(d) }
    }
    const sessions: PlanSession[] = []
    if (n === 1) {
      sessions.push({ id: 'w1-rest', date: '', day: 'All week', type: 'rest', name: 'Full rest', detail: 'No running. Keep the calf, dorsiflexion and mobility work going.', km: 0 })
    } else if (n === 18) {
      sessions.push({ id: 'w18-foot', ...at(0), type: 'footing', name: 'Footing with strides', detail: '4 km easy, then 4 × 20 s strides, full recovery. Nothing hard.', km: 4 })
      sessions.push({ id: 'w18-shake', ...at(5), type: 'footing', name: 'Shakeout', detail: '3 km very easy with 3 short strides. Carbs up, familiar dinner.', km: 3 })
      sessions.push({ id: 'w18-race', ...at(6), type: 'race', name: "RACE · Soli'run 10 km", detail: 'Open at 5:35, settle at 5:30, push from km 7. Log your time in the note.', km: 10 })
    } else {
      sessions.push({ id: `w${n}-long`, ...at(0), type: 'long', name: 'Long run', detail: EASY.replace('Easy', 'Easy with your group, conversational'), km: long })
      sessions.push({ id: `w${n}-foot`, ...at(2), type: 'footing', name: 'Footing', detail: EASY, km: foot })
      if (q === 'TT') {
        sessions.push({ id: `w${n}-q`, ...at(4), type: 'test', name: '5k time trial', detail: '10 min warm-up, 3 strides, then 5 km at the best even effort you can hold. Cooldown 10 min. Use the time to reset all paces.', km: qual })
      } else if (q) {
        sessions.push({ id: `w${n}-q`, ...at(4), type: 'quality', name: `Q${q} · ${QUALITY[q][0]}`, detail: `${QUALITY[q][1]} About ${qual} km including warm-up and cooldown.`, km: qual })
      }
    }
    return {
      n,
      block,
      kind,
      start: isoDay(s),
      end: isoDay(e),
      gym: GYM[n],
      sessions,
      plannedKm: sessions.reduce((a, x) => a + x.km, 0),
    }
  })
}

export const SOLIRUN_PLAN: Plan = {
  id: 'solirun-2027',
  title: "Soli'run 10 km · Sunday 21 March 2027",
  subtitle: 'Bois de Boulogne · 18 weeks from Nov 16 · goal: sub 55 (provisional paces, reset after the 5k time trial in week 11)',
  raceDate: '2027-03-21',
  weeks: buildWeeks(),
}

/** Index of the week containing `today`, 0 before the plan starts, -1 after it ends. */
export function currentWeekIndex(plan: Plan, today: Date = new Date()): number {
  const t = isoDay(today)
  if (t < plan.weeks[0].start) return 0
  return plan.weeks.findIndex((w) => t >= w.start && t <= w.end)
}

/** Week number and planned date of each quality session, for the overview list. */
export function qualityOverview(plan: Plan) {
  const out: { q: number; week: number; date: string; title: string; note: string }[] = []
  for (const w of plan.weeks) {
    for (const s of w.sessions) {
      const m = /^Q(\d+) /.exec(s.name)
      if (m) {
        const q = Number(m[1])
        out.push({ q, week: w.n, date: s.date, title: QUALITY[q][0], note: QUALITY[q][1] })
      }
    }
  }
  return out
}
