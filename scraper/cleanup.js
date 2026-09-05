import { createPool } from './db.js';

export async function runCleanup(pool, days = 90) {
  const { rowCount } = await pool.query(
    'DELETE FROM price_history WHERE date < CURRENT_DATE - $1::int',
    [days],
  );
  return rowCount;
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectRun) {
  const args = process.argv.slice(2);
  const daysArg = args.find(a => a.startsWith('--days='));
  const days = daysArg ? parseInt(daysArg.split('=')[1]) : 90;

  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL не задан — ретеншн пропущен');
    process.exit(0);
  }

  const pool = createPool(process.env.DATABASE_URL);
  runCleanup(pool, days)
    .then(removed => {
      console.log(`Cleanup: removed ${removed} price_history rows older than ${days} days`);
      return pool.end();
    })
    .catch(async err => {
      console.error('Cleanup error:', err.message);
      await pool.end();
      process.exit(1);
    });
}
