// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { runMigrate } from '../scraper/migrate.js';
import { runCleanup } from '../scraper/cleanup.js';

describe('runCleanup', () => {
  it('удаляет строки старше порога и возвращает счётчик', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 42 }) };
    const removed = await runCleanup(pool, 90);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM price_history'), [90]);
    expect(removed).toBe(42);
  });
});

describe('runMigrate', () => {
  it('вызывает initSchema и закрывает пул', async () => {
    const initSchema = vi.fn().mockResolvedValue(undefined);
    const pool = { end: vi.fn().mockResolvedValue(undefined) };
    await runMigrate(pool, initSchema);
    expect(initSchema).toHaveBeenCalledWith(pool);
    expect(pool.end).toHaveBeenCalled();
  });
});
