import { describe, expect, it } from 'vitest'
import { riegelExponent, riegelPredict } from '@/lib/predict/riegel'

describe('Riegel', () => {
  it('predicts with exponent 1.06', () => {
    expect(riegelPredict(5000, 1200, 10000)).toBeCloseTo(1200 * Math.pow(2, 1.06), 6)
    expect(riegelPredict(5000, 1200, 10000)).toBeCloseTo(2502.2, 0)
  })
  it('is identity for the same distance and symmetric', () => {
    expect(riegelPredict(10000, 3000, 10000)).toBe(3000)
    const t = riegelPredict(5000, 1500, 21097.5)
    expect(riegelPredict(21097.5, t, 5000)).toBeCloseTo(1500, 6)
  })
  it('supports custom exponents and recovers them', () => {
    const t2 = riegelPredict(5000, 1500, 10000, 1.1)
    expect(riegelExponent(5000, 1500, 10000, t2)).toBeCloseTo(1.1, 10)
  })
  it('throws on invalid input', () => {
    expect(() => riegelPredict(0, 1, 1)).toThrow()
    expect(() => riegelExponent(5000, 1, 5000, 2)).toThrow()
  })
})
