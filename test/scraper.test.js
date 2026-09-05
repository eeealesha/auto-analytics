// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { runMigrate } from '../scraper/migrate.js';

describe('runMigrate', () => {
  it('вызывает initSchema и закрывает пул', async () => {
    const initSchema = vi.fn().mockResolvedValue(undefined);
    const pool = { end: vi.fn().mockResolvedValue(undefined) };
    await runMigrate(pool, initSchema);
    expect(initSchema).toHaveBeenCalledWith(pool);
    expect(pool.end).toHaveBeenCalled();
  });
});
