import fs from 'fs';
import path from 'path';

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
};

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function ensureDirs() {
  const DATA_DIR = path.join(process.cwd(), 'data');
  const HISTORY_DIR = path.join(DATA_DIR, 'history');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
  return { DATA_DIR, HISTORY_DIR };
}

export function deduplicate(cars) {
  const seen = new Set();
  return cars.filter(car => {
    if (seen.has(car.id)) return false;
    seen.add(car.id);
    return true;
  });
}

// Доля от заявленного total, ниже которой прогон считаем неполным.
const MIN_COVERAGE = 0.5;

// Прогон неполный, если страницы падали ИЛИ выкачана малая доля от заявленного
// количества. Второе ловит смену формата пагинации у источника: ошибок нет,
// lastPage выродился в 0, и без этой проверки деактивация вычистила бы источник.
export function isPartialScrape({ failedPages = 0, scraped = 0, total = 0 } = {}) {
  if (failedPages > 0) return true;
  if (total > 0 && scraped < total * MIN_COVERAGE) return true;
  return false;
}

export function syncableCars(cars) {
  return cars.filter(car => {
    const price = Number(car.price);
    return Number.isFinite(price) && price > 0;
  });
}

export async function runPipeline({ source, fetchPage, filename, writeHistory = false, maxPages = Infinity, delayMs = 300 }) {
  const { createPool, initSchema, applySync } = await import('../data/db.js');

  ensureDirs();

  console.log('Fetching page 1 to get total...');
  const first = await fetchPage(1);
  if (first.cars.length === 0) {
    console.log('Failed to fetch page 1. Aborting.');
    return [];
  }

  const totalPages = Math.min(first.lastPage, maxPages);
  let allCars = [...first.cars];
  let failedPages = 0;
  console.log(`Total: ${first.total} cars across ${first.lastPage} pages. Scraping ${totalPages} pages...\n`);

  for (let page = 2; page <= totalPages; page++) {
    await delay(delayMs);
    const res = await fetchPage(page);
    if (!res.ok) failedPages++;
    console.log(`  Page ${page}/${totalPages}: ${res.cars.length} cars${res.ok ? '' : ' (FAILED)'}`);
    allCars = allCars.concat(res.cars);
  }

  const uniqueCars = deduplicate(allCars);
  const today = new Date().toISOString().split('T')[0];
  const { DATA_DIR, HISTORY_DIR } = ensureDirs();

  if (writeHistory) {
    const historyPath = path.join(HISTORY_DIR, `${today}.json`);
    fs.writeFileSync(historyPath, JSON.stringify(uniqueCars, null, 2));
    console.log(`History snapshot: ${historyPath}`);
  }

  const mainPath = path.join(DATA_DIR, filename);
  fs.writeFileSync(mainPath, JSON.stringify(uniqueCars, null, 2));

  if (process.env.DATABASE_URL) {
    const pool = createPool(process.env.DATABASE_URL);
    try {
      await initSchema(pool);
      const partial = isPartialScrape({ failedPages, scraped: uniqueCars.length, total: first.total });
      if (partial) {
        console.warn(`  WARNING: partial scrape (${failedPages} failed page(s), ${uniqueCars.length}/${first.total} offers) — deactivation skipped`);
      }
      const cars = syncableCars(uniqueCars);
      const skipped = uniqueCars.length - cars.length;
      if (skipped > 0) console.warn(`  WARNING: ${skipped} offer(s) without a price skipped`);
      const result = await applySync(pool, { source, cars, today, deactivate: !partial });
      console.log(`DB sync: ${result.inserted} new, ${result.updated} updated, ${result.deactivated} deactivated`);
    } finally {
      await pool.end();
    }
  } else {
    console.log(`DATABASE_URL не задан — сохранён только кэш ${filename}`);
  }

  console.log(`\nDone! Scraped ${uniqueCars.length} unique cars.`);
  console.log(`Saved to ${mainPath}`);

  return uniqueCars;
}
