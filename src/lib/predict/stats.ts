/** Standard normal CDF (Abramowitz & Stegun 7.1.26 erf approximation, |err| < 1.5e-7). */
export function normCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}

export function weightedMean(values: number[], weights: number[]): number {
  let sw = 0
  let s = 0
  for (let i = 0; i < values.length; i++) {
    s += values[i] * weights[i]
    sw += weights[i]
  }
  return sw > 0 ? s / sw : NaN
}

export function weightedStd(values: number[], weights: number[]): number {
  const m = weightedMean(values, weights)
  let sw = 0
  let s = 0
  for (let i = 0; i < values.length; i++) {
    s += weights[i] * (values[i] - m) ** 2
    sw += weights[i]
  }
  return sw > 0 ? Math.sqrt(s / sw) : 0
}
