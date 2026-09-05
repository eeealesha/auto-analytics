// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { delay, deduplicate } from '../scraper/lib.js';

describe('lib', () => {
  it('deduplicate убирает дубли по id', () => {
    const cars = [{ id: 1 }, { id: 2 }, { id: 1 }];
    expect(deduplicate(cars)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('delay ждёт ms', async () => {
    const t0 = Date.now();
    await delay(15);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(10);
  });
});
