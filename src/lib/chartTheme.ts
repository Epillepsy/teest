import type uPlot from 'uplot'

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
}

/** Recessive axis styling using the current theme tokens. */
export function axis(opts: Partial<uPlot.Axis> = {}): uPlot.Axis {
  return {
    stroke: cssVar('--text-2'),
    grid: { stroke: cssVar('--grid'), width: 1 },
    ticks: { show: false },
    font: '12px system-ui, sans-serif',
    ...opts,
  }
}

export function line(label: string, colorVar: string, opts: Partial<uPlot.Series> = {}): uPlot.Series {
  return { label, stroke: cssVar(colorVar), width: 2, points: { show: false }, spanGaps: false, ...opts }
}
