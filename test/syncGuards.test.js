// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isPartialScrape, syncableCars } from '../scraper/lib.js';

describe('isPartialScrape', () => {
  it('частичный, если хоть одна страница упала', () => {
    expect(isPartialScrape({ failedPages: 1, scraped: 2400, total: 2400 })).toBe(true);
  });

  it('полный, когда всё выкачано без ошибок', () => {
    expect(isPartialScrape({ failedPages: 0, scraped: 2400, total: 2400 })).toBe(false);
  });

  // Ключевой случай: формат пагинации у источника поменялся, lastPage выродился в 0,
  // выкачана только первая страница — ошибок нет, но деактивировать остальное нельзя.
  it('частичный, если выкачана малая доля от заявленного total', () => {
    expect(isPartialScrape({ failedPages: 0, scraped: 24, total: 2400 })).toBe(true);
  });

  it('не считает частичным, если total неизвестен', () => {
    expect(isPartialScrape({ failedPages: 0, scraped: 24, total: 0 })).toBe(false);
  });
});

describe('syncableCars', () => {
  it('отсеивает объявления без цены, не роняя весь прогон', () => {
    const cars = [
      { id: 1, price: 1000000 },
      { id: 2, price: null },
      { id: 3 },
      { id: 4, price: 0 },
      { id: 5, price: 2000000 },
    ];
    expect(syncableCars(cars).map(c => c.id)).toEqual([1, 5]);
  });
});
