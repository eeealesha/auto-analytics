import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
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
  getHistory: ({ source }) => getHistory(pool, { source }),
  getMeta: () => getMeta(pool),
};

const app = createApp(db);

// Подстраховка: статику отдаём из Express, если dist собран.
// Штатно статику отдаёт nginx, а /api проксируется на этот сервис.
const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('/*splat', (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Auto-analytics API on http://127.0.0.1:${PORT}`);
});
