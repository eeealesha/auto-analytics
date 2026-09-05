import path from 'node:path';
import fs from 'node:fs';
import { createApp } from './app.js';
import { createPool, getOffers, getHistory, getMeta } from '../scraper/db.js';

const PORT = Number(process.env.PORT || 3001);
const dsn = process.env.DATABASE_URL;

if (!dsn) {
  console.error('DATABASE_URL не задан — API не запущен');
  process.exit(1);
}

const pool = createPool(dsn);
const db = {
  getOffers: filters => getOffers(pool, filters),
  getHistory: ({ source, days }) => getHistory(pool, { source, days }),
  getMeta: () => getMeta(pool),
};

// Подстраховка: статику отдаём из Express, если dist собран.
// Штатно статику отдаёт nginx, а /api проксируется на этот сервис.
const distDir = path.join(process.cwd(), 'dist');
const app = createApp(db, { staticDir: fs.existsSync(distDir) ? distDir : undefined });

app.listen(PORT, () => {
  console.log(`Auto-analytics API on http://127.0.0.1:${PORT}`);
});
