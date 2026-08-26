import { describe, it, expect } from 'vitest'
import { getSegment, getDefaultThresholds, getCarsBySegment } from './segmentation'

describe('segmentation', () => {
  const defaultThresholds = getDefaultThresholds()

  it('getDefaultThresholds returns economyMax and luxuryMin', () => {
    expect(defaultThresholds).toHaveProperty('economyMax')
    expect(defaultThresholds).toHaveProperty('luxuryMin')
    expect(defaultThresholds.economyMax).toBeLessThan(defaultThresholds.luxuryMin)
  })

  it('getSegment returns "economy" for cheap car', () => {
    const car = { brand: 'Kia', model: 'Rio', price: 800000 }
    expect(getSegment(car, defaultThresholds)).toBe('economy')
  })

  it('getSegment returns "business" for mid-range car', () => {
    const car = { brand: 'BMW', model: '5 серия', price: 3500000 }
    expect(getSegment(car, defaultThresholds)).toBe('business')
  })

  it('getSegment returns "luxury" for expensive car', () => {
    const car = { brand: 'Rolls-Royce', model: 'Ghost', price: 15000000 }
    expect(getSegment(car, defaultThresholds)).toBe('luxury')
  })

  it('getSegment uses car price, not brand average', () => {
    const cheapBmw = { brand: 'BMW', model: '3 серия', price: 1200000 }
    expect(getSegment(cheapBmw, defaultThresholds)).toBe('economy')
  })

  it('getCarsBySegment filters correctly', () => {
    const cars = [
      { brand: 'Kia', model: 'Rio', price: 800000 },
      { brand: 'BMW', model: '5 серия', price: 3500000 },
      { brand: 'Rolls-Royce', model: 'Ghost', price: 15000000 },
    ]
    expect(getCarsBySegment(cars, 'economy', defaultThresholds)).toHaveLength(1)
    expect(getCarsBySegment(cars, 'business', defaultThresholds)).toHaveLength(1)
    expect(getCarsBySegment(cars, 'luxury', defaultThresholds)).toHaveLength(1)
  })

  it('getCarsBySegment returns all when segment is "all"', () => {
    const cars = [
      { brand: 'Kia', model: 'Rio', price: 800000 },
      { brand: 'BMW', model: '5 серия', price: 3500000 },
    ]
    expect(getCarsBySegment(cars, 'all', defaultThresholds)).toHaveLength(2)
  })

  it('custom thresholds are respected', () => {
    const custom = { economyMax: 500000, luxuryMin: 1000000 }
    const car = { brand: 'Toyota', model: 'Camry', price: 800000 }
    expect(getSegment(car, custom)).toBe('business')
  })
})