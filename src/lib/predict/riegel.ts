/** Riegel's endurance model: T2 = T1 · (D2 / D1)^k, with k ≈ 1.06 for trained runners. */
export const RIEGEL_EXPONENT = 1.06

export function riegelPredict(d1: number, t1: number, d2: number, exponent = RIEGEL_EXPONENT): number {
  if (d1 <= 0 || t1 <= 0 || d2 <= 0) throw new RangeError('distances and time must be positive')
  return t1 * Math.pow(d2 / d1, exponent)
}

/** Fit the personal Riegel exponent from two performances: k = ln(T2/T1) / ln(D2/D1). */
export function riegelExponent(d1: number, t1: number, d2: number, t2: number): number {
  if (d1 === d2) throw new RangeError('distances must differ')
  return Math.log(t2 / t1) / Math.log(d2 / d1)
}
