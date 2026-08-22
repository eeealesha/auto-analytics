import { describe, it, expect } from 'vitest';
import { calcAnnualMileage, formatAnnual } from './usage';

const NBSP = '\u00A0';
const CY = 2026;

describe('calcAnnualMileage', () => {
  it('divides total mileage by age', () => {
    const car = { mileage: 65000, year: 2021 };
    expect(calcAnnualMileage(car, CY)).toBe(13000);
  });

  it('clamps age to 1 for current-year car', () => {
    const car = { mileage: 3000, year: CY };
    expect(calcAnnualMileage(car, CY)).toBe(3000);
  });

  it('clamps age to 1 for future-year car', () => {
    const car = { mileage: 2000, year: CY + 1 };
    expect(calcAnnualMileage(car, CY)).toBe(2000);
  });

  it('returns null for new cars', () => {
    const car = { mileage: 15000, year: 2023, isNew: true };
    expect(calcAnnualMileage(car, CY)).toBeNull();
  });

  it('returns null for unreliable low mileage (<= 500 km)', () => {
    const car = { mileage: 100, year: 2021 };
    expect(calcAnnualMileage(car, CY)).toBeNull();
  });

  it('returns null when mileage is missing or zero', () => {
    expect(calcAnnualMileage({ year: 2020 }, CY)).toBeNull();
    expect(calcAnnualMileage({ mileage: 0, year: 2020 }, CY)).toBeNull();
    expect(calcAnnualMileage({ mileage: null, year: 2020 }, CY)).toBeNull();
  });

  it('returns null when year is missing', () => {
    expect(calcAnnualMileage({ mileage: 50000 }, CY)).toBeNull();
  });
});

describe('formatAnnual', () => {
  it('formats annual mileage with spaces and km/year unit', () => {
    expect(formatAnnual(8400)).toBe(`8${NBSP}400 км/год`);
  });

  it('returns dash for null', () => {
    expect(formatAnnual(null)).toBe('—');
  });
});
