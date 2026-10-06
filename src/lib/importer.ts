import type { ActivityStreams, ActivitySummary } from '@/types'
import { db, newId, type RunDB } from './db'
import { findDuplicate } from './dedupe'
import { buildActivity, isRunningSport, type NewActivity } from './parse/normalize'

export type ImportStatus = 'imported' | 'duplicate' | 'skipped' | 'error'

export interface ImportResult {
  fileName: string
  status: ImportStatus
  message?: string
  id?: string
}

async function gunzip(data: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream('gzip')
  return new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer()
}

/** Parse one file (.fit, .tcx, optionally .gz-compressed, as exported by Strava/Garmin). */
export async function parseFile(file: File): Promise<NewActivity> {
  let name = file.name.toLowerCase()
  let data = await file.arrayBuffer()
  if (name.endsWith('.gz')) {
    data = await gunzip(data)
    name = name.slice(0, -3)
  }
  // Parsers are loaded on demand: the FIT SDK profile is large and only needed when importing.
  if (name.endsWith('.fit')) {
    const { parseFit } = await import('./parse/fit')
    return buildActivity(parseFit(data), 'fit', file.name)
  }
  if (name.endsWith('.tcx')) {
    // Some exporters prefix TCX with whitespace/BOM before <?xml, which the XML parser rejects.
    const { parseTcx } = await import('./parse/tcx')
    const text = new TextDecoder().decode(data).replace(/^﻿?\s+/, '')
    return buildActivity(parseTcx(text), 'tcx', file.name)
  }
  throw new Error('Unsupported file type (expected .fit or .tcx)')
}

/** Insert into a startTime-sorted array, keeping it sorted. */
function insertSorted(list: ActivitySummary[], a: ActivitySummary) {
  let i = list.length
  while (i > 0 && list[i - 1].startTime > a.startTime) i--
  list.splice(i, 0, a)
}

/**
 * Store parsed activities, skipping duplicates (same start time and duration as an
 * existing activity or an earlier one in the same batch).
 */
export async function saveActivities(
  items: { activity: NewActivity; fileName: string; extra?: Partial<ActivitySummary> }[],
  database: RunDB = db,
): Promise<ImportResult[]> {
  const existing = await database.activities.orderBy('startTime').toArray()
  const results: ImportResult[] = []
  const toAdd: ActivitySummary[] = []
  const streams: ActivityStreams[] = []
  for (const { activity, fileName, extra } of items) {
    const dup = findDuplicate(existing, activity.summary)
    if (dup) {
      results.push({ fileName, status: 'duplicate', id: dup.id, message: `Same as “${dup.name}”` })
      continue
    }
    const id = newId()
    const summary: ActivitySummary = { ...activity.summary, ...extra, id, importedAt: Date.now() }
    insertSorted(existing, summary)
    toAdd.push(summary)
    streams.push({ ...activity.streams, id })
    results.push({ fileName, status: 'imported', id })
  }
  if (toAdd.length) {
    await database.transaction('rw', database.activities, database.streams, async () => {
      await database.activities.bulkAdd(toAdd)
      await database.streams.bulkAdd(streams)
    })
  }
  return results
}

export async function importFiles(
  files: File[],
  onProgress?: (done: number, total: number) => void,
  database: RunDB = db,
): Promise<ImportResult[]> {
  const parsed: { activity: NewActivity; fileName: string }[] = []
  const results: ImportResult[] = []
  let done = 0
  for (const file of files) {
    try {
      const activity = await parseFile(file)
      if (!isRunningSport(activity.summary.sport)) {
        results.push({ fileName: file.name, status: 'skipped', message: `Not a run (${activity.summary.sport})` })
      } else if (activity.summary.duration <= 0) {
        results.push({ fileName: file.name, status: 'skipped', message: 'Empty activity' })
      } else {
        parsed.push({ activity, fileName: file.name })
      }
    } catch (e) {
      results.push({ fileName: file.name, status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
    onProgress?.(++done, files.length)
    // Yield so the UI can repaint between large files.
    await new Promise((r) => setTimeout(r, 0))
  }
  return [...results, ...(await saveActivities(parsed, database))]
}
