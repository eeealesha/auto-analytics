import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { createPool, initSchema, applySync } from './db.js';
import { HEADERS, delay, ensureDirs, deduplicate } from './lib.js';

const API_URL = 'https://www.major-expert.ru/api/v1/public/cars/items-by-url';
const DELAY_MS = 300;
const DATA_DIR = path.join(process.cwd(), 'data');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const PER_PAGE = 12;

function normalizeCar(item) {
  const ch = item.characteristics || {};
  return {
    id: item.id,
    brand: item.brandName,
    model: item.modelName,
    name: item.name,
    year: ch.year?.value || null,
    mileage: ch.run?.value || null,
    bodyType: ch.body?.value || null,
    fuelType: ch.engine?.value || null,
    engineVolume: ch.engineCapacity ? parseFloat(ch.engineCapacity.value) : null,
    horsepower: ch.enginePower?.value || null,
    transmission: ch.gearbox?.value || null,
    driveType: ch.driveType?.value || null,
    color: ch.color?.value || null,
    owners: ch.owners?.value || null,
    price: item.price,
    oldPrice: item.hasDiscount ? item.fullPrice : null,
    url: item.url ? `https://www.major-expert.ru${item.url}` : null,
    image: item.media?.[0]?.image?.md || null,
    isNew: item.isNew || false,
  };
}

async function fetchPage(page) {
  try {
    const response = await axios.post(API_URL, {
      url: '/cars/moscow/',
      page,
      perPage: PER_PAGE,
      orderBy: 'popular',
    }, { headers: HEADERS, timeout: 15000 });

    const data = response.data?.data;
    if (!data?.items) return { cars: [], total: 0, lastPage: 0, ok: false };

    return {
      cars: data.items.map(normalizeCar),
      total: data.pagination?.total || 0,
      lastPage: data.pagination?.lastPage || 0,
      ok: true,
    };
  } catch (error) {
    console.log(`  Error on page ${page} (${error.message}). Retrying...`);
    await delay(DELAY_MS * 2);
    try {
      const response = await axios.post(API_URL, {
        url: '/cars/moscow/',
        page,
        perPage: PER_PAGE,
        orderBy: 'popular',
      }, { headers: HEADERS, timeout: 15000 });

      const data = response.data?.data;
      if (!data?.items) return { cars: [], total: 0, lastPage: 0, ok: false };

      return {
        cars: data.items.map(normalizeCar),
        total: data.pagination?.total || 0,
        lastPage: data.pagination?.lastPage || 0,
        ok: true,
      };
    } catch (error) {
      console.log(`  Error on page ${page} (${error.message}). Giving up.`);
      return { cars: [], total: 0, lastPage: 0, ok: false };
    }
  }
}

async function scrapeAll(maxPages = Infinity) {
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
    await delay(DELAY_MS);
    const res = await fetchPage(page);
    if (!res.ok) failedPages++;
    console.log(`  Page ${page}/${totalPages}: ${res.cars.length} cars${res.ok ? '' : ' (FAILED)'}`);
    allCars = allCars.concat(res.cars);
  }

  const uniqueCars = deduplicate(allCars);

  const today = new Date().toISOString().split('T')[0];
  const historyPath = path.join(HISTORY_DIR, `${today}.json`);
  fs.writeFileSync(historyPath, JSON.stringify(uniqueCars, null, 2));

  const mainPath = path.join(DATA_DIR, 'cars.json');
  fs.writeFileSync(mainPath, JSON.stringify(uniqueCars, null, 2));

  if (process.env.DATABASE_URL) {
    const pool = createPool(process.env.DATABASE_URL);
    try {
      await initSchema(pool);
      const partial = failedPages > 0;
      if (partial) {
        console.warn(`  WARNING: ${failedPages} page(s) failed — partial data, deactivation skipped`);
      }
      const result = await applySync(pool, { source: 'major-expert', cars: uniqueCars, today, deactivate: !partial });
      console.log(`DB sync: ${result.inserted} new, ${result.updated} updated, ${result.deactivated} deactivated`);
    } finally {
      await pool.end();
    }
  } else {
    console.log('DATABASE_URL не задан — сохранён только кэш cars.json');
  }

  console.log(`\nDone! Scraped ${uniqueCars.length} unique cars.`);
  console.log(`Saved to ${mainPath}`);
  console.log(`History snapshot: ${historyPath}`);

  return uniqueCars;
}

const args = process.argv.slice(2);
const pagesArg = args.find(a => a.startsWith('--pages='));
const maxPages = pagesArg ? parseInt(pagesArg.split('=')[1]) : Infinity;

scrapeAll(maxPages).catch(console.error);
