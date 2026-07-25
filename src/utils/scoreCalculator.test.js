import { describe, it, expect } from 'vitest';
import { calculateScore, formatPrice, formatMileage } from './scoreCalculator';

describe('calculateScore', () => {
  const cars = [
    { brand: 'Toyota', model: 'Camry', price: 2000000, mileage: 50000, year: 2020 },
    { brand: 'Toyota', model: 'Camry', price: 2500000, mileage: 30000, year: 2021 },
    { brand: 'Toyota', model: 'Camry', price: 1800000, mileage: 70000, year: 2019 },
    { brand: 'BMW', model: 'X5', price: 5000000, mileage: 20000, year: 2022 },
    { brand: 'BMW', model: 'X5', price: 4500000, mileage: 40000, year: 2021 },
  ];

  it('adds score and avgPrice to each car', () => {
    const result = calculateScore(cars);
    expect(result).toHaveLength(5);
    result.forEach(car => {
      expect(car).toHaveProperty('score');
      expect(car).toHaveProperty('scoreLabel');
      expect(car).toHaveProperty('avgPrice');
    });
  });

  it('calculates positive score for below-average price', () => {
    const result = calculateScore(cars);
    const cheap = result.find(c => c.price === 1800000);
    expect(cheap.score).toBeGreaterThan(0);
  });

  it('calculates negative score for above-average price', () => {
    const result = calculateScore(cars);
    const expensive = result.find(c => c.price === 2500000);
    expect(expensive.score).toBeLessThan(0);
  });

  it('labels score > 20 as "Отличная сделка"', () => {
    const input = [
      { brand: 'A', model: 'B', price: 500000, mileage: 10000, year: 2023 },
      { brand: 'A', model: 'B', price: 2000000, mileage: 50000, year: 2020 },
      { brand: 'A', model: 'B', price: 1900000, mileage: 60000, year: 2019 },
    ];
    const result = calculateScore(input);
    expect(result[0].scoreLabel).toBe('Отличная сделка');
  });

  it('labels score 10-20 as "Хорошая сделка"', () => {
    const input = [
      { brand: 'A', model: 'B', price: 1700000, mileage: 30000, year: 2022 },
      { brand: 'A', model: 'B', price: 2000000, mileage: 50000, year: 2020 },
      { brand: 'A', model: 'B', price: 1900000, mileage: 60000, year: 2019 },
    ];
    const result = calculateScore(input);
    const good = result.find(c => c.price === 1700000);
    expect(good.scoreLabel).toBe('Хорошая сделка');
    expect(good.score).toBeGreaterThanOrEqual(10);
    expect(good.score).toBeLessThanOrEqual(20);
  });

  it('returns "Мало данных" for unique models', () => {
    const input = [
      { brand: 'Lada', model: 'Granta', price: 800000, mileage: 10000, year: 2022 },
    ];
    const result = calculateScore(input);
    expect(result[0].scoreLabel).toBe('Мало данных');
    expect(result[0].score).toBe(0);
  });

  it('handles missing mileage and year', () => {
    const input = [
      { brand: 'A', model: 'B', price: 1000000 },
      { brand: 'A', model: 'B', price: 1500000 },
    ];
    const result = calculateScore(input);
    result.forEach(car => {
      expect(car.score).toBeDefined();
      expect(car.avgPrice).toBeDefined();
    });
  });
});

const NBSP = '\u00A0';

describe('formatPrice', () => {
  it('formats number with spaces and ruble sign', () => {
    expect(formatPrice(1234567)).toBe(`1${NBSP}234${NBSP}567 ₽`);
  });

  it('formats zero', () => {
    expect(formatPrice(0)).toBe('0 ₽');
  });

  it('formats large numbers', () => {
    expect(formatPrice(10000000)).toBe(`10${NBSP}000${NBSP}000 ₽`);
  });
});

describe('formatMileage', () => {
  it('formats mileage with spaces and km', () => {
    expect(formatMileage(123456)).toBe(`123${NBSP}456 км`);
  });

  it('returns dash for null/undefined', () => {
    expect(formatMileage(null)).toBe('—');
    expect(formatMileage(undefined)).toBe('—');
  });

  it('formats zero as dash (falsy)', () => {
    expect(formatMileage(0)).toBe('—');
  });
});
