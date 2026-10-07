import type { ActivityStreams, ActivitySummary } from '@/types'
import { db, newId, type RunDB } from './db'
import { findDuplicate } from './dedupe'
import { buildActivity, isRunningSport, type NewActivity } from './parse/normalize'
import { listZipEntries, readZipEntry } from './zip'
import { baseName, isStravaRunType, parseStravaActivities, type StravaActivityInfo } from './csv'

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

const ACTIVITY_EXT = /\.(fit|tcx|gpx)(\.gz)?$/i

/** Whether a file name looks like an activity file we can parse. */
export function isActivityFileName(name: string): boolean {
  return ACTIVITY_EXT.test(name)
}

/** Parse one activity file (.fit, .tcx, .gpx, optionally .gz-compressed). */
export async function parseActivityData(fileName: string, data: ArrayBuffer): Promise<NewActivity> {
  let name = fileName.toLowerCase()
  if (name.endsWith('.gz')) {
    data = await gunzip(data)
    name = name.slice(0, -3)
  }
  // Parsers are loaded on demand: the FIT SDK profile is large and only needed when importing.
  if (name.endsWith('.fit')) {
    const { parseFit } = await import('./parse/fit')
    return buildActivity(parseFit(data), 'fit', fileName)
  }
  // Some exporters prefix XML with whitespace/BOM before <?xml, which the XML parser rejects.
  const xml = () => new TextDecoder().decode(data).replace(/^\uFEFF?\s+/, '')
  if (name.endsWith('.tcx')) {
    const { parseTcx } = await import('./parse/tcx')
    return buildActivity(parseTcx(xml()), 'tcx', fileName)
  }
  if (name.endsWith('.gpx')) {
    const { parseGpx } = await import('./parse/gpx')
    return buildActivity(parseGpx(xml()), 'gpx', fileName)
  }
  throw new Error('Unsupported file type (expected .fit, .tcx or .gpx)')
}

export async function parseFile(file: File): Promise<NewActivity> {
  return parseActivityData(file.name, await file.arrayBuffer())
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

/** One activity to import. Data is read lazily so huge archives never sit in memory at once. */
export interface ImportSource {
  /** Display name (path inside an archive, or file name). */
  name: string
  read(): Promise<ArrayBuffer>
  /** Metadata from Strava's activities.csv, when the source came from a Strava export. */
  strava?: StravaActivityInfo
}

export interface ImportProgress {
  done: number
  total: number
  imported: number
  duplicate: number
  skipped: number
  error: number
}

export interface ImportOptions {
  onProgress?: (p: ImportProgress) => void
  signal?: AbortSignal
  /** Activities are written to the database every `batchSize` parsed files. */
  batchSize?: number
  database?: RunDB
}

/** A file found inside a dropped folder, with its path relative to the drop. */
export interface PickedFile {
  file: File
  path: string
}

/**
 * Expands what the user picked (files, folder contents, ZIP archives such as a Strava
 * "Download your data" export) into individual activity sources. Unrelated files inside
 * archives/folders (photos, JSON, …) are ignored; unrelated files picked directly are
 * reported as errors so the user knows they were not imported.
 */
export async function collectSources(picked: (File | PickedFile)[]): Promise<{ sources: ImportSource[]; rejected: ImportResult[] }> {
  const sources: ImportSource[] = []
  const rejected: ImportResult[] = []
  const strava = new Map<string, StravaActivityInfo>()

  for (const item of picked) {
    // Files from a folder (picker or drag & drop) carry a relative path; loose files don't.
    const { file, path } = item instanceof File ? { file: item, path: item.webkitRelativePath } : item
    const fromFolder = !!path
    const lower = file.name.toLowerCase()
    if (lower === 'activities.csv') {
      for (const [k, v] of parseStravaActivities(await file.text())) strava.set(k, v)
    } else if (lower.endsWith('.zip')) {
      try {
        const entries = await listZipEntries(file)
        for (const entry of entries) {
          if (entry.name.startsWith('__MACOSX/')) continue
          if (baseName(entry.name) === 'activities.csv') {
            const text = new TextDecoder().decode(await readZipEntry(file, entry))
            for (const [k, v] of parseStravaActivities(text)) strava.set(k, v)
          } else if (isActivityFileName(entry.name)) {
            sources.push({ name: entry.name, read: () => readZipEntry(file, entry) })
          }
        }
      } catch (e) {
        rejected.push({ fileName: file.name, status: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    } else if (isActivityFileName(lower) || !fromFolder) {
      // Loose files with odd names are still tried (and reported if they fail).
      sources.push({ name: path || file.name, read: () => file.arrayBuffer() })
    }
  }
  for (const s of sources) s.strava = strava.get(baseName(s.name))
  return { sources, rejected }
}

/** Parse and store many activities, saving in batches, with progress and cancellation. */
export async function importSources(sources: ImportSource[], opts: ImportOptions = {}): Promise<ImportResult[]> {
  const database = opts.database ?? db
  const batchSize = opts.batchSize ?? 20
  const results: ImportResult[] = []
  const progress: ImportProgress = { done: 0, total: sources.length, imported: 0, duplicate: 0, skipped: 0, error: 0 }
  let pending: { activity: NewActivity; fileName: string; extra?: Partial<ActivitySummary> }[] = []

  const record = (rs: ImportResult[]) => {
    for (const r of rs) progress[r.status]++
    results.push(...rs)
  }
  const flush = async () => {
    if (!pending.length) return
    const batch = pending
    pending = []
    record(await saveActivities(batch, database))
  }

  for (const source of sources) {
    if (opts.signal?.aborted) break
    const fileName = source.name
    try {
      if (source.strava?.type && !isStravaRunType(source.strava.type)) {
        // Known non-run from Strava's CSV: skip without decompressing or parsing.
        record([{ fileName, status: 'skipped', message: `Not a run (${source.strava.type})` }])
      } else {
        const activity = await parseActivityData(fileName, await source.read())
        if (!isRunningSport(activity.summary.sport)) {
          record([{ fileName, status: 'skipped', message: `Not a run (${activity.summary.sport})` }])
        } else if (activity.summary.duration <= 0) {
          record([{ fileName, status: 'skipped', message: 'Empty activity' }])
        } else {
          pending.push({ activity, fileName, extra: source.strava?.name ? { name: source.strava.name } : undefined })
          if (pending.length >= batchSize) await flush()
        }
      }
    } catch (e) {
      record([{ fileName, status: 'error', message: e instanceof Error ? e.message : String(e) }])
    }
    progress.done++
    opts.onProgress?.({ ...progress })
    // Yield so the UI can repaint between files.
    await new Promise((r) => setTimeout(r, 0))
  }
  // Keep what was already parsed even when cancelled.
  await flush()
  opts.onProgress?.({ ...progress })
  return results
}

/** Import user-picked files: activity files, folders' contents and ZIP archives. */
export async function importFiles(files: (File | PickedFile)[], opts: ImportOptions = {}): Promise<ImportResult[]> {
  const { sources, rejected } = await collectSources(files)
  return [...rejected, ...(await importSources(sources, opts))]
}
