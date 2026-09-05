// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { matchKey, findMatches, normalizeEngineVolume, normalizeModel } from './matchCars.js';

describe('matchCars', () => {
  it('нормализует объём из см³ в литры', () => {
    expect(normalizeEngineVolume(2493)).toBe(2.5);
    expect(normalizeEngineVolume(2.5)).toBe(2.5);
    expect(normalizeEngineVolume(null)).toBeNull();
  });

  it('нормализует модель через алиасы и slug', () => {
    expect(normalizeModel('X5 xDrive40d')).toBe('x5 xdrive40d');
  });

  it('matchKey строгий по brand+model+year+engineVolume', () => {
    const a = { brand: 'BMW', model: 'X5', year: 2021, engineVolume: 2993 };
    const b = { brand: 'BMW', model: 'X5', year: 2021, engineVolume: 3 };
    const c = { brand: 'Audi', model: 'X5', year: 2021, engineVolume: 3 };
    expect(matchKey(a)).toBe(matchKey(b));
    expect(matchKey(a)).not.toBe(matchKey(c));
  });

  it('matchKey null при отсутствии year или engineVolume', () => {
    expect(matchKey({ brand: 'BMW', model: 'X5', year: null, engineVolume: 3 })).toBeNull();
    expect(matchKey({ brand: 'BMW', model: 'X5', year: 2021, engineVolume: null })).toBeNull();
  });

  it('matchKey null при отсутствии brand или model', () => {
    expect(matchKey({ brand: null, model: 'X5', year: 2021, engineVolume: 3 })).toBeNull();
    expect(matchKey({ brand: 'BMW', model: '', year: 2021, engineVolume: 3 })).toBeNull();
  });

  it('findMatches возвращает пары только при двух источниках', () => {
    const cars = [
      { id: 1, source: 'major-expert', brand: 'BMW', model: 'X5', year: 2021, engineVolume: 3, price: 100 },
      { id: 2, source: 'rolf', brand: 'BMW', model: 'X5', year: 2021, engineVolume: 3, price: 90 },
      { id: 3, source: 'rolf', brand: 'Audi', model: 'Q7', year: 2020, engineVolume: 3, price: 80 },
    ];
    const pairs = findMatches(cars);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].carsBySource['major-expert'].id).toBe(1);
    expect(pairs[0].carsBySource['rolf'].id).toBe(2);
  });
});
