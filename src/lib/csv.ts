/** RFC 4180 CSV parser (quoted fields, escaped quotes, embedded newlines, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        quoted = false
      } else {
        field += c
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export interface StravaActivityInfo {
  name?: string
  type?: string
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).toLowerCase()
}

/**
 * Reads Strava's activities.csv (from "Download your data") into a map keyed by the
 * activity file's base name, e.g. "1234567890.fit.gz".
 */
export function parseStravaActivities(text: string): Map<string, StravaActivityInfo> {
  const rows = parseCsv(text.replace(/^﻿/, ''))
  const out = new Map<string, StravaActivityInfo>()
  if (!rows.length) return out
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const iFile = header.indexOf('filename')
  const iName = header.indexOf('activity name')
  const iType = header.indexOf('activity type')
  if (iFile < 0) return out
  for (const r of rows.slice(1)) {
    const file = r[iFile]?.trim()
    if (!file) continue
    out.set(baseName(file), { name: r[iName]?.trim() || undefined, type: r[iType]?.trim() || undefined })
  }
  return out
}

/** Strava activity types that count as running ("Run", "Trail Run", "Virtual Run", …). */
export function isStravaRunType(type: string): boolean {
  return /run/i.test(type)
}
