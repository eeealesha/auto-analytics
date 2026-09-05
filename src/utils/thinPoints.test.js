// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { thinPoints, thinSeries } from './thinPoints.js';

describe('thinPoints', () => {
  const pts = Array.from({ length: 100 }, (_, i) => ({ i }));

  it('возвращает точки без изменений до cap', () => {
    const out = thinPoints(pts, 200);
    expect(out).toHaveLength(100);
  });

  it('урезает и сохраняет первую и последнюю точку', () => {
    const out = thinPoints(pts, 10);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out[0].i).toBe(0);
    expect(out[out.length - 1].i).toBe(99);
  });

  it('детерминирован', () => {
    expect(thinPoints(pts, 10)).toEqual(thinPoints(pts, 10));
  });
});

describe('thinSeries', () => {
  it('не трогает серии в пределах лимита', () => {
    const series = [{ brand: 'A', data: [{ i: 1 }] }];
    expect(thinSeries(series, 2000)).toBe(series);
  });
});
