/** 3725 -> "1:02:05", 305 -> "5:05". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '–'
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`
}

/** Pace in seconds per km -> "5:05". */
export function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '–'
  return formatDuration(secPerKm)
}

export function paceSecPerKm(meters: number, seconds: number): number {
  return meters > 0 ? seconds / (meters / 1000) : NaN
}

export function formatKm(meters: number, digits = 2): string {
  return (meters / 1000).toFixed(digits)
}

/** Parse "55:00", "1:02:03" or "3300" into seconds. Returns NaN when invalid. */
export function parseDuration(text: string): number {
  const parts = text.trim().split(':').map(Number)
  if (parts.length === 0 || parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return NaN
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

export function formatDate(ms: number, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  return new Intl.DateTimeFormat(undefined, opts).format(new Date(ms))
}

export function distanceLabel(meters: number): string {
  const labels: Record<number, string> = {
    400: '400 m',
    1000: '1 km',
    1609.344: '1 mile',
    5000: '5 km',
    10000: '10 km',
    21097.5: 'Half marathon',
    42195: 'Marathon',
  }
  return labels[meters] ?? `${formatKm(meters, meters % 1000 === 0 ? 0 : 2)} km`
}
