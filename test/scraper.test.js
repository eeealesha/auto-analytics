// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { runMigrate } from '../scraper/migrate.js';
import { runCleanup } from '../scraper/cleanup.js';
import { initSchema } from '../scraper/db.js';

describe('runCleanup', () => {
  it('удаляет строки старше порога и возвращает счётчик', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 42 }) };
    const removed = await runCleanup(pool, 90);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('CURRENT_DATE - $1::int'), [90]);
    expect(removed).toBe(42);
  });

  const dsn = process.env.DATABASE_URL;
  const itDb = dsn ? it : it.skip;

  itDb('runCleanup вычищает старые строки и сохраняет новые (интеграция)', async () => {
    const pool = new (await import('pg')).Pool({ connectionString: dsn });
    const source = `test-purge-${Date.now()}`;
    let offerId;
    try {
      await initSchema(pool);

      const { rows: [offer] } = await pool.query(
        `INSERT INTO offers (source, source_id, brand, model, price, is_new, is_active)
         VALUES ($1, '77771', 'Toyota', 'Camry', 3000000, FALSE, TRUE)
         RETURNING id`,
        [source],
      );
      offerId = Number(offer.id);

      await pool.query(
        `INSERT INTO price_history (offer_id, date, price, old_price) VALUES
          ($1, CURRENT_DATE - 100, 2000000, NULL),
          ($1, CURRENT_DATE - 10, 3000000, NULL)
         ON CONFLICT (offer_id, date) DO UPDATE SET price = EXCLUDED.price`,
        [offerId],
      );

      const before = await pool.query('SELECT COUNT(*)::int AS n FROM price_history WHERE offer_id = $1', [offerId]);
      expect(before.rows[0].n).toBe(2);

      await runCleanup(pool, 30);

      const after = (await pool.query(
        `SELECT date::text FROM price_history WHERE offer_id = $1 ORDER BY date`,
        [offerId],
      )).rows.map(r => r.date);
      expect(after).toHaveLength(1);
      expect(after[0]).toBe(new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10));
    } finally {
      await pool.query('DELETE FROM offers WHERE source = $1', [source]);
      await pool.end();
    }
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
