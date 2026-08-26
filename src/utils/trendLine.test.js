import { describe, it, expect } from 'vitest'
import { linearRegression } from './trendLine'

describe('linearRegression', () => {
  it('returns slope and intercept for perfect line', () => {
    const points = [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }]
    const { slope, intercept } = linearRegression(points)
    expect(slope).toBeCloseTo(2)
    expect(intercept).toBeCloseTo(0)
  })

  it('handles single point', () => {
    const points = [{ x: 5, y: 10 }]
    const { slope, intercept } = linearRegression(points)
    expect(slope).toBe(0)
    expect(intercept).toBe(10)
  })

  it('returns zero slope for empty array', () => {
    const { slope, intercept } = linearRegression([])
    expect(slope).toBe(0)
    expect(intercept).toBe(0)
  })

  it('computes best fit for noisy data', () => {
    const points = [{ x: 1, y: 2.1 }, { x: 2, y: 3.9 }, { x: 3, y: 6.1 }]
    const { slope, intercept } = linearRegression(points)
    expect(slope).toBeCloseTo(2, 0)
    expect(intercept).toBeCloseTo(0, 0)
  })
})
